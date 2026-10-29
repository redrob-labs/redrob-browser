//! Fonts for inline layout: one fontique collection per document font set.
//!
//! The collection holds the bundled faces (Chrome on this class of host
//! renders `sans-serif` and the Arial/Helvetica stacks as Liberation Sans,
//! `system-ui` as DejaVu Sans, `serif` as Liberation Serif and `monospace`
//! as Liberation Mono), the operator's configured font directories, the
//! color emoji face when the document needs it, and the document's web
//! fonts. The system font scan is never used, so layout stays deterministic
//! across hosts.

use std::{
    borrow::Cow,
    cell::RefCell,
    collections::{hash_map::DefaultHasher, VecDeque},
    hash::{Hash, Hasher},
    path::PathBuf,
    sync::{Arc, OnceLock},
};

use fontique::{
    Blob, Collection, CollectionOptions, FallbackKey, FamilyId, FontInfoOverride, FontStyle,
    FontWeight, GenericFamily, Script, ScriptExt, SourceCache,
};
use parley::{FontContext, FontFamily, FontFamilyName};

pub(crate) static SANS_R: &[u8] = include_bytes!("../../assets/liberation-sans.ttf");
pub(crate) static SANS_B: &[u8] = include_bytes!("../../assets/liberation-sans-bold.ttf");
pub(crate) static SANS_O: &[u8] = include_bytes!("../../assets/liberation-sans-oblique.ttf");
pub(crate) static SANS_BO: &[u8] = include_bytes!("../../assets/liberation-sans-boldoblique.ttf");
pub(crate) static SERIF_R: &[u8] = include_bytes!("../../assets/liberation-serif.ttf");
pub(crate) static SERIF_B: &[u8] = include_bytes!("../../assets/liberation-serif-bold.ttf");
pub(crate) static SERIF_O: &[u8] = include_bytes!("../../assets/liberation-serif-oblique.ttf");
pub(crate) static SERIF_BO: &[u8] = include_bytes!("../../assets/liberation-serif-boldoblique.ttf");
pub(crate) static MONO_R: &[u8] = include_bytes!("../../assets/liberation-mono.ttf");
pub(crate) static MONO_B: &[u8] = include_bytes!("../../assets/liberation-mono-bold.ttf");
pub(crate) static MONO_O: &[u8] = include_bytes!("../../assets/liberation-mono-oblique.ttf");
pub(crate) static MONO_BO: &[u8] = include_bytes!("../../assets/liberation-mono-boldoblique.ttf");
pub(crate) static SYSTEM_R: &[u8] = include_bytes!("../../assets/dejavu-sans.ttf");
pub(crate) static SYSTEM_B: &[u8] = include_bytes!("../../assets/dejavu-sans-bold.ttf");
pub(crate) static EMOJI_R: &[u8] = include_bytes!("../../assets/noto-color-emoji.ttf");

pub(crate) const SANS_FAMILY: &str = "Liberation Sans";
pub(crate) const SERIF_FAMILY: &str = "Liberation Serif";
pub(crate) const MONO_FAMILY: &str = "Liberation Mono";
pub(crate) const SYSTEM_FAMILY: &str = "DejaVu Sans";
/// The glyph-fallback registration of DejaVu Sans (see `build_collection`).
const FALLBACK_FAMILY: &str = "Obscura Fallback DejaVu Sans";
pub(crate) const EMOJI_FAMILY: &str = "Noto Color Emoji";

/// A font supplied by the document (`@font-face`, FontFace).
#[derive(Clone, Eq, PartialEq)]
pub(crate) struct WebFont {
    pub data: Arc<Vec<u8>>,
    pub family: Option<String>,
    pub weight: Option<(u16, u16)>,
    pub italic: Option<bool>,
}

static FONT_DIRECTORIES: OnceLock<Vec<PathBuf>> = OnceLock::new();
static FONTS_INITIALIZED: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Configure additional process-wide font directories before the first render.
///
/// Returns false when fonts have already been configured or initialized.
pub fn configure_font_directories(directories: Vec<PathBuf>) -> bool {
    if FONTS_INITIALIZED.load(std::sync::atomic::Ordering::Acquire) {
        return false;
    }
    FONT_DIRECTORIES.set(directories).is_ok()
}

