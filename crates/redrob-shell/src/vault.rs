//! The password vault. Rules: docs/CREDENTIALS.md.
//!
//! One random 256-bit key lives in the OS credential store (Keychain,
//! Windows Credential Manager, Secret Service). Each password is sealed with
//! AES-256-GCM under that key in `vault.sqlite` next to the profile. Without
//! the OS store the vault does not open: there is no plaintext fallback.
//!
//! Nothing here hands a password to the agent. Callers get usernames and
//! outcomes; the only way a secret leaves this module is `secret_for_fill`,
//! which the window passes straight into the page's form fields.

use std::path::Path;
use std::time::{Duration, Instant};

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use rusqlite::{params, Connection, OptionalExtension};
use zeroize::Zeroizing;

const SERVICE: &str = "Redrob Browser";
const KEY_ACCOUNT: &str = "vault-key";
const AUDIT_KEEP: i64 = 500;

pub struct LoginSummary {
    pub id: i64,
    pub username: String,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AgentPolicy {
    /// The agent may sign in on any site not blocked.
    Always,
    /// Only for a while after the person unlocked the vault (default).
    WhileUnlocked,
    /// The agent never signs in; the tool is not offered.
    Never,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Actor {
    Person,
    Agent,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Refusal {
    Locked,
    Blocked,
    Never,
    NoLogin,
    SeveralLogins,
}

pub struct Vault {
    db: Connection,
    cipher: Aes256Gcm,
    unlocked_until: Option<Instant>,
}

impl Vault {
    pub fn open(profile_dir: &Path) -> anyhow::Result<Self> {
        let key = master_key()?;
        let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key[..]));
        let db = Connection::open(profile_dir.join("vault.sqlite"))?;
        db.execute_batch(
            "PRAGMA journal_mode = WAL;
             CREATE TABLE IF NOT EXISTS logins (
                 id INTEGER PRIMARY KEY,
                 origin TEXT NOT NULL,
                 username TEXT NOT NULL,
                 nonce BLOB NOT NULL,
                 secret BLOB NOT NULL,
                 created INTEGER NOT NULL,
                 last_used INTEGER,
                 UNIQUE(origin, username)
             );
             CREATE TABLE IF NOT EXISTS site_rules (
                 origin TEXT PRIMARY KEY,
                 rule TEXT NOT NULL CHECK (rule IN ('allow', 'block'))
             );
             CREATE TABLE IF NOT EXISTS audit (
                 id INTEGER PRIMARY KEY,
                 time INTEGER NOT NULL,
                 origin TEXT NOT NULL,
                 username TEXT NOT NULL,
                 actor TEXT NOT NULL,
                 outcome TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS vault_settings (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );",
        )?;
        Ok(Self { db, cipher, unlocked_until: None })
    }

    /// Save or replace the password for `username` on `origin`.
    pub fn save(&self, origin: &str, username: &str, password: &str) -> anyhow::Result<()> {
        let mut nonce = [0u8; 12];
        getrandom::fill(&mut nonce).map_err(|e| anyhow::anyhow!("random: {e}"))?;
        let sealed = self
            .cipher
            .encrypt(Nonce::from_slice(&nonce), password.as_bytes())
            .map_err(|_| anyhow::anyhow!("could not seal the password"))?;
        self.db.execute(
            "INSERT INTO logins (origin, username, nonce, secret, created) VALUES (?1, ?2, ?3, ?4, ?5)
             ON CONFLICT(origin, username) DO UPDATE SET nonce = excluded.nonce, secret = excluded.secret",
            params![origin, username, &nonce[..], sealed, crate::model::now() as i64],
        )?;
        Ok(())
    }

    pub fn has_login(&self, origin: &str, username: &str) -> bool {
        self.db
            .query_row("SELECT 1 FROM logins WHERE origin = ?1 AND username = ?2", params![origin, username], |_| Ok(()))
            .optional()
            .ok()
            .flatten()
            .is_some()
    }

    /// Usernames saved for exactly this origin. Never a password.
    pub fn logins_for(&self, origin: &str) -> Vec<LoginSummary> {
        let Ok(mut q) = self.db.prepare("SELECT id, username FROM logins WHERE origin = ?1 ORDER BY last_used DESC, username")
        else {
            return Vec::new();
        };
        q.query_map(params![origin], |r| Ok(LoginSummary { id: r.get(0)?, username: r.get(1)? }))
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    pub fn all_origins(&self) -> Vec<(String, i64)> {
        let Ok(mut q) = self.db.prepare("SELECT origin, count(*) FROM logins GROUP BY origin ORDER BY origin") else {
            return Vec::new();
        };
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    pub fn delete(&self, id: i64) -> anyhow::Result<()> {
        self.db.execute("DELETE FROM logins WHERE id = ?1", params![id])?;
        Ok(())
    }

    /// The person's unlock. On macOS and Windows this follows an OS
    /// re-authentication; on Linux, which has no device authenticator, the
    /// person's own click in the window is the unlock.
    pub fn unlock(&mut self) {
        self.unlocked_until = Some(Instant::now() + Duration::from_secs(60 * self.unlock_minutes()));
    }

    pub fn lock(&mut self) {
        self.unlocked_until = None;
    }

    pub fn is_unlocked(&self) -> bool {
        self.unlocked_until.is_some_and(|t| Instant::now() < t)
    }

    pub fn agent_policy(&self) -> AgentPolicy {
        match self.setting("agent_policy").as_deref() {
            Some("always") => AgentPolicy::Always,
            Some("never") => AgentPolicy::Never,
            _ => AgentPolicy::WhileUnlocked,
        }
    }

    pub fn set_agent_policy(&self, p: AgentPolicy) -> anyhow::Result<()> {
        let v = match p {
            AgentPolicy::Always => "always",
            AgentPolicy::WhileUnlocked => "while_unlocked",
            AgentPolicy::Never => "never",
        };
        self.set_setting("agent_policy", v)
    }

    pub fn unlock_minutes(&self) -> u64 {
        self.setting("unlock_minutes").and_then(|v| v.parse().ok()).filter(|m| *m > 0).unwrap_or(15)
    }

    pub fn site_rule(&self, origin: &str) -> Option<String> {
        self.db
            .query_row("SELECT rule FROM site_rules WHERE origin = ?1", params![origin], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }

    /// `rule` is "allow", "block", or None to clear.
    pub fn set_site_rule(&self, origin: &str, rule: Option<&str>) -> anyhow::Result<()> {
        match rule {
            Some(r) => self.db.execute(
                "INSERT INTO site_rules (origin, rule) VALUES (?1, ?2) ON CONFLICT(origin) DO UPDATE SET rule = excluded.rule",
                params![origin, r],
            )?,
            None => self.db.execute("DELETE FROM site_rules WHERE origin = ?1", params![origin])?,
        };
        Ok(())
    }

    /// May the agent sign in on `origin` right now? Block beats everything,
    /// allow skips the unlock, never turns the tool off.
    pub fn agent_may_fill(&self, origin: &str) -> Result<(), Refusal> {
        let rule = self.site_rule(origin);
        if rule.as_deref() == Some("block") {
            return Err(Refusal::Blocked);
        }
        match self.agent_policy() {
            AgentPolicy::Never => Err(Refusal::Never),
            AgentPolicy::Always => Ok(()),
            AgentPolicy::WhileUnlocked if rule.as_deref() == Some("allow") || self.is_unlocked() => Ok(()),
            AgentPolicy::WhileUnlocked => Err(Refusal::Locked),
        }
    }

    /// The one login the agent would use on `origin`, after the policy check.
    pub fn agent_login(&self, origin: &str, wanted: Option<&str>) -> Result<LoginSummary, Refusal> {
        self.agent_may_fill(origin)?;
        let mut logins = self.logins_for(origin);
        if let Some(name) = wanted {
            logins.retain(|l| l.username == name);
        }
        match logins.len() {
            0 => Err(Refusal::NoLogin),
            1 => Ok(logins.remove(0)),
            _ => Err(Refusal::SeveralLogins),
        }
    }

    /// Unseal a password to type it into the page. Only for the origin it was
    /// saved for; every use is audited.
    pub fn secret_for_fill(&self, id: i64, origin: &str, actor: Actor) -> anyhow::Result<(String, Zeroizing<String>)> {
        let (saved_origin, username, nonce, sealed): (String, String, Vec<u8>, Vec<u8>) = self.db.query_row(
            "SELECT origin, username, nonce, secret FROM logins WHERE id = ?1",
            params![id],
            |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)),
        )?;
        if saved_origin != origin {
            self.audit(origin, &username, actor, "refused: different site");
            anyhow::bail!("this login belongs to a different site");
        }
        let plain = self
            .cipher
            .decrypt(Nonce::from_slice(&nonce), sealed.as_ref())
            .map_err(|_| anyhow::anyhow!("the saved password could not be opened"))?;
        let password = Zeroizing::new(String::from_utf8(plain).map_err(|_| anyhow::anyhow!("bad password data"))?);
        self.db.execute("UPDATE logins SET last_used = ?2 WHERE id = ?1", params![id, crate::model::now() as i64])?;
        self.audit(origin, &username, actor, "filled");
        Ok((username, password))
    }

    pub fn audit(&self, origin: &str, username: &str, actor: Actor, outcome: &str) {
        let actor = match actor {
            Actor::Person => "person",
            Actor::Agent => "agent",
        };
        let _ = self.db.execute(
            "INSERT INTO audit (time, origin, username, actor, outcome) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![crate::model::now() as i64, origin, username, actor, outcome],
        );
        let _ = self.db.execute(
            "DELETE FROM audit WHERE id NOT IN (SELECT id FROM audit ORDER BY id DESC LIMIT ?1)",
            params![AUDIT_KEEP],
        );
    }

    /// Agent sign-in history, newest first: (time, origin, username, outcome).
    pub fn agent_history(&self, limit: u32) -> Vec<(u64, String, String, String)> {
        let Ok(mut q) = self
            .db
            .prepare("SELECT time, origin, username, outcome FROM audit WHERE actor = 'agent' ORDER BY id DESC LIMIT ?1")
        else {
            return Vec::new();
        };
        q.query_map(params![limit], |r| Ok((r.get::<_, i64>(0)? as u64, r.get(1)?, r.get(2)?, r.get(3)?)))
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    fn setting(&self, key: &str) -> Option<String> {
        self.db
            .query_row("SELECT value FROM vault_settings WHERE key = ?1", params![key], |r| r.get(0))
            .optional()
            .ok()
            .flatten()
    }

    fn set_setting(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.db.execute(
            "INSERT INTO vault_settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

/// The vault key from the OS credential store, created on first use.
fn master_key() -> anyhow::Result<Zeroizing<Vec<u8>>> {
    let entry = keyring::Entry::new(SERVICE, KEY_ACCOUNT).map_err(|e| anyhow::anyhow!("OS credential store: {e}"))?;
    match entry.get_secret() {
        Ok(k) if k.len() == 32 => Ok(Zeroizing::new(k)),
        Ok(_) => anyhow::bail!("the vault key in the OS credential store is damaged"),
        Err(keyring::Error::NoEntry) => {
            let mut k = Zeroizing::new(vec![0u8; 32]);
            getrandom::fill(&mut k[..]).map_err(|e| anyhow::anyhow!("random: {e}"))?;
            entry.set_secret(&k).map_err(|e| anyhow::anyhow!("OS credential store: {e}"))?;
            Ok(k)
        }
        Err(e) => anyhow::bail!("OS credential store: {e}"),
    }
}

/// `scheme://host[:port]` of a URL; the key logins are matched by.
pub fn origin_of(url: &str) -> Option<String> {
    let u = url::Url::parse(url).ok()?;
    match u.scheme() {
        "http" | "https" => Some(u.origin().ascii_serialization()),
        _ => None,
    }
}
