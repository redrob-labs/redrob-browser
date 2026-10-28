//! CSS domain: computed and inline styles for one node.
//!
//! Computed style comes from the page's own `getComputedStyle`, so it is the
//! cascade the engine actually used. Inline style is parsed from the node's
//! `style` attribute. Stylesheet rules are not reported yet:
//! `getMatchedStylesForNode` answers with the inline style and an empty
//! `matchedCSSRules` list.

use serde_json::{json, Value};

use crate::dispatch::CdpContext;
use crate::domains::dom::resolve_node_id;

/// Properties shown when the engine has no native computed-style snapshot
/// (no-render builds report an empty `length`), read one by one instead.
const FALLBACK_PROPERTIES: &[&str] = &[
    "display", "position", "box-sizing", "width", "height", "top", "right", "bottom", "left",
    "margin-top", "margin-right", "margin-bottom", "margin-left",
    "padding-top", "padding-right", "padding-bottom", "padding-left",
    "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
    "color", "background-color", "font-family", "font-size", "font-weight", "line-height",
    "text-align", "visibility", "opacity", "overflow", "z-index", "flex-direction",
    "justify-content", "align-items",
];

pub async fn handle(
    method: &str,
    params: &Value,
    ctx: &mut CdpContext,
    session_id: &Option<String>,
) -> Result<Value, String> {
    match method {
        "enable" | "disable" => Ok(json!({})),
        "getComputedStyleForNode" => {
            let page = ctx.get_session_page_mut(session_id).ok_or("No page")?;
            let node_id = resolve_node_id(page, params)?;
            let fallback = serde_json::to_string(FALLBACK_PROPERTIES).unwrap_or_else(|_| "[]".into());
            let code = format!(
                "(function() {{\
                    var el = globalThis._wrap && globalThis._wrap({node_id});\
                    if (!el || el.nodeType !== 1) return '[]';\
                    var cs = getComputedStyle(el);\
                    var out = [];\
                    var n = cs.length | 0;\
                    for (var i = 0; i < n; i++) {{\
                        var name = cs.item(i);\
                        if (name) out.push([name, String(cs.getPropertyValue(name))]);\
                    }}\
                    if (!out.length) {{\
                        var names = {fallback};\
                        for (var j = 0; j < names.length; j++) out.push([names[j], String(cs.getPropertyValue(names[j]) || '')]);\
                    }}\
                    return JSON.stringify(out);\
                }})()"
            );
            let raw = page.evaluate(&code);
            let pairs: Vec<(String, String)> =
                raw.as_str().and_then(|s| serde_json::from_str(s).ok()).unwrap_or_default();
            let computed: Vec<Value> =
                pairs.into_iter().map(|(name, value)| json!({ "name": name, "value": value })).collect();
            Ok(json!({ "computedStyle": computed }))
        }
        "getInlineStylesForNode" => {
            let style = inline_style(ctx, params, session_id)?;
            Ok(json!({ "inlineStyle": style }))
        }
        "getMatchedStylesForNode" => {
            let style = inline_style(ctx, params, session_id)?;
            Ok(json!({
                "inlineStyle": style,
                "matchedCSSRules": [],
                "pseudoElements": [],
                "inherited": [],
                "inheritedPseudoElements": [],
                "cssKeyframesRules": [],
            }))
        }
        // Everything else a front end sends (trackComputedStyleUpdates,
        // getMediaQueries, ...) stays accepted, as before this domain existed.
        _ => Ok(json!({})),
    }
}

/// The node's `style` attribute as a CDP `CSSStyle`.
fn inline_style(ctx: &mut CdpContext, params: &Value, session_id: &Option<String>) -> Result<Value, String> {
    let page = ctx.get_session_page_mut(session_id).ok_or("No page")?;
    let node_id = resolve_node_id(page, params)?;
    let code = format!(
        "(function() {{ var el = globalThis._wrap && globalThis._wrap({node_id}); \
         return (el && el.nodeType === 1 && el.getAttribute('style')) || ''; }})()"
    );
    let text = page.evaluate(&code).as_str().unwrap_or("").to_string();
    Ok(css_style(&text))
}

fn css_style(text: &str) -> Value {
    let props: Vec<Value> = declarations(text)
        .into_iter()
        .map(|(name, value, important, raw)| {
            json!({
                "name": name,
                "value": value,
                "important": important,
                "implicit": false,
                "text": raw,
                "parsedOk": true,
                "disabled": false,
            })
        })
        .collect();
    json!({ "cssProperties": props, "shorthandEntries": [], "cssText": text })
}

/// Split a declaration block into (name, value, important, source text).
/// Semicolons inside quotes or parentheses (`url(a;b)`) do not end a declaration.
fn declarations(text: &str) -> Vec<(String, String, bool, String)> {
    let mut parts = Vec::new();
    let mut cur = String::new();
    let mut quote: Option<char> = None;
    let mut depth = 0i32;
    for c in text.chars() {
        match quote {
            Some(q) => {
                if c == q {
                    quote = None;
                }
                cur.push(c);
            }
            None => match c {
                '"' | '\'' => {
                    quote = Some(c);
                    cur.push(c);
                }
                '(' => {
                    depth += 1;
                    cur.push(c);
                }
                ')' => {
                    depth = (depth - 1).max(0);
                    cur.push(c);
                }
                ';' if depth == 0 => parts.push(std::mem::take(&mut cur)),
                _ => cur.push(c),
            },
        }
    }
    parts.push(cur);

    let mut out = Vec::new();
    for part in parts {
        let raw = part.trim();
        let Some((name, value)) = raw.split_once(':') else { continue };
        let name = name.trim();
        if name.is_empty() {
            continue;
        }
        let name = if name.starts_with("--") { name.to_string() } else { name.to_ascii_lowercase() };
        let mut value = value.trim().to_string();
        let mut important = false;
        let lower = value.to_ascii_lowercase();
        if let Some(pos) = lower.rfind("!important") {
            if lower[pos + "!important".len()..].trim().is_empty() {
                value = value[..pos].trim_end().to_string();
                important = true;
            }
        }
        out.push((name, value, important, format!("{raw};")));
    }
    out
}
