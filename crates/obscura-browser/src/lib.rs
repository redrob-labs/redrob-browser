// Upstream Obscura code: style, complexity and perf lints stay as upstream wrote it,
// so merges from upstream stay small. Correctness and suspicious lints still fail.
#![allow(clippy::style, clippy::complexity, clippy::perf, dead_code)]
pub mod accessibility;
pub mod context;
mod fork_virtual_url;
mod idle_deadline;
pub mod lifecycle;
pub mod page;
#[cfg(feature = "render")]
pub mod pdf;
pub mod profiles;

pub use context::BrowserContext;
pub use lifecycle::{LifecycleState, WaitUntil};
#[cfg(feature = "display-list")]
pub use obscura_js::DisplayList;
pub use obscura_js::HTML_TO_MARKDOWN_JS;
#[cfg(feature = "render")]
pub use obscura_js::{
    validate_capture_region, AnimationSample, AnimationSampleMode, AnimationSampleTime,
    CaptureError, CaptureRegion,
};
pub use page::{url_matches_cdp_pattern, Download, NetworkEvent, Page, PageError};
#[cfg(feature = "render")]
pub use pdf::{RasterPdfError, RasterPdfOptions, RasterPdfPageRange};
// Re-exported so the embeddable `obscura` crate (which depends on obscura-browser,
// not obscura-js) can surface the interception channel types.
pub use obscura_js::ops::{InterceptResolution, InterceptedRequest};
