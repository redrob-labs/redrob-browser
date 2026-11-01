//! Saved logins: notice a sign-in so the window can offer to save it, and
//! type a saved login into the page (the vault, vault.rs, holds them).
//!
//! Both halves run in the renderer, where the page's JavaScript is.
//!
//! - Notice: in every frame a script listens for a submitted form or a click
//!   on a button next to a filled password field and calls a native
//!   function, which sends a `redrob.login` process message to the browser
//!   process. There it becomes `Event::LoginSubmitted`; the origin comes from
//!   the frame's URL, not from what the page says.
//! - Fill: the browser process sends `redrob.fill` with the username and the
//!   password as message arguments, never inside script text. The renderer
//!   calls the fill function with them and answers `redrob.filled`, which
//!   becomes `Event::Filled` ("filled" or "no-form").
//!
//! Neither message is logged: they carry a password.

use cef::*;
use zeroize::Zeroizing;

use crate::cdp::Event;
use crate::cef::Sink;

/// Renderer to browser: a sign-in was submitted. Args: username, password.
pub const MSG_LOGIN: &str = "redrob.login";
/// Browser to renderer: fill the sign-in form. Args: username, password.
pub const MSG_FILL: &str = "redrob.fill";
/// Renderer to browser: the outcome of a fill. Args: "filled" or "no-form".
pub const MSG_FILLED: &str = "redrob.filled";

/// The native function the notice script calls.
const NATIVE: &str = "__redrobLoginSubmit";

/// Finds the sign-in form on the page and types into it. The values arrive
/// as call arguments, never inside the script text.
pub const FILL_LOGIN_JS: &str = r#"(function (username, password) {
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const pw = [...document.querySelectorAll('input[type=password]')].find(visible);
  if (!pw) return 'no-form';
  const scope = pw.form || document;
  const fields = [...scope.querySelectorAll('input')].filter(visible);
  const before = fields.slice(0, fields.indexOf(pw)).reverse();
  const user = before.find((e) => /^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username');
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (user && username) set(user, username);
  set(pw, password);
  pw.focus();
  return 'filled';
})"#;

/// Runs in every frame: when a form with a filled password field is
/// submitted, or a button next to one is clicked, report the sign-in. The
/// script keeps the native function in a closure and removes the global, so
/// the page cannot find it by name after this ran.
pub const LOGIN_SUBMIT_JS: &str = r#"(() => {
  const send = globalThis.__redrobLoginSubmit;
  try { delete globalThis.__redrobLoginSubmit; } catch (e) {}
  if (typeof send !== 'function') return;
  let last = '';
  const report = (scope) => {
    const pw = [...(scope || document).querySelectorAll('input[type=password]')].find((e) => e.value);
    if (!pw) return;
    const fields = [...(pw.form || document).querySelectorAll('input')];
    const before = fields.slice(0, fields.indexOf(pw)).reverse();
    const user = before.find((e) => e.value && (/^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username'));
    const key = (user ? user.value : '') + '\u0000' + pw.value;
    if (key === last) return;
    last = key;
    send(user ? user.value : '', pw.value);
  };
  addEventListener('submit', (e) => report(e.target), true);
  addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type=submit]');
    if (b) report(b.form || document);
  }, true);
})();"#;

fn message(name: &str, args: &[&str]) -> Option<ProcessMessage> {
    let msg = process_message_create(Some(&CefString::from(name)))?;
    let list = msg.argument_list()?;
    for (i, a) in args.iter().enumerate() {
        list.set_string(i, Some(&CefString::from(*a)));
    }
    Some(msg)
}

fn args_of(message: &ProcessMessage) -> Vec<Zeroizing<String>> {
    let Some(list) = message.argument_list() else {
        return Vec::new();
    };
    (0..list.size())
        .map(|i| Zeroizing::new(super::text(&list.string(i))))
        .collect()
}

// ---- browser process ----

