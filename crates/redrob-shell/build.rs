//! Windows: put the app icon into the .exe files, so Explorer, the taskbar and
//! the Start menu shortcut show it, and CEF's application manifest.

fn main() {
    println!("cargo:rerun-if-changed=../../assets/redrob-browser.ico");
    println!("cargo:rerun-if-changed=../../installer/windows/redrob-browser.exe.manifest");
    #[cfg(windows)]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut res = winresource::WindowsResource::new();
        res.set_icon("../../assets/redrob-browser.ico");
        res.set("ProductName", "Redrob Browser");
        res.set("FileDescription", "Redrob Browser");
        // CEF's application manifest: Chromium needs Windows 10 declared as supported.
        res.set_manifest(include_str!(
            "../../installer/windows/redrob-browser.exe.manifest"
        ));
        res.compile().expect("embed the Windows icon");
    }
}
