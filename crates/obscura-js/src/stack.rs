//! Error stacks as a page sees them in Chrome.
//!
//! Most of the DOM is implemented in JavaScript, so a stack taken inside a
//! listener, a timer or a DOM call that throws runs through the bootstrap's
//! own functions. Chrome's DOM is native and never appears in `Error.stack`.
//! Anti-bot scripts collect stacks (Cloudflare's challenge posts them back),
//! and `<obscura:bootstrap>` or deno's `ext:core/...` frames there name the
//! engine outright.
//!
//! The isolate's prepare-stack-trace callback drops those frames before the
//! stack is formatted, so `Error.stack`, `Error.captureStackTrace` and a page's
//! own `Error.prepareStackTrace` all see only the page's frames.

use deno_core::v8;

/// Script names that belong to the engine rather than to the page.
fn is_engine_script(name: &str) -> bool {
    name.starts_with("<obscura") || name.starts_with("ext:")
}

fn call_method<'s>(
    scope: &mut v8::PinScope<'s, '_>,
    site: v8::Local<'s, v8::Object>,
    method: &str,
) -> Option<v8::Local<'s, v8::Value>> {
    let key = v8::String::new(scope, method)?;
    let function = site
        .get(scope, key.into())?
        .try_cast::<v8::Function>()
        .ok()?;
    function.call(scope, site.into(), &[])
}

fn site_string<'s>(
    scope: &mut v8::PinScope<'s, '_>,
    site: v8::Local<'s, v8::Object>,
    method: &str,
) -> String {
    match call_method(scope, site, method) {
        Some(value) if !value.is_null_or_undefined() => value.to_rust_string_lossy(scope),
        _ => String::new(),
    }
}

/// Whether a call site is engine code: a frame in an engine script, or an
/// engine-owned `eval` builtin frame that ran page code (the frame right
/// below it belongs to the engine too).
fn engine_frames<'s>(
    scope: &mut v8::PinScope<'s, '_>,
    callsites: v8::Local<'s, v8::Array>,
) -> Vec<bool> {
    let len = callsites.length();
    let mut engine = Vec::with_capacity(len as usize);
    let mut native_eval = Vec::with_capacity(len as usize);
    for index in 0..len {
        let Some(site) = callsites
            .get_index(scope, index)
            .and_then(|value| value.try_cast::<v8::Object>().ok())
        else {
            engine.push(false);
            native_eval.push(false);
            continue;
        };
        let name = site_string(scope, site, "getScriptNameOrSourceURL");
        // A wrapper the engine compiled with `new Function` or eval (the
        // worker scope runner) is engine code too. Page code it runs carries
        // a `sourceURL`, so its own frames name the page's script instead.
        let eval_origin = site_string(scope, site, "getEvalOrigin");
        engine.push(is_engine_script(&name) || eval_origin.contains("(<obscura"));
        let native = call_method(scope, site, "isNative").is_some_and(|value| value.is_true());
        native_eval.push(
            name.is_empty() && !native && site_string(scope, site, "getFunctionName") == "eval",
        );
    }
    for index in 0..engine.len() {
        if native_eval[index] && engine.get(index + 1).copied().unwrap_or(false) {
            engine[index] = true;
        }
    }
    engine
}

/// Installed with `Isolate::set_prepare_stack_trace_callback`; filters, then
/// hands the rest to deno_core's callback, which formats the stack or calls
/// the page's `Error.prepareStackTrace`.
pub fn prepare_stack_trace_callback<'s, 'i>(
    scope: &mut v8::PinScope<'s, 'i>,
    error: v8::Local<'s, v8::Value>,
    callsites: v8::Local<'s, v8::Array>,
) -> v8::Local<'s, v8::Value> {
    let engine = {
        v8::tc_scope!(let tc, scope);
        let engine = engine_frames(tc, callsites);
        if tc.has_caught() {
            // A page replaced a CallSite method and it threw: leave the
            // stack as V8 built it rather than half-filtered.
            None
        } else {
            Some(engine)
        }
    };
    let callsites = match engine {
        Some(engine) if engine.iter().any(|&is_engine| is_engine) => {
            let mut kept = Vec::with_capacity(engine.len());
            for (index, is_engine) in engine.into_iter().enumerate() {
                if is_engine {
                    continue;
                }
                if let Some(site) = callsites.get_index(scope, index as u32) {
                    kept.push(site);
                }
            }
            v8::Array::new_with_elements(scope, &kept)
        }
        _ => callsites,
    };
    // deno_core's callback stashes the call sites for its own error reports
    // and runs a page's `Error.prepareStackTrace`, so it always runs.
    let prepared = deno_core::error::prepare_stack_trace_callback(scope, error, callsites);
    if page_prepares_stack(scope) {
        return prepared;
    }
    // Without one, format the way V8 does: each frame is its call site's own
    // `toString()`. deno_core's formatter differs for eval code, which is how
    // worker scripts run (`at eval (url, <anonymous>:1:2)` against Chrome's
    // `at url:1:2`).
    v8_format(scope, error, callsites).unwrap_or(prepared)
}

