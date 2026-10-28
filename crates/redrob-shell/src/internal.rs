//! The browser's own pages, drawn by the window instead of the engine:
//! redrob://history, redrob://passwords and redrob://settings.

use crate::i18n::{self, t, tf};
use crate::model::HistoryEntry;
use crate::profile::Profile;
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
            ui.add_space(12.0);
            ui.heading(title(url));
            ui.add_space(8.0);
            match url {
                HISTORY => history(ui, s, profile, &mut act),
                PASSWORDS => passwords(ui, s, vault),
                SETTINGS => settings(ui, s, profile, &mut act),
                _ => {
                    ui.label(t("This page does not exist."));
                }
            }
        });
    act
}

fn history(ui: &mut egui::Ui, s: &mut State, profile: Option<&Profile>, act: &mut Actions) {
    let Some(p) = profile else {
        ui.label(t("History is not saved: no profile could be opened."));
        return;
    };
    if s.history_limit == 0 {
        s.history_limit = 200;
    }
    let mut reload = false;
    ui.horizontal(|ui| {
        let r = ui.add(
            egui::TextEdit::singleline(&mut s.history_query)
                .hint_text(t("Search history"))
                .desired_width(320.0),
        );
        if r.changed() {
            reload = true;
        }
        ui.separator();
        let now = crate::model::now();
        if ui.button(t("Clear the last hour")).clicked() {
            let _ = p.clear_history_since(now.saturating_sub(3600));
            reload = true;
        }
        if ui.button(t("Clear today")).clicked() {
            let _ = p.clear_history_since(now - now % 86_400);
            reload = true;
        }
        if ui.button(t("Clear all history")).clicked() {
            let _ = p.clear_history_since(0);
            reload = true;
        }
    });
    if reload || s.history_loaded_for.as_deref() != Some(s.history_query.as_str()) {
        s.history = p
            .history_page(&s.history_query, s.history_limit, 0)
            .unwrap_or_default();
        s.history_loaded_for = Some(s.history_query.clone());
    }
    ui.add_space(8.0);
    let mut delete = None;
    egui::Grid::new("history")
        .striped(true)
        .num_columns(3)
        .show(ui, |ui| {
            for h in &s.history {
                ui.weak(day_time(h.last_visit));
                let label = if h.title.is_empty() {
                    h.url.clone()
                } else {
                    h.title.clone()
                };
                let r = ui.link(label).on_hover_text(&h.url);
                if r.clicked() {
                    act.open = Some(h.url.clone());
                }
                if r.middle_clicked() {
                    act.open_new_tab = Some(h.url.clone());
                }
                if ui.small_button(t("Remove")).clicked() {
                    delete = Some(h.url.clone());
                }
                ui.end_row();
            }
        });
    if let Some(u) = delete {
        let _ = p.delete_history(&u);
        s.history_loaded_for = None;
    }
    if s.history.len() as u32 >= s.history_limit && ui.button(t("Show more")).clicked() {
        s.history_limit += 200;
        s.history_loaded_for = None;
    }
}

