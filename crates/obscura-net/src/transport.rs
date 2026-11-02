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
use std::pin::Pin;
use std::sync::OnceLock;
use std::task::{Context, Poll};

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

/// Work running on the transport runtime. Awaiting it yields the output;
/// dropping it (a cancelled fetch, a closed page) aborts the work.
pub struct TransportTask<T>(tokio::task::JoinHandle<T>);

impl<T> Drop for TransportTask<T> {
    fn drop(&mut self) {
        self.0.abort();
    }
}

impl<T> Future for TransportTask<T> {
    type Output = T;

    fn poll(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<T> {
        match Pin::new(&mut self.0).poll(cx) {
            Poll::Ready(Ok(output)) => Poll::Ready(output),
            Poll::Ready(Err(error)) if error.is_panic() => {
                std::panic::resume_unwind(error.into_panic())
            }
            // Only this handle aborts the task, and the runtime is never shut
            // down, so the task cannot be cancelled while it is awaited.
            Poll::Ready(Err(error)) => unreachable!("transport task cancelled: {error}"),
            Poll::Pending => Poll::Pending,
        }
    }
}

/// Start `future` on the transport runtime now; it makes progress whether or
/// not the caller is polled. Falls back to the caller's runtime when the
/// transport runtime cannot be built.
pub fn spawn_on_transport<F>(future: F) -> TransportTask<F::Output>
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    TransportTask(match runtime() {
        Some(runtime) => runtime.spawn(future),
        None => tokio::spawn(future),
    })
}

/// Run `future` on the transport runtime and wait for its output.
pub async fn on_transport<F>(future: F) -> F::Output
where
    F: Future + Send + 'static,
    F::Output: Send + 'static,
{
    spawn_on_transport(future).await
}
