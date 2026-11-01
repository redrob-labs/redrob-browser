//! In-place update. When `updater` finds a newer release, the window can fetch
//! the package for this platform into the profile folder, check its SHA-256
//! against the release's `SHA256SUMS.txt`, and unpack it beside the running
//! copy. A package is the whole bundle: the programs and the CEF runtime
//! (libcef, its resources, `locales/`, `CREDITS.html`, `bundle-manifest.txt`;
//! `bundle.rs`), so an update replaces all of it or nothing:
//!
//! - Linux and Windows: the archive is unpacked into `.redrob-update` inside
//!   the install folder and checked against its manifest. The swap moves
//!   every entry of the old bundle into `.redrob-previous` and the new ones
//!   into place, undoing every move when one fails (`bundle::replace`).
//! - macOS: the `.zip` holds `Redrob Browser.app`; it is unpacked next to the
//!   running bundle and checked with `codesign --verify --deep --strict`. The
//!   swap renames the running app to `Redrob Browser.app.old` and the new one
//!   into its place, putting the old one back when the second rename fails.
//!
//! The swap waits for "Restart to update", which saves the session and closes
//! the window; once CEF has shut down and the engine stopped,
//! `restart_if_requested` swaps and starts the new window. Swapping earlier
//! would let the running browser start renderer or GPU processes from the
//! new bundle (or, on Windows, fail on its open `.pak` files). When the swap
//! fails the old bundle is back in place and the old window starts again.
//! When the install folder cannot be written (a system package, a read-only
//! volume) the window offers the download page instead.

use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::sync::Mutex;
use std::time::Duration;

use sha2::{Digest, Sha256};

use crate::i18n::{t, tf};
use crate::updater::{Available, DOWNLOAD_PREFIX};

const USER_AGENT: &str = concat!("redrob-browser/", env!("CARGO_PKG_VERSION"));

/// The staged update to swap in after the window has closed and the engine stopped.
static RESTART: Mutex<Option<Staged>> = Mutex::new(None);

enum Msg {
    Progress(String),
    Ready(Staged),
    Failed(String),
}

/// An update unpacked and checked beside the running copy, not yet in place.
#[derive(Clone)]
pub struct Staged {
    kind: StagedKind,
    /// The window binary to start once the new bundle is in place.
    exe: PathBuf,
}

#[derive(Clone)]
enum StagedKind {
    Folder {
        dir: PathBuf,
        staging: PathBuf,
        new_root: PathBuf,
    },
    Bundle {
        app: PathBuf,
        staging: PathBuf,
        new_app: PathBuf,
    },
}

const STAGING: &str = ".redrob-update";
const PREVIOUS: &str = ".redrob-previous";

/// Where the running copy lives and which files an update replaces.
struct Install {
    kind: Kind,
}

enum Kind {
    /// Linux and Windows: three binaries in one folder.
    Folder { dir: PathBuf },
    /// macOS: the `.app` bundle the window runs from.
    Bundle {
        app: PathBuf,
        exe_name: std::ffi::OsString,
    },
}

#[derive(Default)]
pub struct SelfUpdate {
    offer: Option<(Available, PathBuf)>,
    rx: Option<mpsc::Receiver<Msg>>,
    ready: Option<Staged>,
}

impl SelfUpdate {
    /// A newer release arrived. In-place update is offered only when the
    /// release has checksums, a profile folder can hold the download, and the
    /// install folder can be written.
    pub fn offered(&mut self, a: &Available, profile_dir: Option<PathBuf>) {
        self.offer = None;
        let Some(dir) = profile_dir else { return };
        if !a
            .sums
            .as_deref()
            .is_some_and(|s| s.starts_with(DOWNLOAD_PREFIX))
            || !a.url.starts_with(DOWNLOAD_PREFIX)
        {
            return;
        }
        if locate().is_none() {
            return;
        }
        self.offer = Some((a.clone(), dir.join("updates")));
    }

    /// "Update" can be shown instead of "Download".
    pub fn can_start(&self) -> bool {
        self.offer.is_some() && self.rx.is_none() && self.ready.is_none()
    }

    pub fn busy(&self) -> bool {
        self.rx.is_some()
    }

    pub fn ready(&self) -> bool {
        self.ready.is_some()
    }

    pub fn start(&mut self, ctx: egui::Context) {
        let Some((available, dir)) = self.offer.clone() else {
            return;
        };
        let (tx, rx) = mpsc::channel();
        self.rx = Some(rx);
        std::thread::spawn(move || {
            let send = |m: Msg| {
                let _ = tx.send(m);
                ctx.request_repaint();
            };
            match run(&available, &dir, &send) {
                Ok(staged) => send(Msg::Ready(staged)),
                Err(e) => send(Msg::Failed(format!("{e:#}"))),
            }
        });
    }

