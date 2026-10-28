//! The browser's own pages, drawn by the window instead of the engine:
//! redrob://history, redrob://passwords and redrob://settings.

use crate::i18n::{self, t, tf};
use crate::model::HistoryEntry;
use crate::profile::Profile;
use crate::theme::{self, size, Icon};
use crate::vault::{AgentPolicy, Vault};

pub const HISTORY: &str = "redrob://history";
pub const PASSWORDS: &str = "redrob://passwords";
pub const SETTINGS: &str = "redrob://settings";

pub fn is_internal(url: &str) -> bool {
    url.starts_with("redrob://")
}

pub fn title(url: &str) -> &'static str {
    match url {
        HISTORY => t("History"),
        PASSWORDS => t("Passwords"),
        SETTINGS => t("Settings"),
        _ => t("Redrob Browser"),
    }
}

#[derive(Default)]
pub struct State {
    history_query: String,
    history: Vec<HistoryEntry>,
    history_loaded_for: Option<String>,
    history_limit: u32,
    password_origin: Option<String>,
    server_input: Option<String>,
}

/// What a page asks the window to do.
#[derive(Default)]
pub struct Actions {
    pub open: Option<String>,
    pub open_new_tab: Option<String>,
    /// The search engine changed; the window applies it.
    pub search_engine: Option<String>,
    /// The theme changed: "system", "light" or "dark".
    pub theme: Option<String>,
}

pub fn ui(
    ui: &mut egui::Ui,
    url: &str,
    s: &mut State,
    profile: Option<&Profile>,
    vault: Option<&mut Vault>,
) -> Actions {
    let mut act = Actions::default();
    egui::ScrollArea::vertical()
        .auto_shrink([false, false])
        .show(ui, |ui| {
            ui.spacing_mut().item_spacing.y = 6.0;
            match url {
                HISTORY => {
                    theme::page_header(
                        ui,
                        Icon::History,
                        t("History"),
                        t("Pages you opened, newest first."),
                    );
                    history(ui, s, profile, &mut act);
                }
                PASSWORDS => {
                    theme::page_header(
                        ui,
                        Icon::Key,
                        t("Passwords"),
                        t("Saved sign-ins, kept encrypted on this computer."),
                    );
                    passwords(ui, s, vault);
                }
                SETTINGS => {
                    theme::page_header(ui, Icon::Settings, t("Settings"), "");
                    settings(ui, s, profile, &mut act);
                }
                _ => {
                    theme::page_header(ui, Icon::Globe, title(url), "");
                    theme::empty_note(ui, t("This page does not exist."));
                }
            }
            ui.add_space(size::SPACE_6);
        });
    act
}

fn history(ui: &mut egui::Ui, s: &mut State, profile: Option<&Profile>, act: &mut Actions) {
    let Some(p) = profile else {
        theme::empty_note(ui, t("History is not saved: no profile could be opened."));
        return;
    };
    if s.history_limit == 0 {
        s.history_limit = 200;
    }
    let mut reload = false;
    ui.horizontal(|ui| {
        let w = (ui.available_width() - 360.0).clamp(200.0, 420.0);
        if theme::text_field(
            ui,
            &mut s.history_query,
            t("Search history"),
            w,
            Some(Icon::Search),
        )
        .changed()
        {
            reload = true;
        }
        ui.add_space(size::SPACE_2);
        let now = crate::model::now();
        if theme::button(ui, t("Clear the last hour"), false).clicked() {
            let _ = p.clear_history_since(now.saturating_sub(3600));
            reload = true;
        }
        if theme::button(ui, t("Clear today"), false).clicked() {
            let _ = p.clear_history_since(now - now % 86_400);
            reload = true;
        }
        if theme::button(ui, t("Clear all history"), false).clicked() {
            let _ = p.clear_history_since(0);
            reload = true;
        }
    });
    ui.add_space(size::SPACE_4);
    if reload || s.history_loaded_for.as_deref() != Some(s.history_query.as_str()) {
        s.history = p
            .history_page(&s.history_query, s.history_limit, 0)
            .unwrap_or_default();
        s.history_loaded_for = Some(s.history_query.clone());
    }
    let mut delete = None;
    let mut more = false;
    theme::card(ui, "", "", |ui| {
        if s.history.is_empty() {
            theme::empty_note(ui, t("Nothing here yet."));
            return;
        }
        let mut day = String::new();
        for h in &s.history {
            let stamp = day_time(h.last_visit);
            let (d, time) = stamp.split_once(' ').unwrap_or((stamp.as_str(), ""));
            if d != day {
                day = d.to_string();
                ui.add_space(if day.is_empty() { 0.0 } else { size::SPACE_2 });
                ui.label(
                    egui::RichText::new(d)
                        .size(12.0)
                        .strong()
                        .color(theme::palette(ui).ink_secondary),
                );
            }
            let host = url::Url::parse(&h.url)
                .ok()
                .and_then(|u| u.host_str().map(str::to_string))
                .unwrap_or_default();
            let title = if h.title.is_empty() {
                h.url.as_str()
            } else {
                h.title.as_str()
            };
            let badge = badge_letter(if host.is_empty() { title } else { &host });
            let (r, removed) = theme::list_row(
                ui,
                &badge,
                &theme::elide(title, 90),
                &theme::elide(&h.url, 110),
                time,
                true,
            );
            if removed {
                delete = Some(h.url.clone());
            } else if r.clicked() {
                act.open = Some(h.url.clone());
            } else if r.middle_clicked() {
                act.open_new_tab = Some(h.url.clone());
            }
        }
        if s.history.len() as u32 >= s.history_limit {
            ui.add_space(size::SPACE_2);
            more = theme::button(ui, t("Show more"), false).clicked();
        }
    });
    if let Some(u) = delete {
        let _ = p.delete_history(&u);
        s.history_loaded_for = None;
    }
    if more {
        s.history_limit += 200;
        s.history_loaded_for = None;
    }
}