fn passwords(ui: &mut egui::Ui, s: &mut State, vault: Option<&mut Vault>) {
    let Some(v) = vault else {
        ui.label(t("The password vault is not available on this system."));
        return;
    };
    ui.strong(t("Agent sign-in"));
    let mut policy = v.agent_policy();
    let before = policy;
    ui.radio_value(
        &mut policy,
        AgentPolicy::WhileUnlocked,
        t("Only while the vault is unlocked"),
    );
    ui.radio_value(
        &mut policy,
        AgentPolicy::Always,
        t("On every site that is not blocked"),
    );
    ui.radio_value(&mut policy, AgentPolicy::Never, t("Never"));
    if policy != before {
        let _ = v.set_agent_policy(policy);
    }
    ui.horizontal(|ui| {
        if v.is_unlocked() {
            ui.label(t("Unlocked"));
            if ui.button(t("Lock now")).clicked() {
                v.lock();
            }
        } else {
            ui.label(t("Locked"));
            if ui.button(t("Unlock")).clicked() {
                v.unlock();
            }
        }
    });
    ui.add_space(12.0);
    ui.strong(t("Saved passwords"));
    let origins = v.all_origins();
    if origins.is_empty() {
        ui.weak(t("No passwords saved yet."));
    }
    for (origin, count) in &origins {
        let open = s.password_origin.as_deref() == Some(origin.as_str());
        let r = ui.selectable_label(open, format!("{origin}  ({count})"));
        if r.clicked() {
            s.password_origin = if open { None } else { Some(origin.clone()) };
        }
        if open {
            ui.indent(("site", origin), |ui| {
                for l in v.logins_for(origin) {
                    ui.horizontal(|ui| {
                        ui.label(&l.username);
                        if ui.small_button(t("Remove")).clicked() {
                            let _ = v.delete(l.id);
                        }
                    });
                }
                let rule = v.site_rule(origin);
                ui.horizontal(|ui| {
                    ui.label(t("Agent on this site:"));
                    if ui
                        .selectable_label(rule.is_none(), t("Follow the setting above"))
                        .clicked()
                    {
                        let _ = v.set_site_rule(origin, None);
                    }
                    if ui
                        .selectable_label(rule.as_deref() == Some("allow"), t("Allow"))
                        .clicked()
                    {
                        let _ = v.set_site_rule(origin, Some("allow"));
                    }
                    if ui
                        .selectable_label(rule.as_deref() == Some("block"), t("Block"))
                        .clicked()
                    {
                        let _ = v.set_site_rule(origin, Some("block"));
                    }
                });
            });
        }
    }
    ui.add_space(12.0);
    ui.strong(t("Agent sign-in history"));
    let hist = v.agent_history(100);
    if hist.is_empty() {
        ui.weak(t("The agent has not signed in anywhere."));
    }
    egui::Grid::new("agent-history")
        .striped(true)
        .num_columns(4)
        .show(ui, |ui| {
            for (time, origin, username, outcome) in hist {
                ui.weak(day_time(time));
                ui.label(origin);
                ui.label(username);
                ui.label(outcome);
                ui.end_row();
            }
        });
}

fn settings(ui: &mut egui::Ui, s: &mut State, profile: Option<&Profile>, act: &mut Actions) {
    ui.strong(t("Language"));
    let now = i18n::current();
    ui.horizontal(|ui| {
        for (lang, name) in [(i18n::Lang::En, "English"), (i18n::Lang::Ko, "한국어")] {
            if ui.selectable_label(now == lang, name).clicked() {
                i18n::set(lang);
                if let Some(p) = profile {
                    let _ = p.set_setting("language", i18n::code(lang));
                }
            }
        }
    });
    ui.add_space(12.0);
    ui.strong(t("Theme"));
    let theme = profile
        .and_then(|p| p.setting("theme"))
        .unwrap_or_else(|| "system".to_string());
    ui.horizontal(|ui| {
        for (id, name) in [
            ("system", t("Same as the system")),
            ("light", t("Light")),
            ("dark", t("Dark")),
        ] {
            if ui.selectable_label(theme == id, name).clicked() {
                act.theme = Some(id.to_string());
            }
        }
    });
    ui.add_space(12.0);
    ui.strong(t("Search engine"));
    let current = profile
        .and_then(|p| p.setting("search_engine"))
        .unwrap_or_else(|| "duckduckgo".to_string());
    ui.horizontal(|ui| {
        for (id, name) in crate::model::SEARCH_ENGINES
            .iter()
            .map(|(id, name, _)| (*id, *name))
        {
            if ui.selectable_label(current == id, name).clicked() {
                act.search_engine = Some(id.to_string());
            }
        }
    });
    ui.add_space(12.0);
    ui.strong(t("Downloads"));
    ui.label(tf(
        "Files are saved to {0}",
        &[&crate::profile::downloads_dir().display()],
    ));
    ui.add_space(12.0);
    ui.strong(t("Redrob Code"));
    let saved = profile
        .and_then(|p| p.setting("agent_server"))
        .unwrap_or_else(|| crate::agent_bridge::DEFAULT_SERVER.to_string());
    let input = s.server_input.get_or_insert(saved);
    ui.horizontal(|ui| {
        ui.label(t("Server address"));
        let r = ui.add(egui::TextEdit::singleline(input).desired_width(260.0));
        if r.lost_focus() {
            if let Some(p) = profile {
                let _ = p.set_setting("agent_server", input.trim());
            }
        }
    });
    ui.weak(t(
        "Prompts typed after > in the address bar go here. Only this computer is allowed.",
    ));
    if let Some(p) = profile {
        ui.add_space(12.0);
        ui.strong(t("Profile folder"));
        ui.label(p.dir.display().to_string());
    }
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
