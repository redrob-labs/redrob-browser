//! Start-up plumbing for Windows, where the window is a GUI program with no
//! console: a failure there would otherwise show nothing at all.
//!
//! - [`init`] points the process's standard error at
//!   `<data>/redrob-browser/logs/window.log`, so the window's own messages,
//!   panics and the engine's standard error (the engine inherits it) land in
//!   that file.
//! - [`fail`] shows a message box when the window cannot start.
//! - [`no_console`] keeps a console program the window starts (the engine,
//!   `tar`) from opening a console window of its own.
//!
//! On other systems [`init`] and [`no_console`] do nothing and [`fail`] only
//! prints, since a terminal or the system log already shows standard error.

use std::path::PathBuf;
use std::process::Command;

/// The log file the window writes on Windows.
#[cfg_attr(not(windows), allow(dead_code))]
pub fn log_path() -> PathBuf {
    crate::profile::data_dir()
        .join("redrob-browser")
        .join("logs")
        .join("window.log")
}

/// Send standard error to the log file (Windows), and show a message box when
/// the main thread panics.
pub fn init() {
    #[cfg(windows)]
    {
        use std::io::Write;
        use std::os::windows::io::IntoRawHandle;
        use windows_sys::Win32::System::Console::{SetStdHandle, STD_ERROR_HANDLE};

        let path = log_path();
        if let Some(dir) = path.parent() {
            let _ = std::fs::create_dir_all(dir);
        }
        // Keep one file of a few megabytes: start over when it has grown past that.
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > 4 * 1024 * 1024) {
            let _ = std::fs::remove_file(&path);
        }
        if let Ok(mut file) = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
        {
            let _ = writeln!(
                file,
                "--- redrob-browser-window {} started, pid {}",
                env!("CARGO_PKG_VERSION"),
                std::process::id()
            );
            // The handle stays open for the life of the process: std's stderr
            // and every child started with Stdio::inherit() write to it.
            let handle = file.into_raw_handle();
            unsafe {
                SetStdHandle(STD_ERROR_HANDLE, handle);
            }
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

/// Report that the window could not start: a message box on Windows, standard
/// error everywhere.
pub fn fail(error: &dyn std::fmt::Display) {
    eprintln!("redrob-browser: could not start: {error}");
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
