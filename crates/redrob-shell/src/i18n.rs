//! English and Korean, the two languages Redrob Browser ships.
//!
//! English text is the key. `t` returns it, or its Korean form when Korean is
//! on; `tf` fills `{0}`, `{1}`, ... after translating. Korean copy is 해요체,
//! with no em dashes, and writes our own name as 레드롭 in prose (product and
//! component names such as Redrob Code stay as they are).

use std::sync::atomic::{AtomicU8, Ordering};

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Lang {
    En,
    Ko,
}

static LANG: AtomicU8 = AtomicU8::new(0);

pub fn set(lang: Lang) {
    LANG.store(if lang == Lang::Ko { 1 } else { 0 }, Ordering::Relaxed);
}

pub fn current() -> Lang {
    if LANG.load(Ordering::Relaxed) == 1 {
        Lang::Ko
    } else {
        Lang::En
    }
}

pub fn code(lang: Lang) -> &'static str {
    match lang {
        Lang::En => "en",
        Lang::Ko => "ko",
    }
}

pub fn from_code(code: &str) -> Option<Lang> {
    match code {
        "en" => Some(Lang::En),
        "ko" => Some(Lang::Ko),
        _ => None,
    }
}

/// The saved choice, else the OS locale, else English.
pub fn detect(saved: Option<&str>) -> Lang {
    if let Some(l) = saved.and_then(from_code) {
        return l;
    }
    for var in ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        if let Ok(v) = std::env::var(var) {
            if v.is_empty() {
                continue;
            }
            return if v.to_ascii_lowercase().starts_with("ko") { Lang::Ko } else { Lang::En };
        }
    }
    #[cfg(target_os = "macos")]
    {
        // GUI apps on macOS often start without LANG; ask the user defaults.
        if let Ok(out) = std::process::Command::new("defaults").args(["read", "-g", "AppleLanguages"]).output() {
            let s = String::from_utf8_lossy(&out.stdout);
            if let Some(first) = s.split('"').nth(1) {
                return if first.starts_with("ko") { Lang::Ko } else { Lang::En };
            }
        }
    }
    Lang::En
}

pub fn t(en: &'static str) -> &'static str {
    if current() == Lang::En {
        return en;
    }
    ko(en).unwrap_or(en)
}

pub fn tf(en: &'static str, args: &[&dyn std::fmt::Display]) -> String {
    let mut s = t(en).to_string();
    for (i, a) in args.iter().enumerate() {
        s = s.replace(&format!("{{{i}}}"), &a.to_string());
    }
    s
}

fn ko(en: &str) -> Option<&'static str> {
    Some(match en {
        // Window
        "Redrob Browser" => "Redrob Browser",
        "New tab" => "새 탭",
        "Close" => "닫기",
        "Close tab" => "탭 닫기",
        "Back" => "뒤로",
        "Forward" => "앞으로",
        "Reload" => "새로고침",
        "Stop" => "멈추기",
        "Search or enter address" => "검색어나 주소를 입력하세요",
        "Bookmark this page" => "이 페이지 북마크하기",
        "Open in new tab" => "새 탭에서 열기",
        "Remove" => "삭제",
        "OK" => "확인",
        "Menu" => "메뉴",
        "Downloads" => "다운로드",
        "Developer tools" => "개발자 도구",
        "Language" => "언어",
        "Bookmark" => "북마크",
        "History" => "기록",
        "Search" => "검색",
        "Downloading" => "받는 중",
        "Done" => "완료",
        "Failed" => "실패",
        // Import
        "No Chrome, Chromium, Edge or Brave profile found" => "Chrome, Chromium, Edge, Brave 프로필을 찾지 못했어요",
        "Import from {0}" => "{0}에서 가져오기",
        "Import passwords from {0}" => "{0}에서 비밀번호 가져오기",
        "Import passwords from Chrome Passwords.csv" => "Chrome Passwords.csv에서 비밀번호 가져오기",
        "Import needs a profile, and none could be opened." => "가져오려면 프로필이 필요한데 열지 못했어요.",
        "Could not import from {0}: {1}" => "{0}에서 가져오지 못했어요: {1}",
        "Could not save the import: {0}" => "가져온 내용을 저장하지 못했어요: {0}",
        "Imported {0} bookmarks and {1} history entries from {2}." => "{2}에서 북마크 {0}개와 방문 기록 {1}개를 가져왔어요.",
        "Could not save bookmarks: {0}" => "북마크를 저장하지 못했어요: {0}",
        // Passwords
        "Key" => "로그인",
        "Sign in as {0}" => "{0} 계정으로 로그인",
        "No sign-in form on this page." => "이 페이지에 로그인 양식이 없어요.",
        "Could not use the saved login: {0}" => "저장된 로그인을 쓰지 못했어요: {0}",
        "Save the password on {0}?" => "{0}의 비밀번호를 저장할까요?",
        "Save the password for {0} on {1}?" => "{1}의 {0} 비밀번호를 저장할까요?",
        "Update the saved password on {0}?" => "{0}에 저장된 비밀번호를 바꿀까요?",
        "Update the saved password for {0} on {1}?" => "{1}에 저장된 {0} 비밀번호를 바꿀까요?",
        "Save" => "저장",
        "Update" => "바꾸기",
        "Not now" => "나중에",
        "Never for this site" => "이 사이트에서는 묻지 않기",
        "Could not save the password: {0}" => "비밀번호를 저장하지 못했어요: {0}",
        "The password vault is not available on this system." => "이 컴퓨터에서는 비밀번호 금고를 쓸 수 없어요.",
        "Imported {0} passwords from {1}." => "{1}에서 비밀번호 {0}개를 가져왔어요.",
        " {0} could not be opened; import a CSV export for those." => " {0}개는 열지 못했어요. 그 비밀번호는 CSV로 내보내서 가져오세요.",
        "the CSV file" => "CSV 파일",
        "Could not import passwords: {0}" => "비밀번호를 가져오지 못했어요: {0}",
        // Agent
        "Sending to Redrob Code..." => "Redrob Code로 보내고 있어요.",
        "Sent to Redrob Code." => "Redrob Code로 보냈어요.",
        "Could not reach the agent: {0}" => "에이전트에 연결하지 못했어요: {0}",
        // Account
        "Sign in to Redrob" => "레드롭 로그인",
        "Sign out" => "로그아웃",
        "Signed in as {0}" => "{0} 계정으로 로그인했어요",
        "Signing in. Finish in the page that opened." => "로그인하고 있어요. 열린 페이지에서 마저 진행하세요.",
        "Could not sign in: {0}" => "로그인하지 못했어요: {0}",
        // Media
        "Play" => "재생",
        "Pause" => "일시정지",
        // Developer tools
        "Console" => "콘솔",
        "Elements" => "요소",
        "Network" => "네트워크",
        "Refresh" => "새로고침",
        "Loading the document tree..." => "문서 구조를 불러오고 있어요",
        "Status" => "상태",
        "Method" => "메서드",
        "Type" => "종류",
        "{0} requests" => "요청 {0}개",
        _ => return None,
    })
}
