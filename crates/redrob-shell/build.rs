//! Windows: put the app icon into the .exe files, so Explorer, the taskbar and
//! the Start menu shortcut show it.

fn main() {
    println!("cargo:rerun-if-changed=../../assets/redrob-browser.ico");
    #[cfg(windows)]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("../../assets/redrob-browser.ico");
        res.set("ProductName", "Redrob Browser");
        res.set("FileDescription", "Redrob Browser");
        res.compile().expect("embed the Windows icon");
    }
}
