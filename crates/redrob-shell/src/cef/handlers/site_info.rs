//! What the window's page info bubble shows about the page on screen (the
//! lock icon in the address bar, docs/CHROME-FEATURES.md): whether the
//! connection is secure, and the site's certificate for the certificate
//! viewer. Chrome's own page info bubble hangs off its location bar, which
//! a Chrome style page in the window does not have, and CEF has no command
//! for it, so the window draws both from what CEF reports of the page's
//! connection (`CefSSLStatus`, `CefX509Certificate`).

use cef::*;
use sha1::Digest as _;

/// The page's connection.
#[derive(Clone, Debug, Default)]
pub struct SiteInfo {
    /// The page's address.
    pub url: String,
    /// Over TLS with a certificate.
    pub secure: bool,
    /// Chromium found something wrong with the certificate (the page loads
    /// only past its warning).
    pub cert_error: bool,
    /// Mixed content: the page loaded something over plain HTTP.
    pub mixed: bool,
    pub cert: Option<Certificate>,
}

/// One certificate, as the viewer shows it.
#[derive(Clone, Debug, Default)]
pub struct Certificate {
    pub subject: Name,
    pub issuer: Name,
    /// Hex, bytes apart by colons.
    pub serial: String,
    /// `YYYY-MM-DD HH:MM UTC`.
    pub valid_from: String,
    pub valid_until: String,
    pub sha256: String,
    pub sha1: String,
    /// The certificate and the chain above it, PEM, to copy.
    pub pem: String,
    /// SHA-256 of each certificate above it, nearest first.
    pub chain: Vec<String>,
}

#[derive(Clone, Debug, Default)]
pub struct Name {
    pub common_name: String,
    pub organization: String,
    pub country: String,
}

/// The connection of the page `browser` shows now. Call on CEF's UI thread.
pub fn of(browser: &Browser) -> SiteInfo {
    let Some(entry) = browser.host().and_then(|h| h.visible_navigation_entry()) else {
        return SiteInfo::default();
    };
    let url = CefString::from(&entry.url()).to_string();
    let Some(ssl) = entry.sslstatus() else {
        return SiteInfo {
            url,
            ..Default::default()
        };
    };
    let bits = cert_status(&ssl);
    let content = content_status(&ssl);
    let cert = ssl.x509_certificate().map(|c| certificate(&c));
    SiteInfo {
        secure: ssl.is_secure_connection() == 1 && cert.is_some(),
        // Errors only: CERT_STATUS_ALL_ERRORS in Chromium (net/cert/cert_status_flags.h)
        // is the low 16 bits minus the two revocation-check ones.
        cert_error: bits & 0xFFFF & !(16 | 32) != 0,
        mixed: content != 0,
        url,
        cert,
    }
}

/// `CefSSLStatus::GetCertStatus` as its bits: the binding's enum holds one
/// flag, the value is several.
fn cert_status(ssl: &Sslstatus) -> u32 {
    let raw = ssl.get_raw();
    // SAFETY: `raw` is the live status CEF gave us; the C function returns
    // a `cef_cert_status_t`, a 32-bit flag set, read here as the integer it
    // is instead of as one enum value.
    unsafe {
        let Some(f) = (*raw).get_cert_status else {
            return 0;
        };
        let f: unsafe extern "C" fn(*mut sys::_cef_sslstatus_t) -> u32 = std::mem::transmute(f);
        f(raw)
    }
}

fn content_status(ssl: &Sslstatus) -> u32 {
    let raw = ssl.get_raw();
    // SAFETY: as in `cert_status`; `cef_ssl_content_status_t` is a flag set.
    unsafe {
        let Some(f) = (*raw).get_content_status else {
            return 0;
        };
        let f: unsafe extern "C" fn(*mut sys::_cef_sslstatus_t) -> u32 = std::mem::transmute(f);
        f(raw)
    }
}

fn bytes(v: Option<BinaryValue>) -> Vec<u8> {
    let Some(v) = v else { return Vec::new() };
    let mut buf = vec![0u8; v.size()];
    let n = v.data(Some(&mut buf), 0);
    buf.truncate(n);
    buf
}

fn hex(b: &[u8]) -> String {
    b.iter()
        .map(|x| format!("{x:02X}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn name(p: Option<X509CertPrincipal>) -> Name {
    let Some(p) = p else {
        return Name::default();
    };
    let mut orgs = CefStringList::new();
    p.organization_names(Some(&mut orgs));
    Name {
        common_name: CefString::from(&p.common_name()).to_string(),
        organization: orgs.into_iter().collect::<Vec<_>>().join(", "),
        country: CefString::from(&p.country_name()).to_string(),
    }
}

fn certificate(c: &X509Certificate) -> Certificate {
    let der = bytes(c.derencoded());
    let mut pem = String::from_utf8_lossy(&bytes(c.pemencoded())).into_owned();
    let mut chain_der = Vec::new();
    c.derencoded_issuer_chain(Some(&mut chain_der));
    let mut chain_pem = Vec::new();
    c.pemencoded_issuer_chain(Some(&mut chain_pem));
    for p in chain_pem {
        pem.push_str(&String::from_utf8_lossy(&bytes(p)));
    }
    Certificate {
        subject: name(c.subject()),
        issuer: name(c.issuer()),
        serial: hex(&bytes(c.serial_number())),
        valid_from: date(c.valid_start()),
        valid_until: date(c.valid_expiry()),
        sha256: hex(&sha2::Sha256::digest(&der)),
        sha1: hex(&sha1::Sha1::digest(&der)),
        pem,
        chain: chain_der
            .into_iter()
            .map(|d| hex(&sha2::Sha256::digest(bytes(d))))
            .collect(),
    }
}

/// A CEF time (microseconds since 1601-01-01 UTC) as `YYYY-MM-DD HH:MM UTC`.
fn date(t: Basetime) -> String {
    const WINDOWS_TO_UNIX_US: i64 = 11_644_473_600_000_000;
    let secs = (t.val - WINDOWS_TO_UNIX_US).div_euclid(1_000_000);
    let (days, rest) = (secs.div_euclid(86_400), secs.rem_euclid(86_400));
    // Days since 1970-01-01 to a civil date (Howard Hinnant's algorithm).
    let z = days + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02} UTC",
        rest / 3600,
        rest % 3600 / 60
    )
}
