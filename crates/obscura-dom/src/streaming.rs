//! Incremental HTML parsing that pauses at each parser-inserted `</script>`.
//!
//! HTML runs a parser-inserted classic script when the tree builder reaches
//! its end tag, and that script sees only the nodes parsed so far. html5ever
//! reports that point as `TokenizerResult::Script`; this driver hands the
//! script element to the caller, which runs it and then pumps again. This is
//! how Servo and Blitz drive html5ever.
//!
//! `document.write` while the parser is paused inserts text at the insertion
//! point, which is in front of the rest of the network input. The parser keeps
//! that text in its own queue (Servo's "script input") and always drains it
//! before the network input, so a write lands exactly where the writing
//! script ended.

use std::cell::Cell;

use html5ever::tendril::StrTendril;
use html5ever::tokenizer::{BufferQueue, Tokenizer, TokenizerOpts};
use html5ever::tree_builder::{TreeBuilder, TreeBuilderOpts};
use html5ever::TokenizerResult;

use crate::tree::{DomTree, NodeId};

/// What one call to [`StreamingParser::pump`] reached.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ParseStep {
    /// The tree builder closed this parser-inserted script element. Run it,
    /// then pump again.
    Script(NodeId),
    /// The whole input was parsed and the document is complete.
    Done,
}

pub struct StreamingParser {
    tokenizer: Tokenizer<TreeBuilder<NodeId, DomTree>>,
    network: BufferQueue,
    script: BufferQueue,
    finished: Cell<bool>,
}

impl StreamingParser {
    /// Start a document parse over `html`. Nothing is parsed until the first
    /// [`pump`](Self::pump).
    pub fn new(html: &str) -> Self {
        let tree = DomTree::new();
        tree.set_allow_declarative_shadow_roots(true);
        tree.set_parser_insertion_log(true);
        let builder = TreeBuilder::new(tree, TreeBuilderOpts::default());
        let tokenizer = Tokenizer::new(builder, TokenizerOpts::default());
        let network = BufferQueue::default();
        if !html.is_empty() {
            network.push_back(StrTendril::from_slice(html));
        }
        StreamingParser {
            tokenizer,
            network,
            script: BufferQueue::default(),
            finished: Cell::new(false),
        }
    }

    /// A handle to the live document this parser builds.
    pub fn dom(&self) -> DomTree {
        self.tokenizer.sink.sink.shared_handle()
    }

    fn feed(&self, input: &BufferQueue) -> Option<NodeId> {
        loop {
            match self.tokenizer.feed(input) {
                TokenizerResult::Done => return None,
                TokenizerResult::Script(node) => return Some(node),
                // The response was decoded before parsing started.
                TokenizerResult::EncodingIndicator(_) => continue,
            }
        }
    }

    /// Parse until the next parser-inserted script or the end of input.
    pub fn pump(&self) -> ParseStep {
        if self.finished.get() {
            return ParseStep::Done;
        }
        if let Some(node) = self.feed(&self.script) {
            return ParseStep::Script(node);
        }
        if let Some(node) = self.feed(&self.network) {
            return ParseStep::Script(node);
        }
        self.tokenizer.end();
        self.finished.set(true);
        ParseStep::Done
    }

    /// `document.write` while parsing: insert `text` at the insertion point
    /// and parse it now. Returns a script element the written text closed;
    /// the rest of the written text waits for [`continue_written`](Self::continue_written)
    /// or the next [`pump`](Self::pump).
    pub fn write(&self, text: &str) -> Option<NodeId> {
        if self.finished.get() {
            return None;
        }
        if !text.is_empty() {
            self.script.push_back(StrTendril::from_slice(text));
        }
        self.feed(&self.script)
    }

    /// Keep parsing written text only, after a script it closed has run.
    pub fn continue_written(&self) -> Option<NodeId> {
        if self.finished.get() {
            return None;
        }
        self.feed(&self.script)
    }

    pub fn is_finished(&self) -> bool {
        self.finished.get()
    }
}
