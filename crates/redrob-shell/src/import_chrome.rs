//! Import from Chrome and other Chromium-family browsers by reading their
//! profile files directly: `Bookmarks` (JSON) and `History` (SQLite).
//!
//! Files are copied before reading, because the browser may be running and
//! holding them locked. Saved passwords and cookies are encrypted with a key
//! the OS keeps; they go through the password vault, not this module.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde_json::Value;

use crate::model::{Bookmark, HistoryEntry};

/// Seconds between 1601-01-01 (Chrome's epoch) and 1970-01-01.
const WINDOWS_TO_UNIX_SECS: i64 = 11_644_473_600;

pub struct Source {
    pub name: &'static str,
    pub profile: PathBuf,
}

#[derive(Default)]
pub struct Imported {
    pub bookmarks: Vec<Bookmark>,
    pub history: Vec<HistoryEntry>,
}

/// Chromium-family profiles present on this machine, Chrome first.
pub fn sources() -> Vec<Source> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default();
    let candidates: Vec<(&'static str, PathBuf)> = if cfg!(target_os = "macos") {
        let base = home.join("Library").join("Application Support");
        vec![
            ("Chrome", base.join("Google/Chrome")),
            ("Chromium", base.join("Chromium")),
            ("Edge", base.join("Microsoft Edge")),
            ("Brave", base.join("BraveSoftware/Brave-Browser")),
        ]
    } else if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData/Local"));
        vec![
            ("Chrome", local.join("Google/Chrome/User Data")),
            ("Chromium", local.join("Chromium/User Data")),
            ("Edge", local.join("Microsoft/Edge/User Data")),
            ("Brave", local.join("BraveSoftware/Brave-Browser/User Data")),
        ]
    } else {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| home.join(".config"));
        vec![
            ("Chrome", config.join("google-chrome")),
            ("Chromium", config.join("chromium")),
            ("Edge", config.join("microsoft-edge")),
            ("Brave", config.join("BraveSoftware/Brave-Browser")),
        ]
    };
    candidates
        .into_iter()
        .map(|(name, dir)| Source { name, profile: dir.join("Default") })
        .filter(|s| s.profile.join("Bookmarks").exists() || s.profile.join("History").exists())
        .collect()
}

/// Read bookmarks and history from `source`, using `scratch` for copies.
pub fn import(source: &Source, scratch: &Path) -> anyhow::Result<Imported> {
    std::fs::create_dir_all(scratch)?;
    let mut out = Imported::default();
    let bookmarks = source.profile.join("Bookmarks");
    if bookmarks.exists() {
        let text = std::fs::read_to_string(&bookmarks)?;
        let json: Value = serde_json::from_str(&text)?;
        let roots = &json["roots"];
        let folder = format!("Imported from {}", source.name);
        // The bookmarks bar stays the bookmarks bar; everything else goes in a folder.
        walk(&roots["bookmark_bar"], "", &mut out.bookmarks);
        walk(&roots["other"], &folder, &mut out.bookmarks);
        walk(&roots["synced"], &format!("{folder}/Mobile"), &mut out.bookmarks);
    }
    let history = source.profile.join("History");
    if history.exists() {
        out.history = read_history(&history, scratch)?;
    }
    Ok(out)
}

/// A saved login read from another browser: (origin, username, password).
pub type ImportedLogin = (String, String, zeroize::Zeroizing<String>);

/// Read saved passwords from `source`'s `Login Data`.
///
/// macOS: the key is "Chrome Safe Storage" in the Keychain (the OS asks the
/// person first). Linux: `v10` values use Chromium's fixed fallback key;
/// `v11` values need the Secret Service entry Chromium writes under its own
/// schema, which this build does not read yet. Windows: DPAPI and, since
/// Chrome 127, app-bound encryption that no other program can open. Where a
/// value cannot be opened the caller is told to use a CSV export instead.
pub fn import_passwords(source: &Source, scratch: &Path) -> anyhow::Result<(Vec<ImportedLogin>, usize)> {
    if cfg!(windows) {
        anyhow::bail!("{} encrypts passwords so only it can read them. Export them from its password settings as a CSV file, then import that file.", source.name);
    }
    let path = source.profile.join("Login Data");
    std::fs::create_dir_all(scratch)?;
    let copy = scratch.join("Login Data");
    std::fs::copy(&path, &copy)?;
    let key = chrome_key(source)?;
    let db = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_ONLY)?;
    let mut q = db.prepare(
        "SELECT origin_url, username_value, password_value FROM logins WHERE blacklisted_by_user = 0",
    )?;
    let rows: Vec<(String, String, Vec<u8>)> =
        q.query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?.collect::<Result<_, _>>()?;
    drop(q);
    drop(db);
    let _ = std::fs::remove_file(&copy);
    let mut out = Vec::new();
    let mut skipped = 0;
    for (url, username, blob) in rows {
        let Some(origin) = crate::vault::origin_of(&url) else { continue };
        match decrypt_v10(&key, &blob) {
            Some(p) => out.push((origin, username, p)),
            None => skipped += 1,
        }
    }
    Ok((out, skipped))
}

