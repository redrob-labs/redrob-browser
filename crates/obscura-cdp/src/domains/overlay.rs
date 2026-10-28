//! Overlay domain: element highlighting.
//!
//! The engine draws no overlay of its own; the window shows the page. So a
//! highlight request becomes an `Overlay.redrobHighlight` event carrying a
//! `DOM.getBoxModel` model (viewport CSS pixels), sent to every session on
//! the page, and the window draws it. `{model: null}` clears it.

use serde_json::{json, Value};

use crate::dispatch::CdpContext;
use crate::types::CdpEvent;

pub const HIGHLIGHT_EVENT: &str = "Overlay.redrobHighlight";

pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "highlightNode" => {
            let boxes = crate::domains::dom::handle("getBoxModel", params, ctx, session_id).await?;
            emit(ctx, session_id, boxes.get("model").cloned().unwrap_or(Value::Null));
            Ok(json!({}))
        }
        "highlightRect" => {
            let n = |k: &str| params.get(k).and_then(Value::as_f64).unwrap_or(0.0);
            let (x, y, w, h) = (n("x"), n("y"), n("width"), n("height"));
            let quad = json!([x, y, x + w, y, x + w, y + h, x, y + h]);
            emit(ctx, session_id, quad_model(quad, w, h));
            Ok(json!({}))
        }
        "highlightQuad" => {
            let quad = params.get("quad").cloned().unwrap_or(Value::Null);
            emit(ctx, session_id, quad_model(quad, 0.0, 0.0));
            Ok(json!({}))
        }
        "hideHighlight" => {
            emit(ctx, session_id, Value::Null);
            Ok(json!({}))
        }
        // enable, disable, setInspectMode, setShowGridOverlays, ...: accepted.
        _ => Ok(json!({})),
    }
}

fn quad_model(quad: Value, w: f64, h: f64) -> Value {
    json!({
        "content": quad.clone(), "padding": quad.clone(), "border": quad.clone(), "margin": quad,
        "width": w, "height": h,
    })
}

/// Send the highlight to every session attached to the caller's page, so the
/// window hears a highlight that a separate DevTools client asked for.
fn emit(ctx: &mut CdpContext, session_id: &Option<String>, model: Value) {
    let Some(page_id) = session_id.as_ref().and_then(|s| ctx.sessions.get(s)).cloned() else { return };
    let mut sessions: Vec<String> =
        ctx.sessions.iter().filter(|(_, p)| **p == page_id).map(|(s, _)| s.clone()).collect();
    sessions.sort_unstable();
    for s in sessions {
        ctx.pending_events.push(CdpEvent::with_session(HIGHLIGHT_EVENT, json!({ "model": model }), s));
    }
}
