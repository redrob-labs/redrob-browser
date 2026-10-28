//! WebVTT subtitles for `<track kind="subtitles|captions">`: fetch the file,
//! parse its cues, and find the cue on screen at a playback time.
//! Only cue timing and text are read; cue settings (position, line, align)
//! and styling are ignored, and tags such as `<b>` or `<v Speaker>` are
//! stripped. Design: docs/MEDIA.md.

use std::sync::{Arc, Mutex};

use base64::Engine as _;

#[derive(Clone, Debug)]
pub struct Cue {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

/// Cues load in the background; the list is empty until then.
pub type Cues = Arc<Mutex<Vec<Cue>>>;

/// Start loading `url` (http, https or data:) and return the list it fills.
pub fn load(url: &str) -> Cues {
    let cues: Cues = Default::default();
    let target = cues.clone();
    let url = url.to_string();
    std::thread::spawn(move || {
        let Some(text) = fetch(&url) else { return };
        let parsed = parse(&text);
        if let Ok(mut c) = target.lock() {
            *c = parsed;
        }
    });
    cues
}

fn fetch(url: &str) -> Option<String> {
    if let Some(rest) = url.strip_prefix("data:") {
        let (meta, body) = rest.split_once(',')?;
        return if meta.ends_with(";base64") {
            let bytes = base64::engine::general_purpose::STANDARD
                .decode(body.trim())
                .ok()?;
            String::from_utf8(bytes).ok()
        } else {
            Some(percent_decode(body))
        };
    }
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return None;
    }
    match ureq::get(url)
        .timeout(std::time::Duration::from_secs(15))
        .call()
    {
        Ok(r) => r.into_string().ok(),
        Err(e) => {
            eprintln!("redrob-browser: cannot load subtitles {url}: {e}");
            None
        }
    }
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = s
                .get(i + 1..i + 3)
                .and_then(|h| u8::from_str_radix(h, 16).ok())
            {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Parse a WebVTT file into cues sorted by start time.
pub fn parse(text: &str) -> Vec<Cue> {
    let text = text
        .trim_start_matches('\u{feff}')
        .replace("\r\n", "\n")
        .replace('\r', "\n");
    let mut lines = text.lines().peekable();
    // The "WEBVTT" header line and anything up to the first blank line.
    match lines.peek() {
        Some(l) if l.starts_with("WEBVTT") => {
            for l in lines.by_ref() {
                if l.trim().is_empty() {
                    break;
                }
            }
        }
        _ => return Vec::new(),
    }
    let mut cues = Vec::new();
    while let Some(line) = lines.next() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        // NOTE, STYLE and REGION blocks: skip to the next blank line.
        if line.starts_with("NOTE") || line == "STYLE" || line == "REGION" {
            for l in lines.by_ref() {
                if l.trim().is_empty() {
                    break;
                }
            }
            continue;
        }
        // An optional cue identifier comes before the timing line.
        let timing = if line.contains("-->") {
            line.to_string()
        } else {
            match lines.next() {
                Some(l) if l.contains("-->") => l.trim().to_string(),
                _ => continue,
            }
        };
        let Some((a, rest)) = timing.split_once("-->") else {
            continue;
        };
        let b = rest.split_whitespace().next().unwrap_or("");
        let (Some(start), Some(end)) = (timestamp(a.trim()), timestamp(b)) else {
            continue;
        };
        let mut body = Vec::new();
        for l in lines.by_ref() {
            if l.trim().is_empty() {
                break;
            }
            body.push(strip_tags(l));
        }
        if end > start {
            cues.push(Cue {
                start,
                end,
                text: body.join("\n"),
            });
        }
    }
    cues.sort_by(|x, y| x.start.total_cmp(&y.start));
    cues
}

/// `hh:mm:ss.ttt` or `mm:ss.ttt` in seconds.
fn timestamp(s: &str) -> Option<f64> {
    let parts: Vec<&str> = s.split(':').collect();
    let (h, m, sec) = match parts.as_slice() {
        [h, m, s] => (h.parse::<f64>().ok()?, m.parse::<f64>().ok()?, s),
        [m, s] => (0.0, m.parse::<f64>().ok()?, s),
        _ => return None,
    };
    let sec = sec.replace(',', ".").parse::<f64>().ok()?;
    Some(h * 3600.0 + m * 60.0 + sec)
}

/// Drop `<...>` tags and decode the few entities WebVTT allows.
fn strip_tags(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut in_tag = false;
    for ch in line.chars() {
        match ch {
            '<' => in_tag = true,
            '>' if in_tag => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", "\u{a0}")
        .replace("&lrm;", "")
        .replace("&rlm;", "")
        .replace("&amp;", "&")
}

/// The text of every cue showing at `time`, one cue per line.
pub fn active(cues: &Cues, time: f64) -> Option<String> {
    let c = cues.lock().ok()?;
    let shown: Vec<&str> = c
        .iter()
        .filter(|q| q.start <= time && time < q.end)
        .map(|q| q.text.as_str())
        .collect();
    if shown.is_empty() {
        None
    } else {
        Some(shown.join("\n"))
    }
}