fn passwords(ui: &mut egui::Ui, s: &mut State, vault: Option<&mut Vault>) {
    let Some(v) = vault else {
        theme::empty_note(ui, t("The password vault is not available on this system."));
        return;
    };
    theme::card(
        ui,
        t("Agent sign-in"),
        t("When Redrob Code may sign in for you. It never sees the password."),
        |ui| {
            let policy = v.agent_policy();
            let id = |p: AgentPolicy| match p {
                AgentPolicy::WhileUnlocked => "unlocked",
                AgentPolicy::Always => "always",
                AgentPolicy::Never => "never",
            };
            let items = [
                ("unlocked", t("Only while the vault is unlocked")),
                ("always", t("On every site that is not blocked")),
                ("never", t("Never")),
            ];
            if let Some(picked) = theme::segmented(ui, &items, id(policy)) {
                let next = match picked {
                    "always" => AgentPolicy::Always,
                    "never" => AgentPolicy::Never,
                    _ => AgentPolicy::WhileUnlocked,
                };
                let _ = v.set_agent_policy(next);
            }
            ui.add_space(size::SPACE_3);
            ui.horizontal(|ui| {
                let pal = *theme::palette(ui);
                if v.is_unlocked() {
                    ui.label(egui::RichText::new(t("Unlocked")).color(pal.success));
                    if theme::button(ui, t("Lock now"), false).clicked() {
                        v.lock();
                    }
                } else {
                    ui.label(egui::RichText::new(t("Locked")).color(pal.ink_secondary));
                    if theme::button(ui, t("Unlock"), true).clicked() {
                        v.unlock();
                    }
                }
            });
        },
    );
    theme::card(ui, t("Saved passwords"), "", |ui| {
        let origins = v.all_origins();
        if origins.is_empty() {
            theme::empty_note(ui, t("No passwords saved yet."));
        }
        for (origin, count) in &origins {
            let open = s.password_origin.as_deref() == Some(origin.as_str());
            let host = url::Url::parse(origin)
                .ok()
                .and_then(|u| u.host_str().map(str::to_string))
                .unwrap_or_else(|| origin.clone());
            let note = tf("{0} saved", &[count]);
            let (r, _) = theme::list_row(ui, &badge_letter(&host), &host, origin, &note, false);
            if r.clicked() {
                s.password_origin = if open { None } else { Some(origin.clone()) };
            }
            if !open {
                continue;
            }
            egui::Frame::new()
                .inner_margin(egui::Margin {
                    left: 46,
                    right: 0,
                    top: 0,
                    bottom: 8,
                })
                .show(ui, |ui| {
                    for l in v.logins_for(origin) {
                        let (_, removed) = theme::list_row(ui, "•", &l.username, "", "", true);
                        if removed {
                            let _ = v.delete(l.id);
                        }
                    }
                    let rule = v.site_rule(origin);
                    ui.horizontal(|ui| {
                        ui.label(
                            egui::RichText::new(t("Agent on this site:"))
                                .color(theme::palette(ui).ink_secondary),
                        );
                        let now = rule.as_deref().unwrap_or("follow");
                        let items = [
                            ("follow", t("Follow the setting above")),
                            ("allow", t("Allow")),
                            ("block", t("Block")),
                        ];
                        if let Some(picked) = theme::segmented(ui, &items, now) {
                            let _ = v.set_site_rule(
                                origin,
                                if picked == "follow" {
                                    None
                                } else {
                                    Some(picked)
                                },
                            );
                        }
                    });
                });
        }
    });
    theme::card(ui, t("Agent sign-in history"), "", |ui| {
        let hist = v.agent_history(100);
        if hist.is_empty() {
            theme::empty_note(ui, t("The agent has not signed in anywhere."));
        }
        for (time, origin, username, outcome) in hist {
            let host = url::Url::parse(&origin)
                .ok()
                .and_then(|u| u.host_str().map(str::to_string))
                .unwrap_or_else(|| origin.clone());
            let sub = format!("{username} · {outcome}");
            theme::list_row(
                ui,
                &badge_letter(&host),
                &host,
                &sub,
                &day_time(time),
                false,
            );
        }
    });
}