/// Ask the page in `browser` to fill its sign-in form. The answer comes back
/// as `Event::Filled`.
pub fn fill(browser: &Browser, username: &str, password: &str) {
    let Some(frame) = browser.main_frame() else {
        return;
    };
    if let Some(mut msg) = message(MSG_FILL, &[username, password]) {
        frame.send_process_message(ProcessId::RENDERER, Some(&mut msg));
    }
}

/// `Client::on_process_message_received`. Returns true when the message was
/// one of these.
pub fn on_browser_message(
    sink: &Sink,
    browser: Option<&mut Browser>,
    frame: Option<&mut Frame>,
    message: Option<&mut ProcessMessage>,
) -> bool {
    let (Some(browser), Some(message)) = (browser, message) else {
        return false;
    };
    let name = super::text(&message.name());
    let id = browser.identifier();
    match name.as_str() {
        MSG_LOGIN => {
            let args = args_of(message);
            let url = frame.map(|f| super::text(&f.url())).unwrap_or_default();
            if let Some(event) = login_event(&url, &args) {
                sink.send(id, event);
            }
            true
        }
        MSG_FILLED => {
            let outcome = args_of(message)
                .first()
                .map(|s| s.as_str().to_string())
                .filter(|s| s == "filled")
                .unwrap_or_else(|| "no-form".to_string());
            sink.send(id, Event::Filled(outcome));
            true
        }
        _ => false,
    }
}

/// The sign-in a `redrob.login` message reports, from the frame at `url`.
pub fn login_event(url: &str, args: &[Zeroizing<String>]) -> Option<Event> {
    let origin = super::site_of(url)?;
    let username = args.first().map(|s| s.as_str().to_string()).unwrap_or_default();
    let password = Zeroizing::new(args.get(1).map(|s| s.as_str().to_string()).unwrap_or_default());
    if password.is_empty() {
        return None;
    }
    Some(Event::LoginSubmitted {
        origin,
        username,
        password,
    })
}

// ---- renderer process ----

wrap_v8_handler! {
    struct Submit {
        frame: Frame,
    }

    impl V8Handler {
        fn execute(
            &self,
            _name: Option<&CefString>,
            _object: Option<&mut V8Value>,
            arguments: Option<&[Option<V8Value>]>,
            _retval: Option<&mut Option<V8Value>>,
            _exception: Option<&mut CefString>,
        ) -> ::std::os::raw::c_int {
            let arg = |i: usize| {
                arguments
                    .and_then(|a| a.get(i).cloned().flatten())
                    .filter(|v| v.is_string() != 0)
                    .map(|v| Zeroizing::new(super::text(&v.string_value())))
                    .unwrap_or_default()
            };
            let (user, password) = (arg(0), arg(1));
            if password.is_empty() || self.frame.is_valid() == 0 {
                return 1;
            }
            if let Some(mut msg) = message(MSG_LOGIN, &[&user, &password]) {
                self.frame
                    .send_process_message(ProcessId::BROWSER, Some(&mut msg));
            }
            1
        }
    }
}

/// `RenderProcessHandler::on_context_created`: install the sign-in notice in
/// the frame's new JavaScript context.
pub fn on_context_created(frame: Option<&mut Frame>, context: Option<&mut V8Context>) {
    let (Some(frame), Some(context)) = (frame, context) else {
        return;
    };
    let url = super::text(&frame.url());
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return;
    }
    if context.enter() == 0 {
        return;
    }
    if let Some(global) = context.global() {
        let mut handler = Submit::new(frame.clone());
        if let Some(mut f) = v8_value_create_function(Some(&CefString::from(NATIVE)), Some(&mut handler)) {
            global.set_value_bykey(
                Some(&CefString::from(NATIVE)),
                Some(&mut f),
                sys::cef_v8_propertyattribute_t::V8_PROPERTY_ATTRIBUTE_DONTENUM.into(),
            );
            let mut ret = None;
            let mut exc = None;
            context.eval(
                Some(&CefString::from(LOGIN_SUBMIT_JS)),
                None,
                0,
                Some(&mut ret),
                Some(&mut exc),
            );
        }
    }
    context.exit();
}