    /// Drain the worker's messages; returns the latest line for the notice.
    pub fn poll(&mut self) -> Option<String> {
        let rx = self.rx.as_ref()?;
        let mut notice = None;
        while let Ok(m) = rx.try_recv() {
            match m {
                Msg::Progress(s) => notice = Some(s),
                Msg::Ready(staged) => {
                    self.ready = Some(staged);
                    notice = Some(t("The update is installed. Restart to use it.").to_string());
                }
                Msg::Failed(e) => {
                    // Fall back to the download link.
                    self.offer = None;
                    notice = Some(tf("Could not update: {0}", &[&e]));
                }
            }
        }
        if self.ready.is_some() || self.offer.is_none() {
            self.rx = None;
        }
        notice
    }

    /// Swap in the update and start the new window after this one exits; the
    /// caller closes the window.
    pub fn restart(&self) {
        if let Some(staged) = &self.ready {
            *RESTART.lock().unwrap_or_else(|e| e.into_inner()) = Some(staged.clone());
        }
    }
}

/// Call from `main` once the window closed, CEF shut down and the engine
/// stopped: swaps in the staged bundle and starts its window. When the swap
/// fails, the old bundle is back in place and the old window starts again.
pub fn restart_if_requested() {
    let staged = RESTART.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(staged) = staged {
        let exe = match staged.commit() {
            Ok(exe) => exe,
            Err(e) => {
                eprintln!("redrob-browser: the update was not installed: {e:#}");
                match std::env::current_exe() {
                    Ok(exe) => exe,
                    Err(_) => return,
                }
            }
        };
        if let Err(e) = crate::startup::no_console(&mut Command::new(&exe))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            eprintln!("redrob-browser: could not start {}: {e}", exe.display());
        }
    }
}

fn run(a: &Available, dir: &Path, send: &dyn Fn(Msg)) -> anyhow::Result<Staged> {
    let install =
        locate().ok_or_else(|| anyhow::anyhow!("{}", t("this copy cannot be updated in place")))?;
    let name = asset_name(&a.url)?;
    let sums_url = a
        .sums
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("the release has no checksums"))?;

    send(Msg::Progress(t("Checking the update...").to_string()));
    let sums = get(sums_url)?.into_string()?;
    let want = expected_sum(&sums, &name)
        .ok_or_else(|| anyhow::anyhow!("{name} is not in the release checksums"))?;

    // Keep only the download in progress in the updates folder.
    let _ = fs::remove_dir_all(dir);
    fs::create_dir_all(dir)?;
    let archive = dir.join(&name);
    let got = download(&a.url, &archive, send)?;
    if got != want {
        let _ = fs::remove_file(&archive);
        anyhow::bail!("{}", t("the download does not match the release checksum"));
    }

    send(Msg::Progress(t("Installing the update...").to_string()));
    let staged = install.stage(&archive)?;
    let _ = fs::remove_file(&archive);
    Ok(staged)
}

fn get(url: &str) -> anyhow::Result<ureq::Response> {
    if !url.starts_with(DOWNLOAD_PREFIX) {
        anyhow::bail!("refusing to download from {url}");
    }
    Ok(ureq::get(url)
        .set("User-Agent", USER_AGENT)
        .timeout(Duration::from_secs(30 * 60))
        .call()?)
}