fn settings(ui: &mut egui::Ui, s: &mut State, profile: Option<&Profile>, act: &mut Actions) {
    theme::card(
        ui,
        t("Language"),
        t("The language of the browser's own screens."),
        |ui| {
            let now = i18n::code(i18n::current());
            if let Some(code) = theme::segmented(ui, &[("en", "English"), ("ko", "한국어")], now)
            {
                let lang = if code == "ko" {
                    i18n::Lang::Ko
                } else {
                    i18n::Lang::En
                };
                i18n::set(lang);
                if let Some(p) = profile {
                    let _ = p.set_setting("language", i18n::code(lang));
                }
            }
        },
    );
    theme::card(ui, t("Theme"), "", |ui| {
        let theme_now = profile
            .and_then(|p| p.setting("theme"))
            .unwrap_or_else(|| "system".to_string());
        let items = [
            ("system", t("Same as the system")),
            ("light", t("Light")),
            ("dark", t("Dark")),
        ];
        if let Some(id) = theme::segmented(ui, &items, &theme_now) {
            act.theme = Some(id.to_string());
        }
    });
    theme::card(
        ui,
        t("Search engine"),
        t("Used for words typed in the address bar."),
        |ui| {
            let current = profile
                .and_then(|p| p.setting("search_engine"))
                .unwrap_or_else(|| "duckduckgo".to_string());
            let items: Vec<(&str, &str)> = crate::model::SEARCH_ENGINES
                .iter()
                .map(|(id, name, _)| (*id, *name))
                .collect();
            if let Some(id) = theme::segmented(ui, &items, &current) {
                act.search_engine = Some(id.to_string());
            }
        },
    );
    theme::card(ui, t("Downloads"), "", |ui| {
        let dir = crate::profile::downloads_dir().display().to_string();
        ui.label(
            egui::RichText::new(tf("Files are saved to {0}", &[&dir]))
                .color(theme::palette(ui).ink_secondary),
        );
    });
    theme::card(
        ui,
        t("Redrob Code"),
        t("Prompts typed after / in the address bar go here. Only this computer is allowed."),
        |ui| {
            let saved = profile
                .and_then(|p| p.setting("agent_server"))
                .unwrap_or_else(|| crate::agent_bridge::DEFAULT_SERVER.to_string());
            let input = s.server_input.get_or_insert(saved);
            let r = theme::text_field(ui, input, t("Server address"), 320.0, None);
            if r.lost_focus() {
                if let Some(p) = profile {
                    let _ = p.set_setting("agent_server", input.trim());
                }
            }
        },
    );
    if let Some(p) = profile {
        theme::card(ui, t("Profile folder"), "", |ui| {
            ui.label(
                egui::RichText::new(p.dir.display().to_string())
                    .monospace()
                    .color(theme::palette(ui).ink_secondary),
            );
        });
    }
}

/// The first letter or digit of `text`, upper-cased, for a list badge.
fn badge_letter(text: &str) -> String {
    let t = text.trim_start_matches("www.");
    t.chars()
        .find(|c| c.is_alphanumeric())
        .map(|c| c.to_uppercase().to_string())
        .unwrap_or_else(|| "·".to_string())
}

/// Local-free UTC "YYYY-MM-DD HH:MM" for a Unix time; good enough to order a list by eye.
fn day_time(secs: u64) -> String {
    let days = secs / 86_400;
    let rem = secs % 86_400;
    let (y, m, d) = civil(days as i64);
    format!(
        "{y:04}-{m:02}-{d:02} {:02}:{:02}",
        rem / 3600,
        (rem % 3600) / 60
    )
}

/// Days since 1970-01-01 to a calendar date (Howard Hinnant's algorithm).
fn civil(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}
