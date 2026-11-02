//! Start-up plumbing: the window's log file, and a visible failure on
//! Windows, where the window is a GUI program with no console.
//!
//! - [`init`] makes the process's standard error also land in
//!   `<data>/redrob-browser/logs/window.log`, so the window's own messages,
//!   panics and the engine's standard error (the engine inherits it) are in
//!   that file. On Linux and macOS standard error still reaches the terminal
//!   too, through a pipe a thread copies to both; on Windows there is no
//!   terminal, so standard error is the file. The file starts over past a few
//!   megabytes, keeping the previous one as `window.log.1`.
//! - [`fail`] shows a message box when the window cannot start (Windows).
//! - [`no_console`] keeps a console program the window starts (the engine,
//!   `tar`) from opening a console window of its own.

use std::path::PathBuf;
use std::process::Command;

/// Past this size the log starts over (the old one becomes `window.log.1`).
const LOG_MAX: u64 = 4 * 1024 * 1024;

/// The folder the window's log files are in.
pub fn log_dir() -> PathBuf {
    crate::profile::data_dir()
        .join("redrob-browser")
        .join("logs")
}

/// The log file the window writes.
pub fn log_path() -> PathBuf {
    log_dir().join("window.log")
}

/// Show the logs folder in the system's file manager.
pub fn open_log_dir() {
    let dir = log_dir();
    let _ = std::fs::create_dir_all(&dir);
    if let Err(e) = open::that_detached(&dir) {
        eprintln!("redrob-browser: could not open {}: {e}", dir.display());
    }
}

/// Keep the current log as `window.log.1` and start a new one.
fn rotate(path: &std::path::Path) {
    let _ = std::fs::rename(path, path.with_extension("log.1"));
}

fn open_log() -> Option<std::fs::File> {
    use std::io::Write;
    let path = log_path();
    if let Some(dir) = path.parent() {
        let _ = std::fs::create_dir_all(dir);
    }
    if std::fs::metadata(&path).is_ok_and(|m| m.len() > LOG_MAX) {
        rotate(&path);
    }
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .ok()?;
    let _ = writeln!(
        file,
        "--- redrob-browser-window {} started, pid {}, {} s after 1970",
        env!("CARGO_PKG_VERSION"),
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0)
    );
    Some(file)
}

/// Send standard error to the log file as well, and show a message box when
/// the main thread panics (Windows).
pub fn init() {
    let Some(file) = open_log() else {
        return;
    };
    #[cfg(unix)]
    tee(file);
    #[cfg(windows)]
    {
        use std::os::windows::io::IntoRawHandle;
        use windows_sys::Win32::System::Console::{SetStdHandle, STD_ERROR_HANDLE};

        // The handle stays open for the life of the process: std's stderr
        // and every child started with Stdio::inherit() write to it.
        let handle = file.into_raw_handle();
        unsafe {
            SetStdHandle(STD_ERROR_HANDLE, handle);
        }

        let default = std::panic::take_hook();
        std::panic::set_hook(Box::new(move |info| {
            default(info);
            if std::thread::current().name() == Some("main") {
                message_box(&info.to_string());
            }
        }));
    }
}

/// Point fd 2 at a pipe, and copy what comes out of it to the original
/// standard error and to the log file. Children (the engine's helpers)
/// inherit fd 2, so their messages go the same way.
#[cfg(unix)]
fn tee(mut file: std::fs::File) {
    use std::io::{Read, Write};
    use std::os::fd::FromRawFd;

    let mut fds = [0; 2];
    // SAFETY: plain fd calls on fds this function owns.
    let (reader, console) = unsafe {
        if libc::pipe(fds.as_mut_ptr()) != 0 {
            return;
        }
        let original = libc::dup(2);
        if original < 0 || libc::dup2(fds[1], 2) < 0 {
            libc::close(fds[0]);
            libc::close(fds[1]);
            if original >= 0 {
                libc::close(original);
            }
            return;
        }
        libc::close(fds[1]);
        // Children get fd 2 (the pipe), not these two.
        libc::fcntl(fds[0], libc::F_SETFD, libc::FD_CLOEXEC);
        libc::fcntl(original, libc::F_SETFD, libc::FD_CLOEXEC);
        (
            std::fs::File::from_raw_fd(fds[0]),
            std::fs::File::from_raw_fd(original),
        )
    };
    let spawned = std::thread::Builder::new()
        .name("redrob-log".into())
        .spawn(move || {
            let (mut reader, mut console) = (reader, console);
            let mut written = file.metadata().map(|m| m.len()).unwrap_or(0);
            let mut buf = [0u8; 8192];
            loop {
                let n = match reader.read(&mut buf) {
                    Ok(0) => return,
                    Ok(n) => n,
                    Err(e) if e.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => return,
                };
                let _ = console.write_all(&buf[..n]);
                let _ = file.write_all(&buf[..n]);
                written += n as u64;
                if written > LOG_MAX {
                    let path = log_path();
                    rotate(&path);
                    if let Ok(f) = std::fs::OpenOptions::new()
                        .create(true)
                        .append(true)
                        .open(&path)
                    {
                        file = f;
                        written = 0;
                    }
                }
            }
        });
    if spawned.is_err() {
        return;
    }
    // A panic's message goes through the pipe: give the copying thread a
    // moment before the process is gone.
    let default = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        default(info);
        std::thread::sleep(std::time::Duration::from_millis(200));
    }));
}

/// Report that the window could not start: a message box on Windows, standard
/// error everywhere.
pub fn fail(error: &dyn std::fmt::Display) {
    eprintln!("redrob-browser: could not start: {error}");
    // Let the log thread copy the line before main returns.
    #[cfg(unix)]
    std::thread::sleep(std::time::Duration::from_millis(100));
    #[cfg(windows)]
    message_box(&error.to_string());
}

#[cfg(windows)]
fn message_box(detail: &str) {
    use windows_sys::Win32::UI::WindowsAndMessaging::{MessageBoxW, MB_ICONERROR, MB_OK};

    let text = crate::i18n::tf(
        "Redrob Browser could not start.\n\n{0}\n\nDetails are in {1}",
        &[&detail, &log_path().display()],
    );
    let wide = |s: &str| s.encode_utf16().chain([0]).collect::<Vec<u16>>();
    let (text, caption) = (wide(&text), wide(crate::i18n::t("Redrob Browser")));
    unsafe {
        MessageBoxW(
            std::ptr::null_mut(),
            text.as_ptr(),
            caption.as_ptr(),
            MB_OK | MB_ICONERROR,
        );
    }
}

/// Start a console program without a console window (Windows'
/// CREATE_NO_WINDOW). Its standard streams still work.
pub fn no_console(cmd: &mut Command) -> &mut Command {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}
