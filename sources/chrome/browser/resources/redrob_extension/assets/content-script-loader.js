// src/transport/content-script-loader.js
var DEFAULT_CONTENT_SCRIPT_CHUNK_PATH = "assets/content-script.js";
function resolveExtensionAssetUrl(relativePath, chromeRuntime = globalThis.chrome?.runtime) {
  return chromeRuntime.getURL(relativePath);
}
async function loadDynamicContentScript(options = {}) {
  const now = options.now ?? (() => performance.now());
  const getURL = options.getURL ?? ((path) => resolveExtensionAssetUrl(path));
  const onError = options.onError ?? console.error.bind(console);
  const chunkPath = options.chunkPath ?? DEFAULT_CONTENT_SCRIPT_CHUNK_PATH;
  const injectTime = now();
  try {
    const moduleUrl = getURL(chunkPath);
    const { onExecute } = await import(
      /* @vite-ignore */
      moduleUrl
    );
    onExecute?.({
      perf: {
        injectTime,
        loadTime: now() - injectTime
      }
    });
  } catch (error) {
    onError(error);
  }
}
function bootstrapDynamicContentScriptLoader(options) {
  void loadDynamicContentScript(options);
}

// src/transport/content-script-loader-entry.js
bootstrapDynamicContentScriptLoader();
//# sourceMappingURL=content-script-loader.js.map
