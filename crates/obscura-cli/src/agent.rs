//! `redrob-browser tab ...`: drive the tabs of the running browser window from
//! the command line, the way an agent does. See docs/AGENT.md.
//!
//! Window tabs are Chromium; these commands speak the Chrome DevTools Protocol
//! to the window's relay (`obscura_mcp::window`, shared with the MCP
//! `window_*` tools). Tabs opened here are agent tabs: the window marks them
//! so the person can tell them apart.

use std::path::PathBuf;

use base64::Engine as _;
use obscura_mcp::window::Cdp;

#[derive(clap::Subcommand)]
pub enum TabCmd {
    /// List open tabs: id, URL, title, window and whether an agent opened it.
    List,
    /// Open a new agent tab and print its id.
    Open { url: String },
    /// Navigate a tab and wait for it to load.
    Go { id: String, url: String },
    /// Print the page as an outline of elements with [ref=N] handles.
    Read { id: String },
    /// Click the element with this ref.
    Click { id: String, r#ref: i64 },
    /// Focus the element with this ref and type text into it.
    Type {
        id: String,
        r#ref: i64,
        text: String,
        /// Press Enter afterwards.
        #[arg(long)]
        submit: bool,
    },
    /// Press a key (Enter, Tab, Escape, ArrowDown, ...).
    Key { id: String, key: String },
    /// Scroll the page by this many CSS pixels (negative scrolls up).
    Scroll { id: String, dy: f64 },
    /// Run JavaScript in the page and print the value as JSON.
    Eval { id: String, expression: String },
    /// Save a PNG of the visible page.
    Shot { id: String, path: PathBuf },
    /// Print the page as Markdown.
    Markdown { id: String },
    /// Sign in with a login saved in the browser. The password is typed by
    /// the browser; this prints only the outcome and the username.
    Login {
        id: String,
        /// Which saved username, when the site has several.
        #[arg(long)]
        user: Option<String>,
    },
    /// Close a tab.
    Close { id: String },
}

pub async fn run(cmd: TabCmd) -> anyhow::Result<()> {
    let mut c = Cdp::window().await?;
    match cmd {
        TabCmd::List => {
            for t in c.list().await? {
                println!(
                    "{}\t{}\t{}\t{}\t{}",
                    t.id,
                    t.url,
                    t.title,
                    t.window.map(|w| format!("window {w}")).unwrap_or_default(),
                    if t.agent { "agent" } else { "" }
                );
            }
        }
        TabCmd::Open { url } => println!("{}", c.open(&url).await?),
        TabCmd::Go { id, url } => c.go(&id, &url).await?,
        TabCmd::Read { id } => print!("{}", c.read(&id).await?),
        TabCmd::Click { id, r#ref } => c.click(&id, r#ref).await?,
        TabCmd::Type {
            id,
            r#ref,
            text,
            submit,
        } => c.type_text(&id, r#ref, &text, submit).await?,
        TabCmd::Key { id, key } => c.key(&id, &key).await?,
        TabCmd::Scroll { id, dy } => c.scroll(&id, dy).await?,
        TabCmd::Eval { id, expression } => {
            println!(
                "{}",
                serde_json::to_string(&c.eval(&id, &expression).await?)?
            )
        }
        TabCmd::Shot { id, path } => {
            let bytes = base64::engine::general_purpose::STANDARD.decode(c.shot(&id).await?)?;
            std::fs::write(&path, bytes)?;
            println!("{}", path.display());
        }
        TabCmd::Markdown { id } => println!("{}", c.markdown(&id).await?),
        TabCmd::Login { id, user } => {
            let r = c.login(&id, user.as_deref()).await?;
            println!("{}", serde_json::to_string(&r)?);
        }
        TabCmd::Close { id } => c.close(&id).await?,
    }
    Ok(())
}
