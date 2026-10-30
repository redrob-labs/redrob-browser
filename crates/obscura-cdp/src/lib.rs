// Upstream Obscura code: style, complexity and perf lints stay as upstream wrote it,
// so merges from upstream stay small. Correctness and suspicious lints still fail.
#![allow(clippy::style, clippy::complexity, clippy::perf, dead_code)]
pub mod cookie_params;
pub mod dispatch;
pub mod domains;
#[cfg(feature = "render")]
pub(crate) mod scene_channel;
pub mod server;
pub mod types;
pub(crate) mod util;

pub use server::{
    start, start_with_full_options, start_with_full_serve_options, start_with_host,
    start_with_host_and_security, start_with_options, start_with_serve_options_and_limit,
    start_with_serve_options_limit_and_ready_file, DEFAULT_MAX_CONNECTIONS,
};