/// Worker scripts run through eval here, so their top-level frames read
/// `eval (blob:...:1:2)` where a worker thread prints `blob:...:1:2`. Page
/// code's own eval keeps its form: its location says `eval at`.
fn worker_toplevel_location(line: &str) -> Option<&str> {
    let inner = line.strip_prefix("eval (")?.strip_suffix(')')?;
    (!inner.contains("eval at ") && !inner.contains("<anonymous>")).then_some(inner)
}

fn page_prepares_stack(scope: &mut v8::PinScope<'_, '_>) -> bool {
    let global = scope.get_current_context().global(scope);
    let (Some(error_key), Some(prepare_key)) = (
        v8::String::new(scope, "Error"),
        v8::String::new(scope, "prepareStackTrace"),
    ) else {
        return false;
    };
    global
        .get(scope, error_key.into())
        .and_then(|error| error.to_object(scope))
        .and_then(|error| error.get(scope, prepare_key.into()))
        .is_some_and(|prepare| prepare.is_function())
}

fn v8_format<'s>(
    scope: &mut v8::PinScope<'s, '_>,
    error: v8::Local<'s, v8::Value>,
    callsites: v8::Local<'s, v8::Array>,
) -> Option<v8::Local<'s, v8::Value>> {
    v8::tc_scope!(let tc, scope);
    let mut out = String::new();
    if let Ok(object) = error.try_cast::<v8::Object>() {
        let read = |tc: &mut v8::PinScope<'s, '_>, name: &str| -> Option<String> {
            let key = v8::String::new(tc, name)?;
            let value = object.get(tc, key.into())?;
            if value.is_undefined() {
                return None;
            }
            Some(value.to_string(tc)?.to_rust_string_lossy(tc))
        };
        let name = read(tc, "name").unwrap_or_else(|| "Error".to_string());
        let message = read(tc, "message").unwrap_or_default();
        out = match (name.is_empty(), message.is_empty()) {
            (false, false) => format!("{name}: {message}"),
            (true, false) => message,
            (false, true) => name,
            (true, true) => String::new(),
        };
    }
    for index in 0..callsites.length() {
        let site = callsites
            .get_index(tc, index)?
            .try_cast::<v8::Object>()
            .ok()?;
        let line = call_method(tc, site, "toString")?.to_rust_string_lossy(tc);
        out.push_str("\n    at ");
        out.push_str(worker_toplevel_location(&line).unwrap_or(&line));
    }
    if tc.has_caught() {
        return None;
    }
    Some(v8::String::new(tc, &out)?.into())
}

#[cfg(test)]
mod tests {
    use super::is_engine_script;

    #[test]
    fn worker_toplevel_frames_print_their_script_location() {
        use super::worker_toplevel_location;
        assert_eq!(
            worker_toplevel_location("eval (blob:https://a.test/x:9:11)"),
            Some("blob:https://a.test/x:9:11")
        );
        assert_eq!(
            worker_toplevel_location("eval (eval at f (https://a.test/p:1:2), <anonymous>:1:1)"),
            None
        );
        assert_eq!(
            worker_toplevel_location("f (https://a.test/x.js:1:2)"),
            None
        );
    }

    #[test]
    fn engine_script_names() {
        assert!(is_engine_script("<obscura:bootstrap>"));
        assert!(is_engine_script("ext:core/01_core.js"));
        assert!(!is_engine_script("https://example.com/app.js"));
        assert!(!is_engine_script(""));
    }
}