/// Stream `url` into `to`, reporting progress; returns the SHA-256 in hex.
fn download(url: &str, to: &Path, send: &dyn Fn(Msg)) -> anyhow::Result<String> {
    let resp = get(url)?;
    let total: Option<u64> = resp.header("Content-Length").and_then(|v| v.parse().ok());
    let mut reader = resp.into_reader();
    let mut file = fs::File::create(to)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 64 * 1024];
    let mut done: u64 = 0;
    let mut shown: Option<u64> = None;
    loop {
        let n = reader.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        file.write_all(&buf[..n])?;
        done += n as u64;
        let step = match total {
            Some(len) if len > 0 => done * 100 / len,
            _ => done / (1024 * 1024),
        };
        if shown != Some(step) {
            shown = Some(step);
            let line = match total {
                Some(len) if len > 0 => tf("Downloading the update: {0}%", &[&step]),
                _ => tf("Downloading the update: {0} MB", &[&step]),
            };
            send(Msg::Progress(line));
        }
    }
    file.flush()?;
    file.sync_all()?;
    Ok(hasher
        .finalize()
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

/// The file name the checksums list uses: the last part of the download URL.
fn asset_name(url: &str) -> anyhow::Result<String> {
    let name = url.rsplit('/').next().unwrap_or_default();
    if name.is_empty() || name.contains(['\\', '%']) || name.starts_with('.') {
        anyhow::bail!("unexpected asset name in {url}");
    }
    Ok(name.to_string())
}

/// `sha256sum` output: `<hex>  <name>`, or `<hex> *<name>` in binary mode.
fn expected_sum(sums: &str, name: &str) -> Option<String> {
    sums.lines().find_map(|line| {
        let (hex, file) = line.trim_end().split_once(char::is_whitespace)?;
        let file = file.trim_start().trim_start_matches('*');
        (file == name && hex.len() == 64 && hex.bytes().all(|b| b.is_ascii_hexdigit()))
            .then(|| hex.to_ascii_lowercase())
    })
}

/// The three programs a package carries, as named on this platform.
fn binaries() -> [String; 3] {
    let ext = if cfg!(windows) { ".exe" } else { "" };
    [
        "redrob-browser",
        "redrob-browser-worker",
        "redrob-browser-window",
    ]
    .map(|b| format!("{b}{ext}"))
}

/// Find the running install and check it can be replaced.
fn locate() -> Option<Install> {
    let exe = std::env::current_exe().ok()?;
    if cfg!(target_os = "macos") {
        let app = exe
            .ancestors()
            .find(|p| p.extension().is_some_and(|e| e == "app"))?
            .to_path_buf();
        let exe_name = exe.file_name()?.to_os_string();
        let parent = app.parent()?;
        if !writable(parent) || !writable(&app.join("Contents")) {
            return None;
        }
        return Some(Install {
            kind: Kind::Bundle { app, exe_name },
        });
    }
    let dir = exe.parent()?.to_path_buf();
    if !binaries().iter().all(|b| dir.join(b).is_file()) || !writable(&dir) {
        return None;
    }
    Some(Install {
        kind: Kind::Folder { dir },
    })
}

fn writable(dir: &Path) -> bool {
    let probe = dir.join(format!(".redrob-write-test-{}", std::process::id()));
    let ok = fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&probe)
        .is_ok();
    let _ = fs::remove_file(&probe);
    ok
}

impl Install {
    /// Unpack the package beside the running copy and check it is whole;
    /// nothing of the running copy changes yet.
    fn stage(&self, archive: &Path) -> anyhow::Result<Staged> {
        match &self.kind {
            Kind::Folder { dir } => {
                let staging = dir.join(STAGING);
                let _ = fs::remove_dir_all(&staging);
                let _ = fs::remove_dir_all(dir.join(PREVIOUS));
                fs::create_dir_all(&staging)?;
                let result = (|| -> anyhow::Result<Staged> {
                    unpack(archive, &staging)?;
                    let window = binaries()[2].clone();
                    let new_root = find_dir_with(&staging, &window)
                        .ok_or_else(|| anyhow::anyhow!("the package has no {window}"))?;
                    for b in binaries() {
                        let new = new_root.join(&b);
                        if !new.is_file() {
                            anyhow::bail!("the package has no {b}");
                        }
                        make_executable(&new)?;
                    }
                    crate::bundle::check_complete(&new_root)?;
                    Ok(Staged {
                        kind: StagedKind::Folder {
                            dir: dir.clone(),
                            staging: staging.clone(),
                            new_root,
                        },
                        exe: dir.join(window),
                    })
                })();
                if result.is_err() {
                    let _ = fs::remove_dir_all(&staging);
                }
                result
            }
            Kind::Bundle { app, exe_name } => {
                let parent = app
                    .parent()
                    .ok_or_else(|| anyhow::anyhow!("the app has no folder"))?;
                let staging = parent.join(STAGING);
                let _ = fs::remove_dir_all(&staging);
                fs::create_dir_all(&staging)?;
                let result = (|| -> anyhow::Result<Staged> {
                    unpack(archive, &staging)?;
                    let new_app = fs::read_dir(&staging)?
                        .filter_map(Result::ok)
                        .map(|e| e.path())
                        .find(|p| p.extension().is_some_and(|e| e == "app") && p.is_dir())
                        .ok_or_else(|| anyhow::anyhow!("the package has no .app"))?;
                    if !new_app.join("Contents/MacOS").join(exe_name).is_file() {
                        anyhow::bail!("the new app has no {}", Path::new(exe_name).display());
                    }
                    // The seal covers every file of the app, the CEF framework
                    // and helper apps included, so a verified app is whole.
                    let status = Command::new("/usr/bin/codesign")
                        .args(["--verify", "--deep", "--strict"])
                        .arg(&new_app)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .status()?;
                    if !status.success() {
                        anyhow::bail!("{}", t("the new app's signature did not verify"));
                    }
                    Ok(Staged {
                        kind: StagedKind::Bundle {
                            app: app.clone(),
                            staging: staging.clone(),
                            new_app,
                        },
                        exe: app.join("Contents/MacOS").join(exe_name),
                    })
                })();
                if result.is_err() {
                    let _ = fs::remove_dir_all(&staging);
                }
                result
            }
        }
    }
}

