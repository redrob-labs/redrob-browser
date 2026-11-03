//! `REDROB_TRACE=1`: frame times around typing, to find stutters. Each
//! window pass that has a key or text event, and the dozen passes after it,
//! logs how long the pass took and how long since the window's last one
//! (which also covers eframe painting it); so does any pass over 8 ms.

use std::time::{Duration, Instant};

pub use crate::cdp::tracing as on;

/// Call after a window's pass, which started at `start`.
pub fn frame(ctx: &egui::Context, start: Instant) {
    if !on() {
        return;
    }
    let pass = start.elapsed();
    let keys = ctx.input(|i| {
        i.events
            .iter()
            .filter(|e| {
                matches!(
                    e,
                    egui::Event::Text(_) | egui::Event::Key { pressed: true, .. }
                )
            })
            .count()
    });
    let id = egui::Id::new("redrob-frame-trace");
    let (last, hot) = ctx
        .data(|d| d.get_temp::<(Instant, u32)>(id))
        .unwrap_or((start, 0));
    let gap = start.saturating_duration_since(last);
    let hot = if keys > 0 { 12 } else { hot };
    if hot > 0 || pass > Duration::from_millis(8) {
        // eframe's own measure of the window's last frame: the pass,
        // tessellating and painting it (and its popups), without vsync.
        let cpu = ctx
            .data(|d| d.get_temp::<f32>(cpu_id()))
            .map_or(String::new(), |c| {
                format!(", last frame {:.1} ms", c * 1000.0)
            });
        eprintln!(
            "redrob-browser: frame {:?}: pass {:.1} ms, since last {:.1} ms, keys {keys}{cpu}",
            ctx.viewport_id(),
            ms(pass),
            ms(gap),
        );
    }
    ctx.data_mut(|d| d.insert_temp(id, (start, hot.saturating_sub(1))));
}

/// Run `f`, logging how long it took when tracing.
pub fn time<R>(what: &str, f: impl FnOnce() -> R) -> R {
    if !on() {
        return f();
    }
    let start = Instant::now();
    let r = f();
    eprintln!("redrob-browser: {what}: {:.2} ms", ms(start.elapsed()));
    r
}

fn ms(d: Duration) -> f64 {
    d.as_secs_f64() * 1000.0
}

fn cpu_id() -> egui::Id {
    egui::Id::new("redrob-frame-cpu")
}

/// The root window's last frame took `cpu` seconds (eframe's measure).
pub fn last_frame_cpu(ctx: &egui::Context, cpu: Option<f32>) {
    if let (true, Some(c)) = (on(), cpu) {
        ctx.data_mut(|d| d.insert_temp(cpu_id(), c));
    }
}