/// The configured font directories (empty unless the operator set some).
pub(crate) fn font_directories() -> &'static [PathBuf] {
    FONTS_INITIALIZED.store(true, std::sync::atomic::Ordering::Release);
    FONT_DIRECTORIES.get_or_init(Vec::new)
}

/// Font files under the configured directories, sorted, symlinks skipped.
fn directory_font_files() -> &'static [Arc<Vec<u8>>] {
    static FILES: OnceLock<Vec<Arc<Vec<u8>>>> = OnceLock::new();
    FILES.get_or_init(|| {
        let mut pending = font_directories().to_vec();
        let mut files = Vec::new();
        while let Some(directory) = pending.pop() {
            let Ok(entries) = std::fs::read_dir(directory) else {
                continue;
            };
            for entry in entries.flatten() {
                let Ok(file_type) = entry.file_type() else {
                    continue;
                };
                if file_type.is_symlink() {
                    continue;
                }
                let path = entry.path();
                if file_type.is_dir() {
                    pending.push(path);
                } else if file_type.is_file()
                    && path
                        .extension()
                        .and_then(|extension| extension.to_str())
                        .is_some_and(|extension| {
                            matches!(
                                extension.to_ascii_lowercase().as_str(),
                                "ttf" | "ttc" | "otf" | "otc"
                            )
                        })
                {
                    files.push(path);
                }
            }
        }
        files.sort_unstable();
        files.dedup();
        files
            .into_iter()
            .filter_map(|path| std::fs::read(path).ok().map(Arc::new))
            .collect()
    })
}

/// The bundled family a CSS `font-family` token resolves to, the way
/// Chromium resolves it on this host: generic families, the bundled faces
/// and their fontconfig metric aliases (Arial and Helvetica are Liberation
/// Sans, Times is Liberation Serif, Courier is Liberation Mono). Any other
/// name (Verdana, Segoe UI, Roboto, Georgia, Menlo, ...) is not installed,
/// so Chromium moves on to the next family in the list; `None` here.
pub(crate) fn bundled_family_for_css_token(token: &str) -> Option<&'static str> {
    let token = token
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .trim()
        .to_ascii_lowercase();
    match token.as_str() {
        "" => None,
        "system-ui" | "ui-sans-serif" | "dejavu sans" => Some(SYSTEM_FAMILY),
        "monospace" | "ui-monospace" | "liberation mono" | "courier new" | "courier"
        | "cousine" => Some(MONO_FAMILY),
        "serif" | "ui-serif" | "liberation serif" | "times new roman" | "times" | "tinos" => {
            Some(SERIF_FAMILY)
        }
        "sans-serif" | "liberation sans" | "arial" | "helvetica" | "arimo" => Some(SANS_FAMILY),
        "emoji" | "noto color emoji" => Some(EMOJI_FAMILY),
        _ => None,
    }
}

/// The family Chromium uses when no family in the list is available: its
/// default standard font, Times New Roman (Liberation Serif here).
pub(crate) const DEFAULT_FAMILY: &str = SERIF_FAMILY;

fn signature(fonts: &[WebFont], load_emoji: bool) -> u64 {
    let mut hasher = DefaultHasher::new();
    load_emoji.hash(&mut hasher);
    fonts.len().hash(&mut hasher);
    for font in fonts {
        font.family.hash(&mut hasher);
        font.weight.hash(&mut hasher);
        font.italic.hash(&mut hasher);
        let data = font.data.as_slice();
        data.len().hash(&mut hasher);
        data[..data.len().min(64)].hash(&mut hasher);
        if data.len() > 64 {
            data[data.len() - 64..].hash(&mut hasher);
        }
    }
    hasher.finish()
}

/// The fonts of one document layout.
pub(crate) struct Fonts {
    pub(crate) context: FontContext,
    signature: u64,
    web_fonts: Vec<WebFont>,
    load_emoji: bool,
}

const CACHED_FONT_SETS: usize = 8;

thread_local! {
    static FONT_SETS: RefCell<VecDeque<Fonts>> = const { RefCell::new(VecDeque::new()) };
}

fn static_blob(bytes: &'static [u8]) -> Blob<u8> {
    Blob::new(Arc::new(bytes))
}

