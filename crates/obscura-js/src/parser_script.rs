//! Parser-inserted scripts: what the HTML parser does at each `</script>`.
//!
//! The page drives a [`StreamingParser`] and runs each script the tree builder
//! closes, so a script sees only the nodes parsed before it. This module holds
//! the parts the runtime shares between that driver and `document.write`:
//! deciding what kind of script an element is ("prepare the script element"),
//! and feeding written text into the parser at the insertion point.
//!
//! https://html.spec.whatwg.org/multipage/scripting.html#prepare-the-script-element
//! https://html.spec.whatwg.org/multipage/parsing.html#scriptEndTag

use obscura_dom::{DomTree, NodeId, StreamingParser};

use crate::ops::ObscuraState;

/// What preparing a parser-inserted script element decided.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParserScript {
    /// Not a script to run: unknown type, `nomodule` classic, empty inline
    /// code, or an element outside the document (template contents).
    Skip,
    Classic {
        src: Option<String>,
        inline: String,
        is_async: bool,
        is_defer: bool,
    },
    Module {
        src: Option<String>,
        inline: String,
        is_async: bool,
    },
    ImportMap {
        src: Option<String>,
        inline: String,
    },
}

impl ParserScript {
    /// A parser-inserted classic script with `src` and neither `async` nor
    /// `defer` blocks the parser until it is fetched and run.
    pub fn is_parser_blocking_external(&self) -> bool {
        matches!(
            self,
            ParserScript::Classic {
                src: Some(_),
                is_async: false,
                is_defer: false,
                ..
            }
        )
    }

    /// Inline classic code runs immediately when the parser reaches it.
    pub fn is_inline_classic(&self) -> bool {
        matches!(self, ParserScript::Classic { src: None, .. })
    }
}

/// JavaScript MIME type essences HTML accepts for a classic script.
fn is_javascript_type(script_type: &str) -> bool {
    matches!(
        script_type,
        "" | "text/javascript"
            | "application/javascript"
            | "application/ecmascript"
            | "application/x-ecmascript"
            | "application/x-javascript"
            | "text/ecmascript"
            | "text/javascript1.0"
            | "text/javascript1.1"
            | "text/javascript1.2"
            | "text/javascript1.3"
            | "text/javascript1.4"
            | "text/javascript1.5"
            | "text/jscript"
            | "text/livescript"
            | "text/x-ecmascript"
            | "text/x-javascript"
    )
}

pub fn classify_parser_script(dom: &DomTree, node: NodeId) -> ParserScript {
    if !dom.is_connected(node) {
        return ParserScript::Skip;
    }
    let Some(element) = dom.get_node(node) else {
        return ParserScript::Skip;
    };
    let src = element.get_attribute("src").map(str::to_string);
    let script_type = match (
        element.get_attribute("type"),
        element.get_attribute("language"),
    ) {
        (Some(t), _) => t.trim().to_ascii_lowercase(),
        (None, Some(language)) if !language.is_empty() => {
            format!("text/{}", language.trim().to_ascii_lowercase())
        }
        _ => String::new(),
    };
    let script_type = script_type
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();
    let is_async = element.get_attribute("async").is_some();
    let is_defer = element.get_attribute("defer").is_some();
    let nomodule = element.get_attribute("nomodule").is_some();
    let inline = if src.is_none() {
        dom.text_content(node)
    } else {
        String::new()
    };
    // No src attribute and no text: "prepare" returns before the script is
    // marked started.
    if src.is_none() && inline.is_empty() {
        return ParserScript::Skip;
    }
    match script_type.as_str() {
        "module" => ParserScript::Module {
            src,
            inline,
            is_async,
        },
        "importmap" => ParserScript::ImportMap { src, inline },
        t if is_javascript_type(t) => {
            if nomodule {
                return ParserScript::Skip;
            }
            ParserScript::Classic {
                src,
                inline,
                is_async,
                is_defer,
            }
        }
        _ => ParserScript::Skip,
    }
}

/// Feed written text while a parser-inserted script runs. Returns the inline
/// classic script the written text closed, for the caller to run right away
/// (`Ok(Some)`), or `Ok(None)` when the written text is used up or waits
/// behind a parsing-blocking script. `Err` means the parser is not paused at
/// a script, so `document.write` keeps its non-parser behaviour.
pub(crate) fn parser_write(
    gs: &ObscuraState,
    text: &str,
    continue_only: bool,
) -> Result<Option<NodeId>, ()> {
    let Some(parser) = active_parser(gs) else {
        return Err(());
    };
    let Some(dom) = gs.dom.as_ref() else {
        return Err(());
    };
    if gs.parser_blocking_written.get() {
        // The parser is paused for a written external script: the new text
        // queues at the insertion point behind it.
        parser.append_written(text);
        return Ok(None);
    }
    let mut step = if continue_only {
        parser.continue_written()
    } else {
        parser.write(text)
    };
    while let Some(node) = step {
        let script = classify_parser_script(dom, node);
        if script == ParserScript::Skip {
            step = parser.continue_written();
            continue;
        }
        gs.already_started_scripts.borrow_mut().insert(node);
        if script.is_inline_classic() {
            return Ok(Some(node));
        }
        let blocking = script.is_parser_blocking_external();
        gs.parser_written_scripts.borrow_mut().push(node);
        if blocking {
            gs.parser_blocking_written.set(true);
            return Ok(None);
        }
        step = parser.continue_written();
    }
    Ok(None)
}

/// The document parser, when `document.write` may feed it: parsing is
/// running and a parser-inserted script is executing.
fn active_parser(gs: &ObscuraState) -> Option<std::rc::Rc<StreamingParser>> {
    if gs.parser_script_depth.get() == 0 {
        return None;
    }
    gs.html_parser
        .borrow()
        .as_ref()
        .filter(|parser| !parser.is_finished())
        .cloned()
}
