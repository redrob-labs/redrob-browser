// src/content/element-ref-registry.js
function ensureElementRefRegistry() {
  window.__redrobElementMap || (window.__redrobElementMap = {});
  window.__redrobElementReverseMap || (window.__redrobElementReverseMap = /* @__PURE__ */ new WeakMap());
  window.__redrobRefCounter || (window.__redrobRefCounter = 0);
}
function getOrAssignRefId(element) {
  let refId = window.__redrobElementReverseMap.get(element) || null;
  if (refId) {
    const existing = window.__redrobElementMap[refId];
    if (!(existing && existing.deref() === element)) {
      refId = null;
    }
  }
  if (!refId) {
    refId = "ref_" + ++window.__redrobRefCounter;
    window.__redrobElementMap[refId] = new WeakRef(element);
    window.__redrobElementReverseMap.set(element, refId);
  }
  return refId;
}
function pruneDeadElementRefs() {
  for (const refId in window.__redrobElementMap) {
    if (!window.__redrobElementMap[refId].deref()) {
      delete window.__redrobElementMap[refId];
    }
  }
}

// src/content/infer-aria-role.js
var TAG_TO_ROLE = {
  a: "link",
  button: "button",
  select: "combobox",
  textarea: "textbox",
  h1: "heading",
  h2: "heading",
  h3: "heading",
  h4: "heading",
  h5: "heading",
  h6: "heading",
  img: "image",
  nav: "navigation",
  main: "main",
  header: "banner",
  footer: "contentinfo",
  section: "region",
  article: "article",
  aside: "complementary",
  form: "form",
  table: "table",
  ul: "list",
  ol: "list",
  li: "listitem",
  label: "label"
};
function inferAriaRole(element) {
  const explicitRole = element.getAttribute("role");
  if (explicitRole) return explicitRole;
  const tagName = element.tagName.toLowerCase();
  const inputType = element.getAttribute("type");
  if (tagName === "input") {
    if (inputType === "submit" || inputType === "button") return "button";
    if (inputType === "checkbox") return "checkbox";
    if (inputType === "radio") return "radio";
    if (inputType === "file") return "button";
    return "textbox";
  }
  return TAG_TO_ROLE[tagName] || "generic";
}

// src/content/is-sensitive-control.js
var SENSITIVE_AUTOCOMPLETE_TOKENS = [
  "current-password",
  "new-password",
  "one-time-code",
  "cc-number",
  "cc-csc",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year"
];
function isSensitiveControl(element) {
  const type = (element.getAttribute("type") || "").toLowerCase();
  if (type === "password" || type === "hidden") return true;
  const autocomplete = (element.getAttribute("autocomplete") || "").toLowerCase();
  for (let tokenIndex = 0; tokenIndex < SENSITIVE_AUTOCOMPLETE_TOKENS.length; tokenIndex++) {
    if (autocomplete.indexOf(SENSITIVE_AUTOCOMPLETE_TOKENS[tokenIndex]) !== -1) {
      return true;
    }
  }
  return false;
}