fn build_collection(web_fonts: &[WebFont], load_emoji: bool) -> Collection {
    let mut collection = Collection::new(CollectionOptions {
        shared: false,
        system_fonts: false,
    });
    let mut order: Vec<FamilyId> = Vec::new();
    let register = |collection: &mut Collection,
                    order: &mut Vec<FamilyId>,
                    blob: Blob<u8>,
                    info: Option<FontInfoOverride<'_>>| {
        for (family, _) in collection.register_fonts(blob, info) {
            if !order.contains(&family) {
                order.push(family);
            }
        }
    };
    for bytes in [
        SANS_R, SANS_B, SANS_O, SANS_BO, SYSTEM_R, SYSTEM_B, SERIF_R, SERIF_B, SERIF_O, SERIF_BO,
        MONO_R, MONO_B, MONO_O, MONO_BO,
    ] {
        register(&mut collection, &mut order, static_blob(bytes), None);
    }
    for data in directory_font_files() {
        register(
            &mut collection,
            &mut order,
            Blob::new(Arc::clone(data) as Arc<dyn AsRef<[u8]> + Send + Sync>),
            None,
        );
    }
    for font in web_fonts {
        // A face declared for a weight range (`font-weight: 100 900`) is
        // registered at the top of its range: requests inside it match the
        // face without synthetic bold (CSS Fonts 4 §5.2), and a family with
        // several ranged faces still orders them by range.
        let declared_weight = font.weight.map(|(_, max)| FontWeight::new(max as f32));
        let info = FontInfoOverride {
            family_name: font.family.as_deref(),
            width: None,
            style: font.italic.map(|italic| {
                if italic {
                    FontStyle::Italic
                } else {
                    FontStyle::Normal
                }
            }),
            weight: declared_weight,
            axes: None,
        };
        let blob = Blob::new(Arc::clone(&font.data) as Arc<dyn AsRef<[u8]> + Send + Sync>);
        // Chromium on Linux shapes web fonts with whole-pixel advances.
        parley::mark_whole_pixel_advances(blob.id());
        register(&mut collection, &mut order, blob, Some(info));
    }
    if load_emoji {
        register(&mut collection, &mut order, static_blob(EMOJI_R), None);
    }

    let family = |collection: &mut Collection, name: &str| collection.family_id(name);
    let sans = family(&mut collection, SANS_FAMILY);
    let serif = family(&mut collection, SERIF_FAMILY);
    let mono = family(&mut collection, MONO_FAMILY);
    let system = family(&mut collection, SYSTEM_FAMILY);
    let emoji = family(&mut collection, EMOJI_FAMILY);
    for (generic, id) in [
        (GenericFamily::SansSerif, sans),
        (GenericFamily::Serif, serif),
        (GenericFamily::Monospace, mono),
        (GenericFamily::SystemUi, system),
        (GenericFamily::UiSansSerif, system),
        (GenericFamily::UiSerif, serif),
        (GenericFamily::UiMonospace, mono),
        (GenericFamily::UiRounded, sans),
        (GenericFamily::Cursive, sans),
        (GenericFamily::Fantasy, sans),
        (GenericFamily::Math, serif),
        (GenericFamily::Emoji, emoji.or(sans)),
        (GenericFamily::FangSong, sans),
    ] {
        if let Some(id) = id {
            collection.set_generic_families(generic, std::iter::once(id));
        }
    }

    // Glyph fallback after the authored families, the way Chromium asks
    // fontconfig on this host (`fc-match sans-serif:charset=...` starts at
    // DejaVu Sans). Chromium shapes fallback runs with whole-pixel advances
    // even where the same face named by the page keeps fractional ones (a
    // fallback ❮ at 100px is 84px wide; DejaVu Sans named, 83.80), so the
    // fallback uses its own registration of DejaVu Sans, marked whole-pixel.
    let mut fallback_faces: Vec<FamilyId> = Vec::new();
    // Own copies of the bytes: the shaper caches faces by their data, so a
    // second blob over the same static bytes would share the named face's
    // shaping (and its fractional advances).
    static FALLBACK_BYTES: OnceLock<[Arc<Vec<u8>>; 2]> = OnceLock::new();
    let copies =
        FALLBACK_BYTES.get_or_init(|| [Arc::new(SYSTEM_R.to_vec()), Arc::new(SYSTEM_B.to_vec())]);
    for bytes in copies {
        let blob = Blob::new(Arc::clone(bytes) as Arc<dyn AsRef<[u8]> + Send + Sync>);
        parley::mark_whole_pixel_advances(blob.id());
        let info = FontInfoOverride {
            family_name: Some(FALLBACK_FAMILY),
            width: None,
            style: None,
            weight: None,
            axes: None,
        };
        for (family, _) in collection.register_fonts(blob, Some(info)) {
            if !fallback_faces.contains(&family) {
                fallback_faces.push(family);
            }
        }
    }
    // Then the host's own fallback fonts in fontconfig's order for
    // sans-serif (CJK, Thai, Devanagari, ...), whole-pixel like DejaVu.
    // Registered under their own family names, so a page that names one
    // of these families gets its own (fractional) registration.
    for (index, data) in host_fallback_font_files().iter().enumerate() {
        let blob = Blob::new(Arc::clone(data) as Arc<dyn AsRef<[u8]> + Send + Sync>);
        parley::mark_whole_pixel_advances(blob.id());
        let name = format!("Obscura Host Fallback {index}");
        let info = FontInfoOverride {
            family_name: Some(&name),
            width: None,
            style: None,
            weight: None,
            axes: None,
        };
        for (family, _) in collection.register_fonts(blob, Some(info)) {
            if !fallback_faces.contains(&family) {
                fallback_faces.push(family);
            }
        }
    }
    // Then the bundled faces (DejaVu Sans covers most symbols), every other
    // loaded family in registration order, and emoji last.
    let mut fallback: Vec<FamilyId> = fallback_faces;
    fallback.extend([sans, system, serif, mono].into_iter().flatten());
    for id in order {
        if !fallback.contains(&id) && Some(id) != emoji {
            fallback.push(id);
        }
    }
    if let Some(emoji) = emoji {
        fallback.push(emoji);
    }
    let mut scripts: Vec<Script> = Script::all_samples()
        .iter()
        .map(|(script, _)| *script)
        .collect();
    for tag in [*b"Zyyy", *b"Zinh", *b"Zzzz", *b"Zsye", *b"Zsym", *b"Zmth"] {
        scripts.push(Script::from_bytes(tag));
    }
    for script in scripts {
        collection.set_fallbacks(FallbackKey::new(script, None), fallback.iter().copied());
    }
    collection
}

