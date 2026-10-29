// Offline layout benchmark. Measures the first full layout of an HTML file and
// the layout after single DOM mutations, using the same retained-style path the
// engine uses between frames.
// Usage: layout_bench <input.html> [width] [height] [list]
//   list: also run the "append 1000 list items one by one" scenario on a
//         synthetic page (the input file is then ignored for that scenario).
// OBSCURA_LAYOUT_VERIFY=1 checks every incremental layout against a layout
// from scratch (see `obscura_render::dom::verify_incremental_layout`).
#![allow(clippy::style, clippy::complexity, clippy::perf, dead_code)]
use obscura_dom::tree::{DomTree, NodeData, NodeId};
use obscura_dom::tree_sink::parse_html;
use obscura_render::{
    prepare_dom_with_dynamic_fonts_and_stylesheet_cache, prepare_dom_with_retained_styles,
    PreparedRender, RenderResourceCache, RetainedStyleMutation, StylesheetCache,
    TreeStyleMutation,
};
use std::time::Instant;

/// `BENCH_PROFILE=<file>`: a SIGPROF sampler (1 kHz of CPU time) writing raw
/// return addresses, one sample per line, plus the executable's load base, for
/// offline symbolization with `nm`. No dependencies beyond glibc.
#[allow(unsafe_code)]
mod sampler {
    use std::ffi::c_void;
    use std::sync::atomic::{AtomicUsize, Ordering};

    const DEPTH: usize = 64;
    const MAX_SAMPLES: usize = 200_000;

    #[repr(C)]
    struct Timeval {
        sec: i64,
        usec: i64,
    }
    #[repr(C)]
    struct Itimerval {
        interval: Timeval,
        value: Timeval,
    }
    #[repr(C)]
    struct SigAction {
        handler: usize,
        mask: [u64; 16],
        flags: i32,
        restorer: usize,
    }
    extern "C" {
        fn setitimer(which: i32, new: *const Itimerval, old: *mut Itimerval) -> i32;
        fn sigaction(signal: i32, act: *const SigAction, old: *mut SigAction) -> i32;
        fn backtrace(buffer: *mut *mut c_void, size: i32) -> i32;
    }

    static NEXT: AtomicUsize = AtomicUsize::new(0);
    static mut SAMPLES: Option<Box<[[usize; DEPTH]]>> = None;

    extern "C" fn on_sample(_: i32) {
        let index = NEXT.fetch_add(1, Ordering::Relaxed);
        if index >= MAX_SAMPLES {
            return;
        }
        let mut frames = [std::ptr::null_mut::<c_void>(); DEPTH];
        let count = unsafe { backtrace(frames.as_mut_ptr(), DEPTH as i32) }.max(0) as usize;
        unsafe {
            if let Some(samples) = (*std::ptr::addr_of_mut!(SAMPLES)).as_mut() {
                let slot = &mut samples[index];
                for (target, frame) in slot.iter_mut().zip(frames.iter().take(count)) {
                    *target = *frame as usize;
                }
            }
        }
    }

    pub fn start() {
        unsafe {
            *std::ptr::addr_of_mut!(SAMPLES) =
                Some(vec![[0usize; DEPTH]; MAX_SAMPLES].into_boxed_slice());
            // Resolve glibc's unwinder before the first signal arrives.
            let mut warm = [std::ptr::null_mut::<c_void>(); 4];
            backtrace(warm.as_mut_ptr(), 4);
            let action = SigAction {
                handler: on_sample as extern "C" fn(i32) as usize,
                mask: [0; 16],
                flags: 0x1000_0000, // SA_RESTART
                restorer: 0,
            };
            sigaction(27, &action, std::ptr::null_mut()); // SIGPROF
            let period = Itimerval {
                interval: Timeval { sec: 0, usec: 1000 },
                value: Timeval { sec: 0, usec: 1000 },
            };
            setitimer(2, &period, std::ptr::null_mut()); // ITIMER_PROF
        }
    }

    pub fn finish(path: &str) {
        unsafe {
            let off = Itimerval {
                interval: Timeval { sec: 0, usec: 0 },
                value: Timeval { sec: 0, usec: 0 },
            };
            setitimer(2, &off, std::ptr::null_mut());
        }
        let exe = std::fs::read_link("/proc/self/exe").unwrap_or_default();
        let maps = std::fs::read_to_string("/proc/self/maps").unwrap_or_default();
        let base = maps
            .lines()
            .find(|line| line.ends_with(exe.to_string_lossy().as_ref()))
            .and_then(|line| line.split('-').next())
            .and_then(|start| usize::from_str_radix(start, 16).ok())
            .unwrap_or(0);
        let count = NEXT.load(Ordering::Relaxed).min(MAX_SAMPLES);
        let mut out = format!("base {base:x}\n");
        unsafe {
            if let Some(samples) = (*std::ptr::addr_of!(SAMPLES)).as_ref() {
                for sample in samples.iter().take(count) {
                    for frame in sample.iter().take_while(|frame| **frame != 0) {
                        out.push_str(&format!("{frame:x} "));
                    }
                    out.push('\n');
                }
            }
        }
        let _ = std::fs::write(path, out);
        eprintln!("profile: {count} samples -> {path}");
    }
}

