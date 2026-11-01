//! Network transport off the page thread.
//!
//! Pages run on a current-thread Tokio runtime that also runs V8. A request
//! driven there only makes progress (DNS, TLS handshake, each body chunk)
//! when page script yields, so a script-heavy page starved its own loads:
//! on CNN a 500 KB script took 11 s instead of 90 ms and its loader timed
//! out. Like Chrome's network service, sends and body reads run on a small
//! dedicated multi-thread runtime. Connections opened there keep their
//! driver tasks there, so pooled connections stay live while V8 is busy.

use std::future::Future;
use std::sync::OnceLock;

fn runtime() -> Option<&'static tokio::runtime::Runtime> {
    static RUNTIME: OnceLock<Option<tokio::runtime::Runtime>> = OnceLock::new();
    RUNTIME
        .get_or_init(|| {
            tokio::runtime::Builder::new_multi_thread()
                .worker_threads(2)
                .thread_name("redrob-net")
                .enable_all()
                .build()
                .ok()
        })
        .as_ref()
}

struct AbortOnDrop<T>(tokio::task::JoinHandle<T>);

impl<T> Drop for AbortOnDrop<T> {
    fn drop(&mut self) {
        self.0.abort();
    }
}

/// Run `future` on the transport runtime and wait for its output. Dropping
/// the returned future (a cancelled fetch, a closed page) aborts the work.
pub async fn on_transport<F>(future: F) -> F::Output
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    let Some(runtime) = runtime() else {
        return future.await;
    };
    let mut task = AbortOnDrop(runtime.spawn(future));
    match (&mut task.0).await {
        Ok(output) => output,
        Err(error) if error.is_panic() => std::panic::resume_unwind(error.into_panic()),
        // The runtime is process-wide and never shut down, and only this
        // guard aborts the task, so the task cannot be cancelled under us.
        Err(error) => unreachable!("transport task cancelled: {error}"),
    }
}