impl Fonts {
    /// The fonts for a document with these web fonts, from this thread's
    /// cache when an earlier layout used the same set.
    pub(crate) fn take(web_fonts: &[WebFont], load_emoji: bool) -> Self {
        let signature = signature(web_fonts, load_emoji);
        let cached = FONT_SETS
            .try_with(|sets| {
                let mut sets = sets.borrow_mut();
                let index = sets.iter().position(|set| {
                    set.signature == signature
                        && set.load_emoji == load_emoji
                        && set.web_fonts == web_fonts
                })?;
                sets.remove(index)
            })
            .ok()
            .flatten();
        cached.unwrap_or_else(|| Fonts {
            context: FontContext {
                collection: build_collection(web_fonts, load_emoji),
                source_cache: SourceCache::default(),
            },
            signature,
            web_fonts: web_fonts.to_vec(),
            load_emoji,
        })
    }

    /// Return the fonts to this thread's cache for the next layout.
    pub(crate) fn give_back(self) {
        let _ = FONT_SETS.try_with(|sets| {
            let mut sets = sets.borrow_mut();
            while sets.len() >= CACHED_FONT_SETS {
                sets.pop_front();
            }
            sets.push_back(self);
        });
    }

    /// Register the host-installed family `lower` (a lowercase family name)
    /// in this font set and return its name, or `None` when the host has no
    /// such family.
    fn register_host_family(&mut self, lower: &str) -> Option<String> {
        let (name, paths) = host_font_index().get(lower)?;
        for path in paths {
            let Some(mut data) = host_font_bytes(path) else {
                continue;
            };
            // The shaper caches faces by their bytes: a family that is also
            // a whole-pixel glyph fallback needs its own copy to keep
            // fractional advances when the page names it.
            if host_fallback_font_files()
                .iter()
                .any(|fallback| Arc::ptr_eq(fallback, &data))
            {
                data = Arc::new(data.as_ref().clone());
            }
            self.context
                .collection
                .register_fonts(Blob::new(data as Arc<dyn AsRef<[u8]> + Send + Sync>), None);
        }
        let id = self.context.collection.family_id(name)?;
        self.context
            .collection
            .family_name(id)
            .map(|family| family.to_string())
    }

