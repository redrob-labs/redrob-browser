//! CEF handlers for browser features (owned by the features work, docs/CEF.md).
//!
//! Each file exposes a constructor that takes a `super::Sink` and returns the
//! CEF handler; `cef/client.rs` returns them from the matching `get_*_handler`.
