//! The installed bundle: the folder (Linux, Windows) or `.app` (macOS) a
//! release package unpacks to. Besides the programs it holds the CEF runtime
//! (libcef, its `.pak` resources, `icudtl.dat`, the V8 snapshot, `locales/`),
//! `CREDITS.html` with Chromium's and CEF's licences, and
//! `bundle-manifest.txt`, which lists every file of the bundle
//! (`scripts/package-linux.sh`, `scripts/package-macos.sh`, the Windows job in
//! `.github/workflows/release.yml`, docs/RELEASE.md).

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

/// Every file of the bundle, one relative path per line, `/`-separated.
pub const MANIFEST: &str = "bundle-manifest.txt";

/// Where `CREDITS.html` (Chromium's and CEF's licences) sits for the running
/// window: beside the programs, or in `Contents/Resources` of the macOS app.
/// The About page links it; `None` when this copy is not a release bundle
/// (a `cargo run`).
pub fn credits_file() -> Option<PathBuf> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?;
    let path = if cfg!(target_os = "macos") {
        dir.parent()?.join("Resources").join("CREDITS.html")
    } else {
        dir.join("CREDITS.html")
    };
    path.is_file().then_some(path)
}

/// The top-level entries the manifest in `dir` names (`locales/en-US.pak`
/// names `locales`). Empty when `dir` has no manifest (a package from before
/// the CEF runtime, which held only the programs and the licence files).
fn manifest_tops(dir: &Path) -> Vec<String> {
    let Ok(text) = fs::read_to_string(dir.join(MANIFEST)) else {
        return Vec::new();
    };
    let mut tops: Vec<String> = text
        .lines()
        .filter_map(|l| l.split('/').next())
        .filter(|t| !t.is_empty() && *t != "." && *t != ".." && !t.contains('\\'))
        .map(str::to_string)
        .collect();
    tops.sort();
    tops.dedup();
    tops
}

/// Check an unpacked bundle: every file its manifest lists is there. A
/// package without a manifest predates the CEF runtime and passes.
pub fn check_complete(root: &Path) -> io::Result<()> {
    let Ok(text) = fs::read_to_string(root.join(MANIFEST)) else {
        return Ok(());
    };
    for line in text.lines().filter(|l| !l.is_empty()) {
        if line.starts_with('/') || line.split('/').any(|p| p == "..") {
            return Err(io::Error::other(format!("bad manifest entry {line}")));
        }
        if !root.join(line).is_file() {
            return Err(io::Error::other(format!("the package has no {line}")));
        }
    }
    Ok(())
}

enum Step {
    /// `from` was renamed to `to`.
    Moved(PathBuf, PathBuf),
    /// The folder was created.
    MadeDir(PathBuf),
}

/// Replace the bundle in `dir` with the one unpacked in `new_root`: every
/// top-level entry the new bundle has, or the old bundle's manifest names,
/// moves from `dir` into `backup`, and the new entry moves into its place.
/// Files in `dir` that belong to neither bundle stay. All moves are renames
/// within one file system. A folder that cannot be renamed as a whole (on
/// Windows, one holding a loaded DLL) is replaced file by file. When any
/// step fails every step already taken is undone in reverse, so `dir` holds
/// either the whole old bundle or the whole new one.
pub fn replace(dir: &Path, new_root: &Path, backup: &Path) -> io::Result<()> {
    let mut tops = manifest_tops(dir);
    for e in fs::read_dir(new_root)? {
        tops.push(e?.file_name().to_string_lossy().into_owned());
    }
    tops.sort();
    tops.dedup();
    tops.retain(|t| !t.starts_with(".redrob-"));

    let _ = fs::remove_dir_all(backup);
    fs::create_dir_all(backup)?;
    let mut journal = Vec::new();
    for top in &tops {
        let rel = Path::new(top);
        if let Err(e) = swap(dir, new_root, backup, rel, &mut journal) {
            undo(journal);
            return Err(io::Error::new(
                e.kind(),
                format!("could not replace {}: {e}", dir.join(rel).display()),
            ));
        }
    }
    Ok(())
}

fn exists(p: &Path) -> bool {
    fs::symlink_metadata(p).is_ok()
}

fn swap(
    dir: &Path,
    new_root: &Path,
    backup: &Path,
    rel: &Path,
    journal: &mut Vec<Step>,
) -> io::Result<()> {
    let cur = dir.join(rel);
    let new = new_root.join(rel);
    let bak = backup.join(rel);
    let has_new = exists(&new);
    if exists(&cur) {
        match fs::rename(&cur, &bak) {
            Ok(()) => journal.push(Step::Moved(cur.clone(), bak)),
            Err(e) if cur.is_dir() && (!has_new || new.is_dir()) => {
                // Replace what is inside instead.
                let _ = e;
                fs::create_dir(&bak)?;
                journal.push(Step::MadeDir(bak));
                let mut names: Vec<_> = fs::read_dir(&cur)?
                    .map(|e| e.map(|e| e.file_name()))
                    .collect::<io::Result<_>>()?;
                if has_new {
                    for e in fs::read_dir(&new)? {
                        names.push(e?.file_name());
                    }
                }
                names.sort();
                names.dedup();
                for n in names {
                    swap(dir, new_root, backup, &rel.join(n), journal)?;
                }
                return Ok(());
            }
            Err(e) => return Err(e),
        }
    }
    if has_new {
        fs::rename(&new, &cur)?;
        journal.push(Step::Moved(new, cur));
    }
    Ok(())
}

fn undo(journal: Vec<Step>) {
    for step in journal.into_iter().rev() {
        let r = match &step {
            Step::Moved(from, to) => fs::rename(to, from),
            Step::MadeDir(p) => fs::remove_dir(p),
        };
        if let Err(e) = r {
            let what = match &step {
                Step::Moved(from, to) => format!("{} -> {}", to.display(), from.display()),
                Step::MadeDir(p) => p.display().to_string(),
            };
            eprintln!("redrob-browser: could not undo the update step {what}: {e}");
        }
    }
}