    /// The Parley family list for a computed CSS `font-family` value.
    ///
    /// Each token resolves to a loaded family of that name, or else to the
    /// bundled family Chromium would use for it on this host. The UA default
    /// (Chromium's standard font, Times New Roman: Liberation Serif) ends the list.
    pub(crate) fn families(&mut self, css: Option<&str>) -> FontFamily<'static> {
        let mut names: Vec<FontFamilyName<'static>> = Vec::new();
        let push = |names: &mut Vec<FontFamilyName<'static>>, name: FontFamilyName<'static>| {
            if !names.contains(&name) {
                names.push(name);
            }
        };
        for token in css.unwrap_or("").split(',') {
            let name = token.trim().trim_matches(|c| c == '"' || c == '\'').trim();
            if name.is_empty() {
                continue;
            }
            let lower = name.to_ascii_lowercase();
            let generic = match lower.as_str() {
                "sans-serif" => Some(SANS_FAMILY),
                "serif" => Some(SERIF_FAMILY),
                "monospace" => Some(MONO_FAMILY),
                "system-ui" | "ui-sans-serif" => Some(SYSTEM_FAMILY),
                "emoji" => Some(EMOJI_FAMILY),
                _ => None,
            };
            if let Some(family) = generic {
                push(&mut names, FontFamilyName::Named(Cow::Borrowed(family)));
                continue;
            }
            if let Some(id) = self.context.collection.family_id(name) {
                if let Some(real) = self.context.collection.family_name(id) {
                    push(
                        &mut names,
                        FontFamilyName::Named(Cow::Owned(real.to_string())),
                    );
                    continue;
                }
            }
            if let Some(family) = bundled_family_for_css_token(name) {
                push(&mut names, FontFamilyName::Named(Cow::Borrowed(family)));
                continue;
            }
            // A family installed on the host (Chromium finds it through
            // fontconfig): register its files on first use.
            if let Some(real) = self.register_host_family(&lower) {
                push(&mut names, FontFamilyName::Named(Cow::Owned(real)));
            }
        }
        push(
            &mut names,
            FontFamilyName::Named(Cow::Borrowed(DEFAULT_FAMILY)),
        );
        FontFamily::List(Cow::Owned(names))
    }
}

/// Directories Chromium's fontconfig reads on Linux: the system and local
/// font trees and the user's (`OBSCURA_NO_HOST_FONTS` disables them).
fn host_font_directories() -> Vec<PathBuf> {
    if std::env::var_os("OBSCURA_NO_HOST_FONTS").is_some() || cfg!(not(target_os = "linux")) {
        return Vec::new();
    }
    let mut out = vec![
        PathBuf::from("/usr/share/fonts"),
        PathBuf::from("/usr/local/share/fonts"),
    ];
    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        out.push(home.join(".local/share/fonts"));
        out.push(home.join(".fonts"));
    }
    out
}

/// The host fonts Chromium falls back to for characters the page's fonts
/// lack: fontconfig's sorted, coverage-trimmed list for sans-serif
/// (`fc-match -s sans-serif`), without the faces bundled here (DejaVu,
/// Liberation) and emoji, which have their own registrations. Read once;
/// empty when fontconfig is unavailable or host fonts are disabled.
fn host_fallback_font_files() -> &'static [Arc<Vec<u8>>] {
    static FILES: OnceLock<Vec<Arc<Vec<u8>>>> = OnceLock::new();
    FILES.get_or_init(|| {
        if host_font_directories().is_empty() {
            return Vec::new();
        }
        let Ok(output) = std::process::Command::new("fc-match")
            .args(["-s", "-f", "%{file}\n", "sans-serif"])
            .stderr(std::process::Stdio::null())
            .output()
        else {
            return Vec::new();
        };
        if !output.status.success() {
            return Vec::new();
        }
        let mut seen = std::collections::HashSet::new();
        let mut files = Vec::new();
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let path = PathBuf::from(line.trim());
            let name = path
                .file_name()
                .and_then(|name| name.to_str())
                .unwrap_or("")
                .to_ascii_lowercase();
            if name.is_empty()
                || name.starts_with("dejavu")
                || name.starts_with("liberation")
                || name.contains("emoji")
                || !seen.insert(path.clone())
            {
                continue;
            }
            if let Some(data) = host_font_bytes(&path) {
                files.push(data);
            }
        }
        files
    })
}

