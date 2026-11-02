//! Links only another program opens (mailto:, tel:, zoommtg:), as Chrome
//! does: the page's request reaches `on_protocol_execution`
//! (languages.rs), the window asks "Open with another app?" (ui.rs) and
//! the system's handler gets the link. "Always allow" is remembered for the
//! site and scheme.

/// Hand `url` to the program the system has for its scheme.
pub fn launch(url: &str) {
    match open::that_detached(url) {
        Ok(()) => eprintln!(
            "redrob-browser: a {} link went to the system's handler",
            scheme(url)
        ),
        Err(e) => eprintln!(
            "redrob-browser: no program opened a {} link: {e}",
            scheme(url)
        ),
    }
}

/// The scheme of `url`, lower case.
pub fn scheme(url: &str) -> String {
    url.split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase()
}

/// What the person chose for an "Open with another app?" prompt.
pub fn answer(origin: &str, url: &str, open: bool, always: bool) {
    if always && !origin.is_empty() {
        super::features().sites.set(
            origin,
            &super::languages::external_key(url),
            Some(if open { "allow" } else { "block" }),
        );
    }
    if open {
        launch(url);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn schemes_and_keys() {
        assert_eq!(scheme("MailTo:a@b.c"), "mailto");
        assert_eq!(
            super::super::languages::external_key("tel:+82101234"),
            "external.tel"
        );
        assert!(super::super::languages::external_ok("mailto:a@b.c"));
        assert!(!super::super::languages::external_ok("javascript:alert(1)"));
        assert!(!super::super::languages::external_ok("file:///etc/passwd"));
    }
}
