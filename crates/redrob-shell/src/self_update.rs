//! In-place update. When `updater` finds a newer release, the window can fetch
//! the package for this platform into the profile folder, check its SHA-256
//! against the release's `SHA256SUMS.txt`, and put the new files where the
//! running ones are:
//!
//! - Linux: the `.tar.gz` is unpacked into a folder next to the binaries and
//!   each of the three binaries is renamed over the old one (the old file is
//!   kept as `<name>.old`).
//! - macOS: the `.zip` holds `Redrob Browser.app`; it is unpacked next to the
//!   running bundle, checked with `codesign --verify --deep --strict`, and
//!   swapped in, the old bundle kept as `Redrob Browser.app.old`.
//! - Windows: the running `.exe` files are renamed to `.exe.old` (Windows
//!   allows renaming a running program) and the new ones moved in.
//!
//! The new version runs after "Restart to update", which saves the session,
//! closes the window, and starts the window binary again once the engine has
//! stopped. When the install folder cannot be written (a system package, a
//! read-only volume) the window offers the download page instead.

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

/// The window binary to start after the window has closed and the engine stopped.
static RESTART: Mutex<Option<PathBuf>> = Mutex::new(None);

enum Msg {
    Progress(String),
    Ready(PathBuf),
    Failed(String),
}

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
    ready: Option<PathBuf>,
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
                Ok(exe) => send(Msg::Ready(exe)),
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
                Msg::Ready(exe) => {
                    self.ready = Some(exe);
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

    /// Start the new window after this one exits; the caller closes the window.
    pub fn restart(&self) {
        if let Some(exe) = &self.ready {
            *RESTART.lock().unwrap_or_else(|e| e.into_inner()) = Some(exe.clone());
        }
    }
}

/// Call from `main` after the window closed and the engine stopped.
pub fn restart_if_requested() {
    let exe = RESTART.lock().unwrap_or_else(|e| e.into_inner()).take();
    if let Some(exe) = exe {
        if let Err(e) = Command::new(&exe)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
        {
            eprintln!("redrob-browser: could not start {}: {e}", exe.display());
        }
    }
}

fn run(a: &Available, dir: &Path, send: &dyn Fn(Msg)) -> anyhow::Result<PathBuf> {
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
    let exe = install.apply(&archive)?;
    let _ = fs::remove_file(&archive);
    Ok(exe)
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
    /// Put the package's files in place; returns the window binary to start.
    fn apply(&self, archive: &Path) -> anyhow::Result<PathBuf> {
        match &self.kind {
            Kind::Folder { dir } => {
                let staging = dir.join(format!(".redrob-update-{}", std::process::id()));
                let _ = fs::remove_dir_all(&staging);
                fs::create_dir_all(&staging)?;
                let result = (|| -> anyhow::Result<PathBuf> {
                    unpack(archive, &staging)?;
                    let window = binaries()[2].clone();
                    let from = find_dir_with(&staging, &window)
                        .ok_or_else(|| anyhow::anyhow!("the package has no {window}"))?;
                    let pairs: Vec<(PathBuf, PathBuf)> = binaries()
                        .iter()
                        .map(|b| (from.join(b), dir.join(b)))
                        .collect();
                    for (new, _) in &pairs {
                        if !new.is_file() {
                            anyhow::bail!("the package has no {}", new.display());
                        }
                        make_executable(new)?;
                    }
                    swap_files(&pairs)?;
                    Ok(dir.join(window))
                })();
                let _ = fs::remove_dir_all(&staging);
                result
            }
            Kind::Bundle { app, exe_name } => {
                let parent = app
                    .parent()
                    .ok_or_else(|| anyhow::anyhow!("the app has no folder"))?;
                let staging = parent.join(format!(".redrob-update-{}", std::process::id()));
                let _ = fs::remove_dir_all(&staging);
                fs::create_dir_all(&staging)?;
                let result = (|| -> anyhow::Result<PathBuf> {
                    unpack(archive, &staging)?;
                    let new_app = fs::read_dir(&staging)?
                        .filter_map(Result::ok)
                        .map(|e| e.path())
                        .find(|p| p.extension().is_some_and(|e| e == "app") && p.is_dir())
                        .ok_or_else(|| anyhow::anyhow!("the package has no .app"))?;
                    if !new_app.join("Contents/MacOS").join(exe_name).is_file() {
                        anyhow::bail!("the new app has no {}", Path::new(exe_name).display());
                    }
                    let status = Command::new("/usr/bin/codesign")
                        .args(["--verify", "--deep", "--strict"])
                        .arg(&new_app)
                        .stdin(Stdio::null())
                        .stdout(Stdio::null())
                        .status()?;
                    if !status.success() {
                        anyhow::bail!("{}", t("the new app's signature did not verify"));
                    }
                    let mut backup = app.clone().into_os_string();
                    backup.push(".old");
                    let backup = PathBuf::from(backup);
                    let _ = fs::remove_dir_all(&backup);
                    fs::rename(app, &backup)?;
                    if let Err(e) = fs::rename(&new_app, app) {
                        let _ = fs::rename(&backup, app);
                        return Err(e.into());
                    }
                    Ok(app.join("Contents/MacOS").join(exe_name))
                })();
                let _ = fs::remove_dir_all(&staging);
                result
            }
        }
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

fn old_path(target: &Path) -> PathBuf {
    let mut s = target.as_os_str().to_os_string();
    s.push(".old");
    PathBuf::from(s)
}

/// Replace each target with its new file, keeping `<target>.old`. On Unix the
/// rename over the target is atomic and the old file is kept as a hard link;
/// on Windows a running program cannot be replaced but can be renamed, so the
/// target moves to `.old` first. A failure puts back what was already swapped.
fn swap_files(pairs: &[(PathBuf, PathBuf)]) -> anyhow::Result<()> {
    let mut done: Vec<&PathBuf> = Vec::new();
    for (new, target) in pairs {
        let backup = old_path(target);
        let step = (|| -> std::io::Result<()> {
            let _ = fs::remove_file(&backup);
            if cfg!(windows) {
                fs::rename(target, &backup)?;
                if let Err(e) = fs::rename(new, target) {
                    let _ = fs::rename(&backup, target);
                    return Err(e);
                }
            } else {
                if fs::hard_link(target, &backup).is_err() {
                    fs::copy(target, &backup)?;
                }
                fs::rename(new, target)?;
            }
            Ok(())
        })();
        if let Err(e) = step {
            for t in done.into_iter().rev() {
                let b = old_path(t);
                if cfg!(windows) {
                    let _ = fs::remove_file(t);
                }
                let _ = fs::rename(&b, t);
            }
            return Err(anyhow::anyhow!(
                "could not replace {}: {e}",
                target.display()
            ));
        }
        done.push(target);
    }
    Ok(())
}