/// Every font file under `roots` (no symlinked directories).
fn font_files_under(roots: Vec<PathBuf>) -> Vec<PathBuf> {
    let mut pending = roots;
    let mut files = Vec::new();
    while let Some(directory) = pending.pop() {
        let Ok(entries) = std::fs::read_dir(&directory) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            let path = entry.path();
            if file_type.is_dir() {
                pending.push(path);
            } else if path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    matches!(
                        extension.to_ascii_lowercase().as_str(),
                        "ttf" | "ttc" | "otf" | "otc"
                    )
                })
            {
                files.push(path);
            }
        }
    }
    files.sort();
    files
}

/// Host-installed families by lowercase family name: the name as the font
/// spells it and the files that hold its faces. Built once, from the
/// fonts' own name tables (typographic and legacy family names).
fn host_font_index() -> &'static std::collections::HashMap<String, (String, Vec<PathBuf>)> {
    static INDEX: OnceLock<std::collections::HashMap<String, (String, Vec<PathBuf>)>> =
        OnceLock::new();
    INDEX.get_or_init(|| {
        let mut index: std::collections::HashMap<String, (String, Vec<PathBuf>)> =
            std::collections::HashMap::new();
        for path in font_files_under(host_font_directories()) {
            let Ok(data) = std::fs::read(&path) else {
                continue;
            };
            let Some(collection) = swash::FontDataRef::new(&data) else {
                continue;
            };
            for font in collection.fonts() {
                for id in [swash::StringId::TypographicFamily, swash::StringId::Family] {
                    let Some(name) = font
                        .localized_strings()
                        .find_by_id(id, Some("en"))
                        .or_else(|| font.localized_strings().find_by_id(id, None))
                        .map(|name| name.to_string())
                    else {
                        continue;
                    };
                    let entry = index
                        .entry(name.to_ascii_lowercase())
                        .or_insert_with(|| (name.clone(), Vec::new()));
                    if !entry.1.contains(&path) {
                        entry.1.push(path.clone());
                    }
                }
            }
        }
        index
    })
}

/// The bytes of one host font file, read once per process.
fn host_font_bytes(path: &PathBuf) -> Option<Arc<Vec<u8>>> {
    static FILES: OnceLock<std::sync::Mutex<std::collections::HashMap<PathBuf, Arc<Vec<u8>>>>> =
        OnceLock::new();
    let files = FILES.get_or_init(Default::default);
    let mut files = files.lock().ok()?;
    if let Some(data) = files.get(path) {
        return Some(Arc::clone(data));
    }
    let data = Arc::new(std::fs::read(path).ok()?);
    files.insert(path.clone(), Arc::clone(&data));
    Some(data)
}

