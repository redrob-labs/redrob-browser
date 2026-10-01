import {
  ChatShell,
  apiKeyDependencies,
  import_client,
  import_react,
  installAppearance,
  react_exports,
  useApiKeyState,
  useUiCopy
} from "./chunks/chunk-XIAHWEUX.js";
import "./chunks/chunk-I6XLRVDC.js";

// src/new-tab/new-tab-app.jsx
function NewTabApp() {
  const apiKeyState = useApiKeyState(apiKeyDependencies);
  const copy = useUiCopy(import_react.default);
  const [locale, setLocale] = (0, react_exports.useState)(copy.locale);
  (0, react_exports.useEffect)(() => {
    const field = document.querySelector("textarea, input:not([type=hidden])");
    field?.focus({ preventScroll: true });
  }, []);
  return /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-new-tab" }, /* @__PURE__ */ import_react.default.createElement("div", { className: "redrob-new-tab-column" }, /* @__PURE__ */ import_react.default.createElement(
    ChatShell,
    {
      apiKey: apiKeyState.apiKey,
      needsApiKey: apiKeyState.needsApiKey,
      copy,
      locale,
      onLocaleChange: setLocale
    }
  )));
}
function initializeNewTabRuntime() {
  installAppearance();
}

// src/new-tab/new-tab-entry.jsx
initializeNewTabRuntime();
(0, import_client.createRoot)(document.getElementById("root")).render(
  /* @__PURE__ */ import_react.default.createElement(import_react.default.StrictMode, null, /* @__PURE__ */ import_react.default.createElement(NewTabApp, null))
);
//# sourceMappingURL=newtab.js.map
