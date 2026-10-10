# Where the privacy model runs — measured

PR 1.2 of `docs/AI-FEATURES-PLAN.md`. The question: can the on-device model run inside the agent
server we actually ship, and how does that compare with running it in the extension?

**Answer: onnxruntime-node, shipped beside the compiled server and opened through a hash-pinned
native-addon guard.** It is 5× faster than WebAssembly, finds the same entities as Cowork's
measured setup, and is the only option under the plan's bar of 300 ms per 1,000 characters.

## Setup

- Model: `1T/veil-pii-ko-lite` at `dd26d2b1`, `model.int8.onnx` (143 MB). Its files match the
  SHA-256s in Cowork's pinned manifest, and the manifest matches `PINNED_MANIFEST_SHA256`.
- Text: Cowork's evaluation set (396 samples) for accuracy, and its 1,000-character latency
  document for speed (3 warm-up runs, then 10–20 timed).
- Host: Linux x64, Intel Xeon Platinum 8488C, 8 vCPUs. Bun 1.4.2, Node 22.23. onnxruntime 1.23.0
  (Cowork's version).
- Accuracy uses Cowork's measure: a find counts when it overlaps a gold span, and a gold span counts
  when it is covered.

Reproduce, from `agent/packages/privacy`:

```sh
bun bench/runtime.ts --runtime node --model <model-dir> --threads 4
bun bench/compile.ts <out>                       # builds it the way the server is built
cp node_modules/onnxruntime-node/bin/napi-v6/linux/x64/* <out>/ort/
bun bench/pins.ts <out>/ort > <out>/ort-pins.json
REDROB_ORT_DIR=<out>/ort REDROB_ORT_PINS=<out>/ort-pins.json \
  <out>/privacy-bench --runtime node --model <model-dir> --pinned-guard
<out>/privacy-bench --runtime web --wasm-dir node_modules/onnxruntime-web/dist --model <model-dir> --guard
```

## Results

ms per 1,000 characters; accuracy is precision / recall in %.

| Run | median | p90 | load ms | RSS MB | PERSON | ORG | ADDRESS |
|---|---:|---:|---:|---:|---|---|---|
| **compiled server, onnxruntime-node, pinned guard, 4 threads** | **180.7** | 192.3 | 292 | 596 | 99.7 / 98.7 | 100 / 73.5 | 86.8 / 91.2 |
| compiled server, onnxruntime-node, pinned guard, 8 threads | 187.4 | 197.8 | 325 | 594 | same | same | same |
| `bun` (not compiled), onnxruntime-node, 1 / 2 / 4 / 8 threads | 555 / 303 / 178 / 185 | | 286–323 | ~300 | same | same | same |
| Node, onnxruntime-node, 4 threads (Cowork's setup) | 173.9 | 176.4 | 323 | 457 | same | same | same |
| compiled server, onnxruntime-web (WASM), 1 / 4 / 8 threads | 3,410 / **917** / 958 | | 455–689 | 715–765 | 100 / 98.7 | 100 / 72.7 | 85.3 / 91.2 |
| Node (V8, as in Chromium), onnxruntime-web, 1 / 4 / 8 threads | 3,630 / **1,022** / 2,189 | | 498–578 | 842–980 | same as WASM | | |

Refusals, which are the point of the guard:

| Run | Result |
|---|---|
| compiled server, onnxruntime-node, **the shipped guard** | refused: "Redrob server disables native addon loading in compiled production builds" |
| compiled server, pinned guard, `libonnxruntime.so.1` changed by one byte | refused: "native file does not match its pin" |
| onnxruntime-node embedded in the binary instead of beside it | fails: Bun extracts the `.node` to a temp dir without `libonnxruntime.so.1` — the same failure Cowork recorded for its bun-compiled server |

## What this decides

1. **The runtime is onnxruntime-node, next to the server binary.** 4 threads is the sweet spot: 8 is
   no faster here. At 181 ms the gate adds about 0.2 s to a typed message, and about 9 s the first
   time a 50,000-character page is read at High or Strict (results are cached per text).
2. **WASM is out for the gate.** 917 ms is 5× slower and over the bar on this machine, matching
   Cowork's 960–2,460 ms. In V8 more threads got slower, not faster. WebGPU was not measured: this
   host has no GPU, and the browser cannot be assumed to have one, so it is at most a later
   optimisation for the extension, not the plan of record.
3. **The two runtimes do not find exactly the same entities.** WASM differed on 7 of 396 samples,
   all boundary cases (`Northwind H` as an address, `Cre` + `Capital LLC`), for 0.8 points less ORG
   recall and 1.5 less ADDRESS precision. Another reason to run one runtime everywhere.
4. **The guard changes, it is not removed.** `bench/pinned-guard.ts` is the candidate for
   `apps/server/src/lib/native-addon-guard.ts`: it still refuses every addon except the files it is
   given, hashes those and their shared libraries at start-up, and hashes them again at the moment
   of `dlopen`. In the real build the pins are written when the server's resources are staged, not
   read from disk the way this bench's `pins.ts` does. Checking adds nothing measurable to latency.
5. **Packaging has two traps, both now known.** A compiled binary resolves bare imports only
   inside its own bundle, and onnxruntime-node loads its binding through a template-literal
   `require`, which the bundler cannot follow. `bench/compile.ts` handles both by rewriting
   `binding.js` to open the binding from `REDROB_ORT_DIR`. 1.3 moves that into the server's build
   descriptor and adds the runtime files to `server-prod-resources.json`, per platform.

## What is still not measured

- macOS and Windows. The binding for each ships in the npm package (`darwin-arm64`, `darwin-x64`,
  `win32-x64`, `win32-arm64`), but each needs its own run, including code-signing on macOS: a
  dylib beside a notarised binary has to be signed with it.
- A low-end laptop. This was an 8-vCPU server CPU; Cowork's 150 ms was on an Apple M3. The bar is
  300 ms, so there is headroom, but a 4-core laptop has to be measured before the UI promises a
  speed.
- RSS in the compiled binary is about 600 MB against 300 MB under `bun`. Most of it is likely the
  80 MB binary and its mapped bundle; 1.3 measures it inside the real server before choosing to
  load the model lazily (it is only needed at High and Strict, as in Cowork).