fn chrome_key(source: &Source) -> anyhow::Result<zeroize::Zeroizing<[u8; 16]>> {
    use pbkdf2::pbkdf2_hmac;
    let (secret, rounds) = if cfg!(target_os = "macos") {
        let (service, account) = match source.name {
            "Chromium" => ("Chromium Safe Storage", "Chromium"),
            "Edge" => ("Microsoft Edge Safe Storage", "Microsoft Edge"),
            "Brave" => ("Brave Safe Storage", "Brave"),
            _ => ("Chrome Safe Storage", "Chrome"),
        };
        let entry = keyring::Entry::new(service, account).map_err(|e| anyhow::anyhow!("Keychain: {e}"))?;
        let pw = entry.get_password().map_err(|e| anyhow::anyhow!("Keychain: {e}"))?;
        (zeroize::Zeroizing::new(pw.into_bytes()), 1003)
    } else {
        (zeroize::Zeroizing::new(b"peanuts".to_vec()), 1)
    };
    let mut key = zeroize::Zeroizing::new([0u8; 16]);
    pbkdf2_hmac::<sha1::Sha1>(&secret, b"saltysalt", rounds, &mut key[..]);
    Ok(key)
}

/// `v10` + AES-128-CBC with a 16-space IV and PKCS#7 padding.
fn decrypt_v10(key: &[u8; 16], blob: &[u8]) -> Option<zeroize::Zeroizing<String>> {
    use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, KeyIvInit};
    let body = blob.strip_prefix(b"v10")?;
    let mut buf = zeroize::Zeroizing::new(body.to_vec());
    let iv = [b' '; 16];
    let plain = cbc::Decryptor::<aes::Aes128>::new(key.into(), &iv.into()).decrypt_padded_mut::<Pkcs7>(&mut buf).ok()?;
    String::from_utf8(plain.to_vec()).ok().map(zeroize::Zeroizing::new)
}

/// Chrome's password export: `name,url,username,password[,note]` with a header row.
pub fn import_passwords_csv(path: &Path) -> anyhow::Result<Vec<ImportedLogin>> {
    let text = zeroize::Zeroizing::new(std::fs::read_to_string(path)?);
    let mut rows = parse_csv(&text).into_iter();
    let header: Vec<String> = rows.next().unwrap_or_default().into_iter().map(|h| h.to_ascii_lowercase()).collect();
    let col = |n: &str| header.iter().position(|h| h == n);
    let (Some(url), Some(user), Some(pass)) = (col("url"), col("username"), col("password")) else {
        anyhow::bail!("not a password export: it needs url, username and password columns");
    };
    let mut out = Vec::new();
    for row in rows {
        let (Some(u), Some(name), Some(p)) = (row.get(url), row.get(user), row.get(pass)) else { continue };
        if let Some(origin) = crate::vault::origin_of(u) {
            if !p.is_empty() {
                out.push((origin, name.clone(), zeroize::Zeroizing::new(p.clone())));
            }
        }
    }
    Ok(out)
}

/// RFC 4180: quoted fields, doubled quotes, newlines inside quotes.
fn parse_csv(text: &str) -> Vec<Vec<String>> {
    let mut rows = Vec::new();
    let mut row = Vec::new();
    let mut field = String::new();
    let mut quoted = false;
    let mut chars = text.chars().peekable();
    while let Some(c) = chars.next() {
        match (c, quoted) {
            ('"', true) if chars.peek() == Some(&'"') => {
                field.push('"');
                chars.next();
            }
            ('"', true) => quoted = false,
            ('"', false) if field.is_empty() => quoted = true,
            (',', false) => row.push(std::mem::take(&mut field)),
            ('\n', false) => {
                row.push(std::mem::take(&mut field));
                rows.push(std::mem::take(&mut row));
            }
            ('\r', false) => {}
            (c, _) => field.push(c),
        }
    }
    if !field.is_empty() || !row.is_empty() {
        row.push(field);
        rows.push(row);
    }
    rows
}

fn walk(node: &Value, folder: &str, out: &mut Vec<Bookmark>) {
    let Some(children) = node["children"].as_array() else { return };
    for child in children {
        let name = child["name"].as_str().unwrap_or_default();
        match child["type"].as_str() {
            Some("url") => {
                if let Some(url) = child["url"].as_str() {
                    out.push(Bookmark { url: url.to_string(), title: name.to_string(), folder: folder.to_string() });
                }
            }
            Some("folder") => {
                let path = if folder.is_empty() { name.to_string() } else { format!("{folder}/{name}") };
                walk(child, &path, out);
            }
            _ => {}
        }
    }
}

fn read_history(path: &Path, scratch: &Path) -> anyhow::Result<Vec<HistoryEntry>> {
    let copy = scratch.join("History");
    std::fs::copy(path, &copy)?;
    // A running browser keeps recent writes in the WAL; copy it too when present.
    let wal = path.with_file_name("History-wal");
    let wal_copy = scratch.join("History-wal");
    let _ = std::fs::remove_file(&wal_copy);
    if wal.exists() {
        let _ = std::fs::copy(&wal, &wal_copy);
    }
    let db = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    let mut q = db.prepare(
        "SELECT url, title, visit_count, last_visit_time FROM urls
         WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT 50000",
    )?;
    let rows = q
        .query_map([], |r| {
            let micros: i64 = r.get(3)?;
            Ok(HistoryEntry {
                url: r.get(0)?,
                title: r.get(1)?,
                visits: r.get::<_, i64>(2)?.max(1) as u32,
                last_visit: (micros / 1_000_000 - WINDOWS_TO_UNIX_SECS).max(0) as u64,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(q);
    drop(db);
    let _ = std::fs::remove_file(&copy);
    let _ = std::fs::remove_file(&wal_copy);
    let _ = std::fs::remove_file(scratch.join("History-shm"));
    Ok(rows)
}
