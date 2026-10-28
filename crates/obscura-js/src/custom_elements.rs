//! Native support for custom element reactions.

use obscura_dom::{DomTree, NodeData, NodeId};

const HTML_NS: &str = "http://www.w3.org/1999/xhtml";

/// Elements that may take part in custom element reactions under `root`, in
/// shadow-including tree order: HTML elements whose local name contains a
/// hyphen or that carry an `is` attribute. A host's shadow tree is visited
/// before its light children. `include_root` visits `root` itself (and its
/// shadow tree); otherwise only its light children's subtrees are walked. A
/// non-empty `name` keeps only elements with that local name or `is` value, so
/// one definition's upgrade walk returns just its own elements.
pub(crate) fn candidates(
    dom: &DomTree,
    root: NodeId,
    include_root: bool,
    name: &str,
) -> Vec<NodeId> {
    // Children are pushed in reverse so the first child is popped first.
    fn push_children(dom: &DomTree, stack: &mut Vec<NodeId>, id: NodeId) {
        let start = stack.len();
        let mut current = dom.with_node(id, |n| n.first_child).flatten();
        while let Some(child) = current {
            stack.push(child);
            current = dom.with_node(child, |n| n.next_sibling).flatten();
        }
        stack[start..].reverse();
    }
    let mut result = Vec::new();
    let mut stack = Vec::new();
    if include_root {
        stack.push(root);
    } else {
        push_children(dom, &mut stack, root);
    }
    while let Some(id) = stack.pop() {
        let candidate = dom
            .with_node(id, |n| match &n.data {
                NodeData::Element {
                    name: qual, attrs, ..
                } if qual.ns.as_ref() == HTML_NS => {
                    let local = qual.local.as_ref();
                    let is_value = attrs
                        .iter()
                        .find(|a| a.name.ns.as_ref().is_empty() && a.name.local.as_ref() == "is")
                        .map(|a| a.value.as_str());
                    Some(if name.is_empty() {
                        local.contains('-') || is_value.is_some()
                    } else {
                        local == name || is_value == Some(name)
                    })
                }
                NodeData::Element { .. } => Some(false),
                _ => None,
            })
            .flatten();
        if candidate == Some(true) {
            result.push(id);
        }
        // Push light children first so the shadow tree, pushed last, is
        // visited first.
        push_children(dom, &mut stack, id);
        if candidate.is_some() {
            if let Some(shadow) = dom.shadow_root(id) {
                push_children(dom, &mut stack, shadow);
            }
        }
    }
    result
}