struct Ctx {
    viewport: (f32, f32),
    base: Option<String>,
    resources: RenderResourceCache,
    sheets: StylesheetCache,
}

impl Ctx {
    fn full(&mut self, tree: &DomTree) -> PreparedRender {
        prepare_dom_with_dynamic_fonts_and_stylesheet_cache(
            tree,
            self.viewport,
            self.base.as_deref(),
            &mut self.resources,
            &[],
            &mut self.sheets,
        )
        .expect("prepare")
    }
    fn retained(
        &mut self,
        tree: &DomTree,
        previous: PreparedRender,
        mutations: &[RetainedStyleMutation],
    ) -> PreparedRender {
        prepare_dom_with_retained_styles(
            tree,
            self.viewport,
            self.base.as_deref(),
            &mut self.resources,
            &[],
            &mut self.sheets,
            previous,
            mutations,
        )
        .expect("prepare retained")
    }
}

fn ms(start: Instant) -> f64 {
    start.elapsed().as_secs_f64() * 1000.0
}

fn elements_named(tree: &DomTree, name: &str) -> Vec<NodeId> {
    tree.descendants(tree.document())
        .into_iter()
        .filter(|id| {
            tree.with_node(*id, |node| match &node.data {
                NodeData::Element { name: qual, .. } => qual.local.as_ref() == name,
                _ => false,
            })
            .unwrap_or(false)
        })
        .collect()
}

fn first_text_child(tree: &DomTree, id: NodeId) -> Option<NodeId> {
    tree.descendants(id).into_iter().find(|child| {
        tree.with_node(*child, |node| match &node.data {
            NodeData::Text { contents } => contents.trim().len() > 8,
            _ => false,
        })
        .unwrap_or(false)
    })
}

fn median(mut values: Vec<f64>) -> f64 {
    values.sort_by(|a, b| a.partial_cmp(b).unwrap());
    values[values.len() / 2]
}

fn page_bench(ctx: &mut Ctx, html: &str) {
    let tree = parse_html(html);
    // Detach the last paragraph so it can be re-inserted as a mutation.
    let paragraphs = elements_named(&tree, "p");
    let moved = paragraphs.last().copied();
    let moved_parent = moved.and_then(|p| tree.with_node(p, |node| node.parent).flatten());
    let moved_next = moved.and_then(|p| tree.with_node(p, |node| node.next_sibling).flatten());
    if let Some(p) = moved {
        tree.remove_child(p);
    }
    let start = Instant::now();
    let mut prepared = ctx.full(&tree);
    let first = ms(start);
    let mut warm = Vec::new();
    for _ in 0..2 {
        let start = Instant::now();
        prepared = ctx.full(&tree);
        warm.push(ms(start));
    }
    println!(
        "nodes={} first_full={:.1}ms warm_full={:.1}ms",
        prepared.layout().styles.len(),
        first,
        median(warm)
    );

    if std::env::var_os("BENCH_PROFILE").is_some()
        && std::env::var_os("BENCH_PROFILE_FULL").is_none()
    {
        sampler::start();
    }
    // Attribute mutation on a mid-document paragraph.
    let target = paragraphs.get(paragraphs.len() / 3).copied();
    let mut attr = Vec::new();
    if let Some(target) = target {
        for round in 0..5 {
            let old = tree
                .with_node(target, |node| node.get_attribute("class").map(str::to_owned))
                .flatten();
            let new = format!("bench-{round}");
            tree.with_node_mut(target, |node| node.set_attribute("class", new.clone()));
            let mutation = obscura_render::AttributeStyleMutation {
                node: target,
                name: "class".into(),
                old_value: old,
                new_value: Some(new),
            };
            let start = Instant::now();
            prepared = ctx.retained(&tree, prepared, &[mutation.into()]);
            attr.push(ms(start));
        }
    }
    // Text mutation inside a paragraph.
    let mut text = Vec::new();
    if let Some(text_node) = target.and_then(|t| first_text_child(&tree, t)) {
        let parent = tree.with_node(text_node, |node| node.parent).flatten();
        for round in 0..5 {
            tree.with_node_mut(text_node, |node| {
                if let NodeData::Text { contents } = &mut node.data {
                    contents.push_str(&format!(" edit{round}"));
                }
            });
            let mutation = TreeStyleMutation::Text {
                node: text_node,
                parent,
            };
            let start = Instant::now();
            prepared = ctx.retained(&tree, prepared, &[mutation.into()]);
            text.push(ms(start));
        }
    }
    // Attribute churn across the document: the attributes framework pages
    // toggle most (`hidden`, `aria-hidden`, `class`, `style`), on elements
    // spread over the whole tree. With OBSCURA_LAYOUT_VERIFY this exercises
    // every retained-style planner path the page's selectors reach.
    let elements: Vec<NodeId> = tree
        .descendants(tree.document())
        .into_iter()
        .filter(|id| tree.with_node(*id, |node| node.is_element()).unwrap_or(false))
        .collect();
    let mut churn = Vec::new();
    let step = (elements.len() / 12).max(1);
    for (round, target) in elements.iter().copied().step_by(step).skip(2).take(10).enumerate() {
        let (name, value) = match round % 4 {
            0 => ("hidden", Some(String::new())),
            1 => ("aria-hidden", Some("true".to_string())),
            2 => ("class", Some(format!("bench-churn-{round}"))),
            _ => ("style", Some("color: red".to_string())),
        };
        for apply in [true, false] {
            let old = tree
                .with_node(target, |node| node.get_attribute(name).map(str::to_owned))
                .flatten();
            let new = if apply { value.clone() } else { None };
            tree.with_node_mut(target, |node| match &new {
                Some(value) => node.set_attribute(name, value.clone()),
                None => {
                    if let NodeData::Element { attrs, .. } = &mut node.data {
                        attrs.retain(|attr| attr.name.local.as_ref() != name);
                    }
                }
            });
            let mutation = obscura_render::AttributeStyleMutation {
                node: target,
                name: name.into(),
                old_value: old,
                new_value: new,
            };
            let start = Instant::now();
            prepared = ctx.retained(&tree, prepared, &[mutation.into()]);
            churn.push(ms(start));
        }
    }
    if !churn.is_empty() {
        println!("attribute_churn n={} median={:.1}ms", churn.len(), median(churn));
    }
    // Re-insert the detached paragraph.
    let mut insert = None;
    if let (Some(p), Some(parent)) = (moved, moved_parent) {
        match moved_next {
            Some(next) => tree.insert_before(next, p),
            None => tree.append_child(parent, p),
        }
        let mutation = TreeStyleMutation::Insert {
            node: p,
            old_parent: None,
            new_parent: parent,
        };
        let start = Instant::now();
        prepared = ctx.retained(&tree, prepared, &[mutation.into()]);
        insert = Some(ms(start));
    }
    println!(
        "attr_mutation median={:.1}ms text_mutation median={:.1}ms insert={:.1}ms",
        if attr.is_empty() { 0.0 } else { median(attr) },
        if text.is_empty() { 0.0 } else { median(text) },
        insert.unwrap_or(0.0)
    );
    drop(prepared);
}