// src/content/get-accessible-name.js
function getDirectTextContent(element) {
  let text = "";
  for (let childIndex = 0; childIndex < element.childNodes.length; childIndex++) {
    if (element.childNodes[childIndex].nodeType === Node.TEXT_NODE) {
      text += element.childNodes[childIndex].textContent;
    }
  }
  return text.trim();
}
function getAccessibleName(element) {
  const tagName = element.tagName.toLowerCase();
  if (tagName === "select") {
    if (isSensitiveControl(element)) {
      const ariaLabel2 = element.getAttribute("aria-label");
      if (ariaLabel2 && ariaLabel2.trim()) return ariaLabel2.trim();
      const title2 = element.getAttribute("title");
      if (title2 && title2.trim()) return title2.trim();
      if (element.id) {
        const label = document.querySelector('label[for="' + element.id + '"]');
        if (label) {
          const labelText = getDirectTextContent(label);
          if (labelText) return labelText;
        }
      }
      return "[value redacted]";
    }
    const selectEl = (
      /** @type {HTMLSelectElement} */
      element
    );
    const selected = selectEl.querySelector("option[selected]") || selectEl.options[selectEl.selectedIndex];
    if (selected && selected.textContent) return selected.textContent.trim();
  }
  const ariaLabel = element.getAttribute("aria-label");
  if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();
  const placeholder = element.getAttribute("placeholder");
  if (placeholder && placeholder.trim()) return placeholder.trim();
  const title = element.getAttribute("title");
  if (title && title.trim()) return title.trim();
  const alt = element.getAttribute("alt");
  if (alt && alt.trim()) return alt.trim();
  if (element.id) {
    const label = document.querySelector('label[for="' + element.id + '"]');
    if (label) {
      const labelText = getDirectTextContent(label);
      if (labelText) return labelText;
    }
  }
  if (tagName === "input") {
    const inputEl = (
      /** @type {HTMLInputElement} */
      element
    );
    const type = element.getAttribute("type") || "";
    const valueAttr = element.getAttribute("value");
    if (type === "submit" && valueAttr && valueAttr.trim()) {
      return valueAttr.trim();
    }
    if (isSensitiveControl(element)) {
      return inputEl.value ? "[value redacted]" : "";
    }
    if (inputEl.value && inputEl.value.length < 50 && inputEl.value.trim()) {
      return inputEl.value.trim();
    }
  }
  if (tagName === "textarea" && isSensitiveControl(element)) {
    return (
      /** @type {HTMLTextAreaElement} */
      element.value ? "[value redacted]" : ""
    );
  }
  if (["button", "a", "summary"].includes(tagName)) {
    let text = "";
    for (let childIndex = 0; childIndex < element.childNodes.length; childIndex++) {
      const node = element.childNodes[childIndex];
      if (node.nodeType === Node.TEXT_NODE) text += node.textContent;
    }
    if (text.trim()) return text.trim();
  }
  if (tagName.match(/^h[1-6]$/)) {
    const text = element.textContent;
    if (text && text.trim()) return text.trim().substring(0, 100);
  }
  if (tagName === "img") return "";
  let directText = "";
  for (let childIndex = 0; childIndex < element.childNodes.length; childIndex++) {
    const node = element.childNodes[childIndex];
    if (node.nodeType === Node.TEXT_NODE) directText += node.textContent;
  }
  if (directText && directText.trim() && directText.trim().length >= 3) {
    const trimmed = directText.trim();
    return trimmed.length > 100 ? trimmed.substring(0, 100) + "..." : trimmed;
  }
  return "";
}

// src/content/element-inclusion.js
function isVisuallyDisplayed(element) {
  const style = window.getComputedStyle(element);
  return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0" && element.offsetWidth > 0 && element.offsetHeight > 0;
}
function isInteractiveElement(element) {
  const tagName = element.tagName.toLowerCase();
  return [
    "a",
    "button",
    "input",
    "select",
    "textarea",
    "details",
    "summary"
  ].includes(tagName) || element.getAttribute("onclick") !== null || element.getAttribute("tabindex") !== null || element.getAttribute("role") === "button" || element.getAttribute("role") === "link" || element.getAttribute("contenteditable") === "true";
}
function isLandmarkOrExplicitRole(element) {
  const tagName = element.tagName.toLowerCase();
  return [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "nav",
    "main",
    "header",
    "footer",
    "section",
    "article",
    "aside"
  ].includes(tagName) || element.getAttribute("role") !== null;
}
function shouldIncludeElement(element, options) {
  const tagName = element.tagName.toLowerCase();
  if (["script", "style", "meta", "link", "title", "noscript"].includes(tagName)) {
    return false;
  }
  if (options.filter !== "all" && element.getAttribute("aria-hidden") === "true") {
    return false;
  }
  if (options.filter !== "all" && !isVisuallyDisplayed(element)) {
    return false;
  }
  if (options.filter !== "all" && !options.refId) {
    const rect = element.getBoundingClientRect();
    if (!(rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0)) {
      return false;
    }
  }
  if (options.filter === "interactive") return isInteractiveElement(element);
  if (isInteractiveElement(element)) return true;
  if (isLandmarkOrExplicitRole(element)) return true;
  if (getAccessibleName(element).length > 0) return true;
  const role = inferAriaRole(element);
  return role !== null && role !== "generic" && role !== "image";
}

