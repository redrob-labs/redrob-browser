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
/// Chromium picks a generic family on this host.
pub(crate) fn bundled_family_for_css_token(token: &str) -> Option<&'static str> {
    let token = token
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .trim()
        .to_ascii_lowercase();
    if token.is_empty() {
        return None;
    }
    if token == "system-ui" || token == "ui-sans-serif" {
        return Some(SYSTEM_FAMILY);
    }
    if token == "monospace"
        || token.contains("mono")
        || token.contains("courier")
        || token.contains("consol")
        || token == "menlo"
        || token == "monaco"
        || token == "code"
    {
        return Some(MONO_FAMILY);
    }
    if token == "serif"
        || token == "georgia"
        || token.contains("times")
        || token == "cambria"
        || token.contains("garamond")
        || token.contains("liberation serif")
        || token == "roman"
    {
        return Some(SERIF_FAMILY);
    }
    if token == "sans-serif"
        || token.contains("sans")
        || token == "arial"
        || token == "helvetica"
        || token == "helvetica neue"
        || token == "-apple-system"
        || token == "roboto"
        || token == "segoe ui"
        || token == "inter"
        || token == "verdana"
        || token == "tahoma"
    {
        return Some(SANS_FAMILY);
    }
    if token == "emoji" || token.contains("emoji") {
        return Some(EMOJI_FAMILY);
    }
    None
}

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
            weight: font
                .weight
                .filter(|(min, max)| min == max)
                .map(|(weight, _)| FontWeight::new(weight as f32)),
            axes: None,
        };
        register(
            &mut collection,
            &mut order,
            Blob::new(Arc::clone(&font.data) as Arc<dyn AsRef<[u8]> + Send + Sync>),
            Some(info),
        );
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

    // Glyph fallback after the authored families: the bundled faces first
    // (DejaVu Sans covers most symbols), then every other loaded family in
    // registration order, emoji last.
    let mut fallback: Vec<FamilyId> = [sans, system, serif, mono].into_iter().flatten().collect();
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

    /// The Parley family list for a computed CSS `font-family` value.
    ///
    /// Each token resolves to a loaded family of that name, or else to the
    /// bundled family Chromium would use for it on this host. The UA default
    /// (Liberation Sans) ends the list.
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
            }
        }
        push(
            &mut names,
            FontFamilyName::Named(Cow::Borrowed(SANS_FAMILY)),
        );
        FontFamily::List(Cow::Owned(names))
    }
}