fn list_bench(ctx: &mut Ctx, count: usize) {
    let mut html = String::from(
        "<!DOCTYPE html><html><head><style>body{font:16px sans-serif;margin:8px}\
         li{padding:2px 4px;border-bottom:1px solid #ddd}li:nth-child(odd){background:#f4f4f4}\
         .card{display:flex;gap:8px}.card span{flex:1}</style></head><body>\
         <h1>List</h1><ul id=list></ul><div id=pool>",
    );
    for i in 0..count {
        html.push_str(&format!(
            "<li class=card><span>Item {i}</span><span>Some longer descriptive text for item {i}</span></li>"
        ));
    }
    html.push_str("</div></body></html>");
    let tree = parse_html(&html);
    let list = tree.get_element_by_id("list").expect("list");
    let pool = tree.get_element_by_id("pool").expect("pool");
    let items = elements_named(&tree, "li");
    tree.remove_child(pool);
    let start = Instant::now();
    let mut prepared = ctx.full(&tree);
    let first = ms(start);
    let mut per = Vec::with_capacity(count);
    if std::env::var_os("BENCH_PROFILE").is_some()
        && std::env::var_os("BENCH_PROFILE_FULL").is_none()
    {
        sampler::start();
    }
    let total = Instant::now();
    for item in items {
        tree.append_child(list, item);
        let mutation = TreeStyleMutation::Insert {
            node: item,
            old_parent: Some(pool),
            new_parent: list,
        };
        let start = Instant::now();
        prepared = ctx.retained(&tree, prepared, &[mutation.into()]);
        per.push(ms(start));
    }
    let total = ms(total);
    let last = *per.last().unwrap();
    println!(
        "list items={count} first_full={first:.1}ms append_total={total:.0}ms per_append median={:.2}ms last={last:.2}ms final_nodes={}",
        median(per),
        prepared.layout().styles.len()
    );
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let input = args.get(1).cloned().unwrap_or_default();
    let w: f32 = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1280.0);
    let h: f32 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(800.0);
    let mut resources = RenderResourceCache::default();
    resources.set_sync_loading_enabled(false);
    let mut ctx = Ctx {
        viewport: (w, h),
        base: None,
        resources,
        sheets: StylesheetCache::default(),
    };
    let profile = std::env::var("BENCH_PROFILE").ok();
    if profile.is_some() && std::env::var_os("BENCH_PROFILE_FULL").is_some() {
        sampler::start();
    }
    if args.get(4).map(String::as_str) == Some("list") {
        let count = args.get(5).and_then(|s| s.parse().ok()).unwrap_or(1000);
        list_bench(&mut ctx, count);
    } else {
        let html = std::fs::read_to_string(&input).expect("read input html");
        page_bench(&mut ctx, &html);
    }
    if let Some(path) = profile {
        sampler::finish(&path);
    }
}