// src/content/generate-accessibility-tree.js
var MAX_ELEMENTS = 1e4;
var DEFAULT_MAX_DEPTH = 15;
function collapseAndClampName(name) {
  return name.replace(/\s+/g, " ").substring(0, 100);
}
function escapeQuotes(name) {
  return name.replace(/"/g, '\\"');
}
function walkElement(element, depth, options, state) {
  if (state.elementCount >= MAX_ELEMENTS) return;
  if (depth > state.maxDepth) return;
  if (!element || !element.tagName) return;
  const include = shouldIncludeElement(element, options) || options.refId != null && depth === 0;
  if (include) {
    const role = inferAriaRole(element);
    let name = getAccessibleName(element);
    const refId = getOrAssignRefId(element);
    state.elementCount++;
    let line = " ".repeat(depth) + role;
    if (name) {
      name = collapseAndClampName(name);
      line += ' "' + escapeQuotes(name) + '"';
    }
    line += " [" + refId + "]";
    if (element.getAttribute("href")) {
      line += ' href="' + element.getAttribute("href") + '"';
    }
    if (element.getAttribute("type")) {
      line += ' type="' + element.getAttribute("type") + '"';
    }
    if (element.getAttribute("placeholder")) {
      line += ' placeholder="' + element.getAttribute("placeholder") + '"';
    }
    state.lines.push(line);
    if (element.tagName.toLowerCase() === "select" && !isSensitiveControl(element)) {
      const optionsList = (
        /** @type {HTMLSelectElement} */
        element.options
      );
      for (let optionIndex = 0; optionIndex < optionsList.length; optionIndex++) {
        const option = optionsList[optionIndex];
        let optionLine = " ".repeat(depth + 1) + "option";
        let optionText = option.textContent ? option.textContent.trim() : "";
        if (optionText) {
          optionText = collapseAndClampName(optionText);
          optionLine += ' "' + escapeQuotes(optionText) + '"';
        }
        if (option.selected) optionLine += " (selected)";
        if (option.value && option.value !== optionText) {
          optionLine += ' value="' + option.value.replace(/"/g, '\\"') + '"';
        }
        state.lines.push(optionLine);
      }
    }
  }
  if ((element.tagName.toLowerCase() !== "select" || !isSensitiveControl(element)) && element.children && depth < state.maxDepth) {
    for (let childIndex = 0; childIndex < element.children.length; childIndex++) {
      walkElement(
        element.children[childIndex],
        include ? depth + 1 : depth,
        options,
        state
      );
    }
  }
}
function generateAccessibilityTree(filter, maxDepth, maxChars, refId) {
  try {
    ensureElementRefRegistry();
    const lines = [];
    const effectiveMaxDepth = maxDepth != null ? maxDepth : DEFAULT_MAX_DEPTH;
    const state = {
      lines,
      maxDepth: effectiveMaxDepth,
      elementCount: 0
    };
    const options = { filter: filter || "all", refId };
    if (refId) {
      const weakRef = window.__redrobElementMap[refId];
      if (!weakRef) {
        return {
          error: "Element with ref_id '" + refId + "' not found. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          pageContent: "",
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      }
      const element = weakRef.deref();
      if (!element) {
        return {
          error: "Element with ref_id '" + refId + "' no longer exists. It may have been removed from the page. Use read_page without ref_id to get the current page state.",
          pageContent: "",
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
      }
      walkElement(element, 0, options, state);
    } else if (document.body) {
      walkElement(document.body, 0, options, state);
    }
    pruneDeadElementRefs();
    let pageContent = lines.join("\n");
    if (state.elementCount >= MAX_ELEMENTS) {
      pageContent += "\n[truncated at 10000 elements — page is very large; " + (refId ? "use a smaller depth or focus on a more specific child element" : "use a refId or smaller depth to focus") + "]";
    }
    if (maxChars != null && pageContent.length > maxChars) {
      const originalLength = pageContent.length;
      let cut = pageContent.lastIndexOf("\n", maxChars);
      if (cut <= 0) cut = Math.max(0, maxChars);
      const hint = refId ? "use a smaller depth or focus on a more specific child element" : "use ref_id or a smaller depth to focus";
      pageContent = pageContent.slice(0, cut) + "\n[output truncated at " + maxChars + " of " + originalLength + " characters. Pass a larger max_chars (default 50000) to see more, or " + hint + ".]";
    }
    return {
      pageContent,
      viewport: { width: window.innerWidth, height: window.innerHeight }
    };
  } catch (err) {
    throw new Error(
      "Error generating accessibility tree: " + (err.message || "Unknown error")
    );
  }
}
function installAccessibilityTreeApi() {
  ensureElementRefRegistry();
  window.__generateAccessibilityTree = generateAccessibilityTree;
}

// src/config.js
var REDROB_CONSOLE_URL = "https://console.redrob.ai";
var GATEWAY_PATH = "/api/backend";
function gatewayOriginFor(location2) {
  const servedOverHttp = location2?.protocol === "http:" || location2?.protocol === "https:";
  return servedOverHttp ? location2.origin : REDROB_CONSOLE_URL;
}
var REDROB_API_BASE_URL = `${gatewayOriginFor(globalThis.location)}${GATEWAY_PATH}`;
var REDROB_COMPLETIONS_URL = `${REDROB_API_BASE_URL}/v1/chat/completions`;
var REDROB_MODELS_URL = `${REDROB_API_BASE_URL}/v1/models`;
var REDROB_BROWSER_ID = "ai.redrob.browser";
var NATIVE_HOST_CANDIDATES = [
  { name: REDROB_BROWSER_ID, label: "Desktop" },
  { name: `${REDROB_BROWSER_ID}.code`, label: "Redrob Code" }
];

// src/content/index.js
function bootstrapAccessibilityTree() {
  installAccessibilityTreeApi();
}

// src/content/accessibility-tree-entry.js
bootstrapAccessibilityTree();
//# sourceMappingURL=accessibility-tree.js.map
