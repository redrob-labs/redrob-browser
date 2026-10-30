// Upstream Obscura code: style, complexity and perf lints stay as upstream wrote it,
// so merges from upstream stay small. Correctness and suspicious lints still fail.
#![allow(clippy::style, clippy::complexity, clippy::perf, dead_code)]
#[macro_use]
extern crate html5ever;

pub mod selector;
pub mod serialize;
pub mod streaming;
pub mod tree;
pub mod tree_sink;

pub use streaming::{ParseStep, StreamingParser};
pub use tree::{
    AttachShadowError, Attribute, DomTree, Node, NodeData, NodeId, ShadowRoot, ShadowRootMode,
};
pub use tree_sink::{parse_fragment, parse_fragment_with_context, parse_html, parse_srcdoc};
