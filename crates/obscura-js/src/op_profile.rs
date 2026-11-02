//! `OBSCURA_OP_PROFILE`: wall time spent in each synchronous op, printed to
//! stderr every few seconds. A diagnostic for finding which native calls a
//! page waits on; off unless the variable is set.

use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;
use std::time::{Duration, Instant};

use deno_core::{OpMetricsEvent, OpMetricsFactoryFn, OpMetricsSource};

#[derive(Default)]
struct Profile {
    started: Vec<Instant>,
    totals: HashMap<&'static str, (u64, Duration)>,
    last_report: Option<Instant>,
}

thread_local! {
    static PROFILE: RefCell<Profile> = RefCell::new(Profile::default());
}

fn report(profile: &mut Profile) {
    let mut rows: Vec<_> = profile.totals.iter().collect();
    rows.sort_by(|a, b| b.1 .1.cmp(&a.1 .1));
    let mut line = String::from("[timing] op-profile");
    for (name, (count, total)) in rows.into_iter().take(25) {
        line.push_str(&format!(" {name}={}ms/{count}", total.as_millis()));
    }
    eprintln!("{line}");
}

pub(crate) fn factory() -> Option<OpMetricsFactoryFn> {
    std::env::var_os("OBSCURA_OP_PROFILE")?;
    Some(Box::new(|_, _, decl| {
        let name: &'static str = decl.name;
        Some(Rc::new(move |_, event, source| {
            if source == OpMetricsSource::Async {
                return;
            }
            let _ = PROFILE.try_with(|profile| {
                let mut profile = profile.borrow_mut();
                match event {
                    OpMetricsEvent::Dispatched => profile.started.push(Instant::now()),
                    OpMetricsEvent::Completed | OpMetricsEvent::Error => {
                        let Some(started) = profile.started.pop() else {
                            return;
                        };
                        let elapsed = started.elapsed();
                        // Report only the outermost op's time.
                        if profile.started.is_empty() {
                            let entry = profile.totals.entry(name).or_default();
                            entry.0 += 1;
                            entry.1 += elapsed;
                        }
                        let now = Instant::now();
                        if profile
                            .last_report
                            .is_none_or(|last| now - last > Duration::from_secs(5))
                        {
                            profile.last_report = Some(now);
                            report(&mut profile);
                        }
                    }
                    OpMetricsEvent::CompletedAsync | OpMetricsEvent::ErrorAsync => {}
                }
            });
        }))
    }))
}