/// `RenderProcessHandler::on_process_message_received`. Returns true when the
/// message was a fill request.
pub fn on_renderer_message(
    frame: Option<&mut Frame>,
    message: Option<&mut ProcessMessage>,
) -> bool {
    let (Some(frame), Some(message)) = (frame, message) else {
        return false;
    };
    if super::text(&message.name()) != MSG_FILL {
        return false;
    }
    let args = args_of(message);
    let outcome = run_fill(frame, &args).unwrap_or("no-form");
    if let Some(mut reply) = self::message(MSG_FILLED, &[outcome]) {
        frame.send_process_message(ProcessId::BROWSER, Some(&mut reply));
    }
    true
}

fn run_fill(frame: &Frame, args: &[Zeroizing<String>]) -> Option<&'static str> {
    let context = frame.v8_context()?;
    if context.enter() == 0 {
        return None;
    }
    let outcome = (|| {
        let mut func = None;
        let mut exc = None;
        context.eval(
            Some(&CefString::from(FILL_LOGIN_JS)),
            None,
            0,
            Some(&mut func),
            Some(&mut exc),
        );
        let func = func.filter(|f| f.is_function() != 0)?;
        let user = v8_value_create_string(Some(&CefString::from(
            args.first().map(|s| s.as_str()).unwrap_or_default(),
        )));
        let password = v8_value_create_string(Some(&CefString::from(
            args.get(1).map(|s| s.as_str()).unwrap_or_default(),
        )));
        let result = func.execute_function(None, Some(&[user, password]))?;
        (result.is_string() != 0 && super::text(&result.string_value()) == "filled")
            .then_some("filled")
    })();
    context.exit();
    Some(outcome.unwrap_or("no-form"))
}

wrap_render_process_handler! {
    struct Renderer {}

    impl RenderProcessHandler {
        fn on_context_created(
            &self,
            _browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            context: Option<&mut V8Context>,
        ) {
            on_context_created(frame, context);
        }

        fn on_process_message_received(
            &self,
            _browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            _source_process: ProcessId,
            message: Option<&mut ProcessMessage>,
        ) -> ::std::os::raw::c_int {
            on_renderer_message(frame, message) as i32
        }
    }
}

/// A render process handler with only the login hooks, for an app that has
/// nothing else to do in the renderer.
pub fn render_process_handler() -> RenderProcessHandler {
    Renderer::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn z(s: &str) -> Zeroizing<String> {
        Zeroizing::new(s.to_string())
    }

    #[test]
    fn a_sign_in_takes_its_origin_from_the_frame() {
        let e = login_event("https://accounts.example.com/login?next=/", &[z("ann"), z("pw")]);
        let Some(Event::LoginSubmitted {
            origin,
            username,
            password,
        }) = e
        else {
            panic!("no event");
        };
        assert_eq!(origin, "https://accounts.example.com");
        assert_eq!(username, "ann");
        assert_eq!(password.as_str(), "pw");
    }

    #[test]
    fn no_password_or_no_web_origin_is_not_a_sign_in() {
        assert!(login_event("https://a.example/", &[z("ann"), z("")]).is_none());
        assert!(login_event("https://a.example/", &[z("ann")]).is_none());
        assert!(login_event("file:///home/x.html", &[z("ann"), z("pw")]).is_none());
        assert!(login_event("chrome://settings", &[z("ann"), z("pw")]).is_none());
    }

    #[test]
    fn scripts_never_carry_values() {
        // The fill function takes its values as arguments.
        assert!(FILL_LOGIN_JS.starts_with("(function (username, password)"));
        assert!(LOGIN_SUBMIT_JS.contains(NATIVE));
    }
}
