//! Sign in to the 레드롭 account with redrob-auth.
//!
//! The browser is a public OAuth client of https://auth.redrob.io, registered
//! as `redrob-browser`: authorization code with PKCE (S256) and no secret.
//! redrob-auth matches redirect URIs exactly, so three loopback ports are
//! registered and tried in order: 127.0.0.1:47813, 47814, 47815 with path
//! /oauth2/callback. The refresh token goes to the OS credential store; the
//! profile keeps only the name and email to show.

use std::io::{BufRead, BufReader, Write};
use std::net::TcpListener;
use std::sync::mpsc::Sender;
use std::time::Duration;

use base64::Engine as _;
use sha2::{Digest, Sha256};

pub const ISSUER: &str = "https://auth.redrob.io";
pub const CLIENT_ID: &str = "redrob-browser";
const PORTS: [u16; 3] = [47813, 47814, 47815];
const SERVICE: &str = "Redrob Browser";
const REFRESH_ACCOUNT: &str = "account-refresh";

pub enum Msg {
    /// Open this page in a tab so the person can sign in.
    Open(String),
    SignedIn { name: String, email: String },
    Failed(String),
}

/// Run the whole sign-in on a background thread, reporting through `tx`.
pub fn sign_in(tx: Sender<Msg>) {
    std::thread::spawn(move || {
        let result = flow(&tx);
        if let Err(e) = result {
            let _ = tx.send(Msg::Failed(e.to_string()));
        }
    });
}

fn flow(tx: &Sender<Msg>) -> anyhow::Result<()> {
    let (listener, port) = PORTS
        .iter()
        .find_map(|p| TcpListener::bind(("127.0.0.1", *p)).ok().map(|l| (l, *p)))
        .ok_or_else(|| anyhow::anyhow!("ports 47813 to 47815 are all in use"))?;
    let redirect = format!("http://127.0.0.1:{port}/oauth2/callback");

    let verifier = random_url_token(32)?;
    let challenge = b64(&Sha256::digest(verifier.as_bytes()));
    let state = random_url_token(16)?;
    let authorize = format!(
        "{ISSUER}/oauth/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&state={state}&code_challenge={challenge}&code_challenge_method=S256",
        enc(CLIENT_ID),
        enc(&redirect),
        enc("openid profile email"),
    );
    tx.send(Msg::Open(authorize))?;

    let code = wait_for_code(&listener, &state)?;
    let token: serde_json::Value = ureq::post(&format!("{ISSUER}/oauth/token"))
        .timeout(Duration::from_secs(30))
        .send_form(&[
            ("grant_type", "authorization_code"),
            ("code", &code),
            ("redirect_uri", &redirect),
            ("client_id", CLIENT_ID),
            ("code_verifier", &verifier),
        ])
        .map_err(|e| anyhow::anyhow!("token request: {e}"))?
        .into_json()?;
    let access = token["access_token"].as_str().ok_or_else(|| anyhow::anyhow!("no access token in the reply"))?;
    if let Some(refresh) = token["refresh_token"].as_str() {
        keyring::Entry::new(SERVICE, REFRESH_ACCOUNT)
            .and_then(|e| e.set_password(refresh))
            .map_err(|e| anyhow::anyhow!("OS credential store: {e}"))?;
    }
    let me: serde_json::Value = ureq::get(&format!("{ISSUER}/oauth/userinfo"))
        .set("Authorization", &format!("Bearer {access}"))
        .timeout(Duration::from_secs(30))
        .call()
        .map_err(|e| anyhow::anyhow!("userinfo: {e}"))?
        .into_json()?;
    tx.send(Msg::SignedIn {
        name: me["name"].as_str().unwrap_or_default().to_string(),
        email: me["email"].as_str().unwrap_or_default().to_string(),
    })?;
    Ok(())
}

/// Accept connections until the callback with our state arrives (5 minutes at most).
fn wait_for_code(listener: &TcpListener, state: &str) -> anyhow::Result<String> {
    listener.set_nonblocking(false)?;
    let deadline = std::time::Instant::now() + Duration::from_secs(300);
    while std::time::Instant::now() < deadline {
        let (mut stream, peer) = listener.accept()?;
        if !peer.ip().is_loopback() {
            continue;
        }
        stream.set_read_timeout(Some(Duration::from_secs(10)))?;
        let mut line = String::new();
        BufReader::new(&stream).read_line(&mut line)?;
        let target = line.split_whitespace().nth(1).unwrap_or("");
        let Ok(u) = url::Url::parse(&format!("http://127.0.0.1{target}")) else { continue };
        if u.path() != "/oauth2/callback" {
            let _ = stream.write_all(b"HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
            continue;
        }
        let q: std::collections::HashMap<String, String> = u.query_pairs().into_owned().collect();
        let page = |body: &str| {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
        };
        if q.get("state").map(String::as_str) != Some(state) {
            let _ = stream.write_all(page("<p>This sign-in link does not belong to this browser.</p>").as_bytes());
            continue;
        }
        if let Some(err) = q.get("error") {
            let _ = stream.write_all(page("<p>Sign-in was cancelled.</p>").as_bytes());
            anyhow::bail!("{err}");
        }
        if let Some(code) = q.get("code") {
            let _ = stream.write_all(page("<p>Signed in. You can close this tab.</p>").as_bytes());
            return Ok(code.clone());
        }
    }
    anyhow::bail!("sign-in timed out")
}

/// Forget the account: the refresh token and the shown name.
pub fn sign_out() {
    if let Ok(e) = keyring::Entry::new(SERVICE, REFRESH_ACCOUNT) {
        let _ = e.delete_credential();
    }
}

fn random_url_token(bytes: usize) -> anyhow::Result<String> {
    let mut buf = vec![0u8; bytes];
    getrandom::fill(&mut buf).map_err(|e| anyhow::anyhow!("random: {e}"))?;
    Ok(b64(&buf))
}

fn b64(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}

fn enc(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}