impl Staged {
    /// Put the staged bundle in place of the running one; returns the window
    /// binary to start. On failure the old bundle is back in place.
    fn commit(self) -> anyhow::Result<PathBuf> {
        match self.kind {
            StagedKind::Folder {
                dir,
                staging,
                new_root,
            } => {
                #[cfg(target_os = "linux")]
                keep_sandbox_helper(&dir, &new_root);
                let r = crate::bundle::replace(&dir, &new_root, &dir.join(PREVIOUS));
                if r.is_err() && !dir.join("chrome-sandbox").exists() {
                    let _ = fs::rename(new_root.join("chrome-sandbox"), dir.join("chrome-sandbox"));
                }
                let _ = fs::remove_dir_all(&staging);
                r?;
                // What cannot go yet (on Windows, the DLLs this process still
                // has loaded) goes when the next update is staged.
                let _ = fs::remove_dir_all(dir.join(PREVIOUS));
            }
            StagedKind::Bundle {
                app,
                staging,
                new_app,
            } => {
                let mut backup = app.clone().into_os_string();
                backup.push(".old");
                let backup = PathBuf::from(backup);
                let _ = fs::remove_dir_all(&backup);
                let r = (|| -> std::io::Result<()> {
                    fs::rename(&app, &backup)?;
                    if let Err(e) = fs::rename(&new_app, &app) {
                        let _ = fs::rename(&backup, &app);
                        return Err(e);
                    }
                    Ok(())
                })();
                let _ = fs::remove_dir_all(&staging);
                r?;
            }
        }
        Ok(self.exe)
    }
}

/// Unpack with the system's own tools: `tar` on Linux and Windows (Windows
/// 10 and later ship bsdtar, which reads zip), `ditto` on macOS, which keeps
/// the bundle's signature and symlinks intact.
fn unpack(archive: &Path, into: &Path) -> anyhow::Result<()> {
    let mut cmd = if cfg!(target_os = "macos") {
        let mut c = Command::new("/usr/bin/ditto");
        c.args(["-x", "-k"]).arg(archive).arg(into);
        c
    } else if cfg!(windows) {
        let tar = std::env::var_os("SystemRoot")
            .map(|r| PathBuf::from(r).join("System32").join("tar.exe"))
            .filter(|p| p.is_file())
            .unwrap_or_else(|| PathBuf::from("tar.exe"));
        let mut c = Command::new(tar);
        crate::startup::no_console(&mut c);
        c.arg("-xf").arg(archive).arg("-C").arg(into);
        c
    } else {
        let mut c = Command::new("tar");
        c.arg("-xzf").arg(archive).arg("-C").arg(into);
        c
    };
    let out = cmd.stdin(Stdio::null()).output()?;
    if !out.status.success() {
        anyhow::bail!(
            "could not unpack the update: {}",
            String::from_utf8_lossy(&out.stderr).trim()
        );
    }
    Ok(())
}

/// The folder (the root or one level down) that holds `file`.
fn find_dir_with(root: &Path, file: &str) -> Option<PathBuf> {
    if root.join(file).is_file() {
        return Some(root.to_path_buf());
    }
    fs::read_dir(root)
        .ok()?
        .filter_map(Result::ok)
        .map(|e| e.path())
        .find(|p| p.is_dir() && p.join(file).is_file())
}

fn make_executable(path: &Path) -> std::io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(path, fs::Permissions::from_mode(0o755))?;
    }
    let _ = path;
    Ok(())
}

/// A `chrome-sandbox` someone made the set-user-ID root helper (only root can)
/// stays one across an update that ships the same helper: the old file moves
/// into the new bundle instead of the unprivileged copy from the archive.
#[cfg(target_os = "linux")]
fn keep_sandbox_helper(dir: &Path, new_root: &Path) {
    use std::os::unix::fs::{MetadataExt, PermissionsExt};
    let old = dir.join("chrome-sandbox");
    let new = new_root.join("chrome-sandbox");
    let Ok(m) = fs::metadata(&old) else { return };
    if m.uid() != 0 || m.permissions().mode() & 0o4000 == 0 {
        return;
    }
    let same = match (fs::read(&old), fs::read(&new)) {
        (Ok(a), Ok(b)) => a == b,
        _ => false,
    };
    if same {
        // A rename over the archive's copy: the new bundle always has one.
        if fs::rename(&old, &new).is_err() {
            eprintln!("redrob-browser: chrome-sandbox could not be kept; set it up again after the update");
        }
    }
}
