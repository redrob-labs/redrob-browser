//! Spell check in text fields, in English and Korean, as Chrome does it:
//! Chromium underlines words its Hunspell dictionaries do not know
//! (`spellcheck.dictionaries`, cef/mod.rs `write_feature_prefs`; Chromium
//! downloads each `.bdic` once into the profile), and the page's context
//! menu offers its suggestions and "Add to dictionary" (context_menu.rs).

use cef::*;

/// The dictionaries pages are checked with.
pub const DICTIONARIES: &[&str] = &["en-US", "ko"];

/// At most this many suggestions in the menu, as in Chrome.
pub const MAX_SUGGESTIONS: usize = 5;

/// The misspelled word under the pointer and Chromium's suggestions for it.
pub fn of(params: &ContextMenuParams) -> (String, Vec<String>) {
    let word = super::text(&params.misspelled_word());
    if word.is_empty() {
        return (word, Vec::new());
    }
    let mut list = CefStringList::new();
    params.dictionary_suggestions(Some(&mut list));
    let mut out: Vec<String> = list.into_iter().filter(|s| !s.is_empty()).collect();
    out.truncate(MAX_SUGGESTIONS);
    (word, out)
}

/// Put `word` in place of the misspelled one.
pub fn replace(browser: &Browser, word: &str) {
    if let Some(host) = browser.host() {
        host.replace_misspelling(Some(&CefString::from(word)));
    }
}

/// Stop marking `word` as misspelled, in every page of the profile.
pub fn add(browser: &Browser, word: &str) {
    if let Some(host) = browser.host() {
        host.add_word_to_dictionary(Some(&CefString::from(word)));
    }
}