/// Chromium's text-control character metrics for a computed `font-family`:
/// the primary face's OS/2 `xAvgCharWidth` and its `head` bounding-box
/// width, both in em (Blink `SimpleFontData::AvgCharWidth` /
/// `MaxCharWidth`). `None` when Blink does not trust the average for the
/// first family (`LayoutTextControl::HasValidAvgCharWidth`: Helvetica,
/// Times, Courier, ...); text controls then use the advance of "0".
///
/// The bundled faces stand in for the capture host's Liberation 2 and
/// DejaVu files, whose OS/2 and head tables differ from the bundled
/// copies (same advances), so their values are the host's.
pub(crate) fn text_control_metrics(family: Option<&str>, bold: bool) -> Option<(f32, f32)> {
    const INVALID: &[&str] = &[
        "american typewriter",
        "arial hebrew",
        "chalkboard",
        "cochin",
        "corsiva hebrew",
        "courier",
        "euphemia ucas",
        "geneva",
        "gill sans",
        "hei",
        "helvetica",
        "hoefler text",
        "inaimathi",
        "lucida grande",
        "marker felt",
        "monaco",
        "mshtakan",
        "new peninim mt",
        "osaka",
        "raanana",
        "stheiti",
        "symbol",
        "times",
        "apple braille",
        "apple lisung",
        "apple symbols",
        "applegothic",
        "applemyungjo",
        "#gungseo",
        "#headline",
        "#pcmyungjo",
        "#pilgi",
    ];
    let tokens: Vec<String> = family
        .unwrap_or("")
        .split(',')
        .map(|token| {
            token
                .trim()
                .trim_matches(|c| c == '"' || c == '\'')
                .trim()
                .to_ascii_lowercase()
        })
        .filter(|token| !token.is_empty())
        .collect();
    if tokens
        .first()
        .is_some_and(|first| INVALID.contains(&first.as_str()))
    {
        return None;
    }
    let bundled = |family: &str| -> (f32, f32) {
        // (xAvgCharWidth, head xMax - xMin) / 2048 of the host files.
        let (avg, range) = match (family, bold) {
            (SANS_FAMILY, false) => (1187.0, 3780.0),
            (SANS_FAMILY, true) => (1248.0, 3658.0),
            (MONO_FAMILY, false) => (1229.0, 2508.0),
            (MONO_FAMILY, true) => (1229.0, 2414.0),
            (SYSTEM_FAMILY, false) => (1038.0, 5763.0),
            (SYSTEM_FAMILY, true) => (1173.0, 6235.0),
            (_, false) => (1124.0, 3732.0),
            (_, true) => (1180.0, 3867.0),
        };
        (avg / 2048.0, range / 2048.0)
    };
    for token in &tokens {
        if let Some(family) = bundled_family_for_css_token(token) {
            return Some(bundled(family));
        }
        if let Some((_, paths)) = host_font_index().get(token) {
            let mut best: Option<(i32, (f32, f32))> = None;
            for path in paths {
                let Some(data) = host_font_bytes(path) else {
                    continue;
                };
                let Some((weight, italic, metrics)) = sfnt_text_control_metrics(&data) else {
                    continue;
                };
                let want = if bold { 700 } else { 400 };
                let score = (weight - want).abs() + if italic { 1000 } else { 0 };
                if best.is_none_or(|(current, _)| score < current) {
                    best = Some((score, metrics));
                }
            }
            if let Some((_, metrics)) = best {
                return Some(metrics);
            }
        }
    }
    Some(bundled(DEFAULT_FAMILY))
}

/// (usWeightClass, italic, (xAvgCharWidth, head bbox width) in em) of the
/// first face in an sfnt or collection file.
fn sfnt_text_control_metrics(data: &[u8]) -> Option<(i32, bool, (f32, f32))> {
    let u16_at = |offset: usize| -> Option<u16> {
        Some(u16::from_be_bytes(
            data.get(offset..offset + 2)?.try_into().ok()?,
        ))
    };
    let u32_at = |offset: usize| -> Option<u32> {
        Some(u32::from_be_bytes(
            data.get(offset..offset + 4)?.try_into().ok()?,
        ))
    };
    let mut base = 0usize;
    if data.get(0..4)? == b"ttcf" {
        base = u32_at(12)? as usize;
    }
    let tables = u16_at(base + 4)? as usize;
    let mut os2 = None;
    let mut head = None;
    for index in 0..tables {
        let record = base + 12 + index * 16;
        match data.get(record..record + 4)? {
            b"OS/2" => os2 = Some(u32_at(record + 8)? as usize),
            b"head" => head = Some(u32_at(record + 8)? as usize),
            _ => {}
        }
    }
    let (os2, head) = (os2?, head?);
    let units_per_em = f32::from(u16_at(head + 18)?).max(1.0);
    let x_min = u16_at(head + 36)? as i16;
    let x_max = u16_at(head + 40)? as i16;
    let avg = u16_at(os2 + 2)? as i16;
    let weight = i32::from(u16_at(os2 + 4)?);
    let italic = u16_at(os2 + 62)? & 1 != 0;
    if avg <= 0 {
        return None;
    }
    Some((
        weight,
        italic,
        (
            f32::from(avg) / units_per_em,
            (f32::from(x_max) - f32::from(x_min)) / units_per_em,
        ),
    ))
}

/// Whether the host index has `lower` (for tests that use host fonts only
/// where they are installed).
#[cfg(test)]
pub(crate) fn tests_host_has_family(lower: &str) -> bool {
    host_font_index().contains_key(lower)
}
