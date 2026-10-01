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
var TRUSTED_EXTERNAL_ORIGINS = [
  "https://console.redrob.ai",
  "https://redrob.io",
  "https://www.redrob.io"
];
var REDROB_DEEP_LINK_HOSTS = [
  "redrob.io",
  "www.redrob.io",
  "console.redrob.ai"
];
var STORAGE_KEYS = {
  apiKey: "redrobApiKey"
};
var LEGACY_API_KEY_STORAGE_KEY = "anthropicApiKey";

// src/background/dependencies.js
function createBackgroundDependencies(overrides = {}) {
  const missing = (name) => () => {
    throw new Error(`Background dependency not injected: ${name}`);
  };
  return {
    storageKeys: {
      MCP_CONNECTED: "mcpConnected",
      UPDATE_AVAILABLE: "updateAvailable",
      TARGET_TAB_ID: "targetTabId",
      PENDING_SCHEDULED_TASK: "pendingScheduledTask",
      NOTIFICATIONS_ENABLED: "notificationsEnabled",
      REDROB_ORG_HINT: "redrobOrgHint",
      ...overrides.storageKeys || {}
    },
    setStorageValue: overrides.setStorageValue || missing("setStorageValue"),
    getStorageValue: overrides.getStorageValue || missing("getStorageValue"),
    removeStorageValue: overrides.removeStorageValue || missing("removeStorageValue"),
    isFeatureEnabled: overrides.isFeatureEnabled || missing("isFeatureEnabled"),
    executeTool: overrides.executeTool || missing("executeTool"),
    registerCapturedImage: overrides.registerCapturedImage || missing("registerCapturedImage"),
    makeToolErrorResult: overrides.makeToolErrorResult || ((message) => ({
      content: [{ type: "text", text: message }],
      is_error: true
    })),
    tabGroupManager: overrides.tabGroupManager || /** @type {TabGroupManager} */
    {
      initialize: missing("tabGroupManager.initialize"),
      startTabGroupChangeListener: missing(
        "tabGroupManager.startTabGroupChangeListener"
      ),
      stopTabGroupChangeListener: missing(
        "tabGroupManager.stopTabGroupChangeListener"
      ),
      createIsolatedGroup: missing("tabGroupManager.createIsolatedGroup"),
      findGroupByTab: missing("tabGroupManager.findGroupByTab"),
      createGroup: missing("tabGroupManager.createGroup"),
      adoptOrphanedGroup: missing("tabGroupManager.adoptOrphanedGroup"),
      clearAllGroups: missing("tabGroupManager.clearAllGroups"),
      getMainTabId: missing("tabGroupManager.getMainTabId"),
      handleTabClosed: missing("tabGroupManager.handleTabClosed"),
      dismissStaticIndicatorsForGroup: missing(
        "tabGroupManager.dismissStaticIndicatorsForGroup"
      )
    },
    debuggerRelay: overrides.debuggerRelay || {
      detachAll: missing("debuggerRelay.detachAll"),
      notifyTabDetach: missing("debuggerRelay.notifyTabDetach")
    },
    bindSessionToTabGroup: overrides.bindSessionToTabGroup || missing("bindSessionToTabGroup"),
    clearAllLoadingIndicators: overrides.clearAllLoadingIndicators || missing("clearAllLoadingIndicators"),
    trackAnalytics: overrides.trackAnalytics || (() => {
    }),
    scheduledTaskSuccessProps: overrides.scheduledTaskSuccessProps || ((taskId, executionType) => ({
      task_id: taskId,
      success: true,
      execution_type: executionType
    })),
    scheduledTaskFailureProps: overrides.scheduledTaskFailureProps || ((taskId, executionType, error) => ({
      task_id: taskId,
      success: false,
      execution_type: executionType,
      error_name: error instanceof Error ? error.name : typeof error
    })),
    initAnalytics: overrides.initAnalytics || (async () => {
    }),
    refreshAnalyticsProfile: overrides.refreshAnalyticsProfile || (async () => {
    }),
    invalidateAnalyticsUser: overrides.invalidateAnalyticsUser || (() => {
    }),
    bumpAnalyticsProfileGeneration: overrides.bumpAnalyticsProfileGeneration || (() => {
    }),
    getExtensionConfig: overrides.getExtensionConfig || missing("getExtensionConfig"),
    sleep: overrides.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    ensureOffscreenDocument: overrides.ensureOffscreenDocument || (async () => {
    }),
    installBridgeKeepaliveAlarms: overrides.installBridgeKeepaliveAlarms || (() => {
    }),
    installToolNavigationGuard: overrides.installToolNavigationGuard || (() => {
    }),
    connectBridgeWebSocket: overrides.connectBridgeWebSocket || (async () => false),
    closeBridgeWebSocket: overrides.closeBridgeWebSocket || (() => {
    }),
    isBridgeWebSocketOpen: overrides.isBridgeWebSocketOpen || (() => false),
    sendBridgeNotification: overrides.sendBridgeNotification || (() => false),
    bumpBridgeGenerationAndDetach: overrides.bumpBridgeGenerationAndDetach || (() => {
    }),
    getAccountUuid: overrides.getAccountUuid || (async () => void 0),
    savedPromptsService: overrides.savedPromptsService || {
      getAllPrompts: async () => [],
      updateAlarmForPrompt: async () => {
      },
      updateNextRunTimes: async () => {
      }
    },
    cicIframeMessageTypes: overrides.cicIframeMessageTypes || [
      "CIC_IFRAME_BRIDGE_INIT",
      "CIC_IFRAME_TOOL_CALL"
    ],
    conwayMessageTypes: overrides.conwayMessageTypes || {
      GET_STATUS: "conwayGetStatus"
    },
    getConwayStatus: overrides.getConwayStatus || (() => ({})),
    getConwayContainerId: overrides.getConwayContainerId || (async () => null),
    initConwayConnection: overrides.initConwayConnection || (async () => false),
    resetConwayConnection: overrides.resetConwayConnection || (() => {
    }),
    handleConwayNotificationClick: overrides.handleConwayNotificationClick || (() => {
    }),
    handleConwayNotificationClosed: overrides.handleConwayNotificationClosed || (() => {
    }),
    getOnboardingPromptText: overrides.getOnboardingPromptText || (() => void 0),
    getDefaultLocale: overrides.getDefaultLocale || (() => "en-US"),
    localeDisplayNames: overrides.localeDisplayNames || { "en-US": "English" },
    availableLocales: overrides.availableLocales || ["en-US"]
  };
}

// src/background/native-host-bridge.js
var PING_TIMEOUT_MS = 1e4;
var STATUS_QUERY_TIMEOUT_MS = 1e4;
var PERMISSION_DENIED_FOLLOWUP = "IMPORTANT: The user has explicitly declined this action. Do not attempt to use other tools or workarounds. Instead, acknowledge the denial and ask the user how they would prefer to proceed.";
function createNativeHostBridge(deps) {
  let nativePort = null;
  let connectInFlight = false;
  let nativeHostInstalled = false;
  let mcpConnected = false;
  let pendingStatusResolver = null;
  let pendingStatusTimeout = null;
  function markHostMissingIfNotFound(errorMessage) {
    if (errorMessage?.includes("native messaging host not found")) {
      nativeHostInstalled = false;
    }
  }
  async function tryConnectNativeHost() {
    try {
      return await (async function connectOnce() {
        if (nativePort) return true;
        if (connectInFlight) return false;
        connectInFlight = true;
        try {
          if (!await chrome.permissions.contains({
            permissions: ["nativeMessaging"]
          })) {
            return false;
          }
          if (typeof chrome.runtime.connectNative !== "function") {
            return false;
          }
          for (const candidate of NATIVE_HOST_CANDIDATES) {
            try {
              const port = chrome.runtime.connectNative(candidate.name);
              const pingSucceeded = await new Promise((resolve) => {
                let settled = false;
                const onDisconnect = () => {
                  if (!settled) {
                    settled = true;
                    chrome.runtime.lastError;
                    resolve(false);
                  }
                };
                const onMessage = (message) => {
                  if (settled) return;
                  if (message.type === "pong") {
                    settled = true;
                    port.onDisconnect.removeListener(onDisconnect);
                    port.onMessage.removeListener(onMessage);
                    resolve(true);
                  }
                };
                port.onDisconnect.addListener(onDisconnect);
                port.onMessage.addListener(onMessage);
                try {
                  port.postMessage({ type: "ping" });
                } catch {
                  if (!settled) {
                    settled = true;
                    resolve(false);
                  }
                  return;
                }
                setTimeout(() => {
                  if (!settled) {
                    settled = true;
                    port.onDisconnect.removeListener(onDisconnect);
                    port.onMessage.removeListener(onMessage);
                    resolve(false);
                  }
                }, PING_TIMEOUT_MS);
              });
              if (pingSucceeded) {
                nativePort = port;
                void candidate.name;
                nativeHostInstalled = true;
                nativePort.onMessage.addListener(async (message) => {
                  await handleNativeHostMessage(message);
                });
                nativePort.onDisconnect.addListener(() => {
                  const errorMessage = chrome.runtime.lastError?.message;
                  nativePort = null;
                  mcpConnected = false;
                  deps.setStorageValue(deps.storageKeys.MCP_CONNECTED, false);
                  markHostMissingIfNotFound(errorMessage);
                  deps.clearAllLoadingIndicators();
                });
                nativePort.postMessage({ type: "get_status" });
                return true;
              }
              port.disconnect();
            } catch {
            }
          }
          return false;
        } catch (error) {
          if (error instanceof Error) markHostMissingIfNotFound(error.message);
          return false;
        } finally {
          connectInFlight = false;
        }
      })();
    } catch {
      return false;
    }
  }
  async function disconnectNativeHostAndRevokePermission() {
    try {
      await chrome.permissions.remove({ permissions: ["nativeMessaging"] });
      nativePort?.disconnect();
      nativePort = null;
      connectInFlight = false;
      nativeHostInstalled = false;
      mcpConnected = false;
      return true;
    } catch {
      return false;
    }
  }
  async function handleToolRequestFromHost(message) {
    try {
      const { method, params } = message;
      if (method !== "execute_tool") {
        postToolResponseToHost({ content: `Unknown method: ${method}` });
        return;
      }
      if (!params?.tool) {
        postToolResponseToHost(deps.makeToolErrorResult("No tool specified"));
        return;
      }
      const clientId = params.client_id;
      const rawTabGroupId = params.args?.tabGroupId;
      const tabGroupId = typeof rawTabGroupId === "number" ? rawTabGroupId : typeof rawTabGroupId === "string" && parseInt(rawTabGroupId, 10) || void 0;
      const rawTabId = params.args?.tabId ?? (params.tool === "browser_batch" && Array.isArray(params.args?.actions) ? params.args.actions.find(
        (action) => typeof action?.input?.tabId === "number"
      )?.input?.tabId : void 0);
      const tabId = typeof rawTabId === "number" ? rawTabId : typeof rawTabId === "string" && parseInt(rawTabId, 10) || void 0;
      const sessionScope = params.session_scope;
      postToolResponseToHost(
        await deps.executeTool({
          toolName: params.tool,
          args: params.args || {},
          tabId,
          tabGroupId,
          clientId,
          source: "native-messaging",
          sessionScope
        }),
        clientId
      );
    } catch (error) {
      postToolResponseToHost(
        deps.makeToolErrorResult(
          `Tool execution failed: ${error instanceof Error ? error.message : "Unknown error"}`
        )
      );
    }
  }
  async function handleNativeHostMessage(message) {
    switch (message.type) {
      case "tool_request":
        await handleToolRequestFromHost(message);
        break;
      case "status_response":
        if (pendingStatusResolver) {
          clearTimeout(pendingStatusTimeout);
          pendingStatusTimeout = null;
          pendingStatusResolver({
            nativeHostInstalled,
            mcpConnected
          });
          pendingStatusResolver = null;
        }
        break;
      case "mcp_connected":
        void (async () => {
          mcpConnected = true;
          deps.setStorageValue(deps.storageKeys.MCP_CONNECTED, true);
          await deps.tabGroupManager.initialize();
          deps.tabGroupManager.startTabGroupChangeListener();
        })();
        break;
      case "mcp_disconnected":
        mcpConnected = false;
        deps.setStorageValue(deps.storageKeys.MCP_CONNECTED, false);
        deps.tabGroupManager.stopTabGroupChangeListener();
        deps.debuggerRelay.detachAll("native-messaging");
        break;
    }
  }
  function postToolResponseToHost(result, _clientId) {
    if (!nativePort) return;
    const { content, is_error: isError } = result;
    if (!content || typeof content !== "string" && !Array.isArray(content))
      return;
    let outbound;
    if (isError) {
      let augmented;
      if (typeof content === "string") {
        augmented = content.includes("Permission denied by user") ? `${content} - ${PERMISSION_DENIED_FOLLOWUP}` : content;
      } else {
        augmented = content.map(
          (item) => typeof item === "object" && item !== null && "text" in item && typeof item.text === "string" && item.text.includes("Permission denied by user") ? { ...item, text: `${content} - ${PERMISSION_DENIED_FOLLOWUP}` } : item
        );
      }
      outbound = { type: "tool_response", error: { content: augmented } };
    } else {
      outbound = { type: "tool_response", result: { content } };
    }
    nativePort.postMessage(outbound);
  }
  async function queryNativeHostStatus() {
    if (nativePort && nativeHostInstalled) {
      if (pendingStatusTimeout) clearTimeout(pendingStatusTimeout);
      return new Promise((resolve) => {
        pendingStatusResolver = resolve;
        nativePort.postMessage({ type: "get_status" });
        pendingStatusTimeout = setTimeout(() => {
          pendingStatusResolver = null;
          resolve({ nativeHostInstalled, mcpConnected });
        }, STATUS_QUERY_TIMEOUT_MS);
      });
    }
    return { nativeHostInstalled, mcpConnected };
  }
  function sendNativeMcpNotification(method, params) {
    if (!nativePort) return false;
    nativePort.postMessage({
      type: "notification",
      jsonrpc: "2.0",
      method,
      params: params || {}
    });
    return true;
  }
  function getSnapshot() {
    return {
      hasPort: Boolean(nativePort),
      nativeHostInstalled,
      mcpConnected
    };
  }
  return {
    tryConnectNativeHost,
    disconnectNativeHostAndRevokePermission,
    handleNativeHostMessage,
    postToolResponseToHost,
    queryNativeHostStatus,
    sendNativeMcpNotification,
    getSnapshot,
    /** @deprecated test/debug accessor matching original `Z` */
    get nativeHostInstalled() {
      return nativeHostInstalled;
    },
    /** @deprecated test/debug accessor matching original `ee` */
    get mcpConnected() {
      return mcpConnected;
    }
  };
}

// src/background/cic-iframe-transport.js
var SIDEPANEL_IFRAME_ALLOWED_TOOLS = /* @__PURE__ */ new Set([
  "javascript_tool",
  "read_page",
  "find",
  "form_input",
  "computer",
  "browser_batch",
  "navigate",
  "resize_window",
  "gif_creator",
  "upload_image",
  "get_page_text",
  "tabs_context_mcp",
  "tabs_create_mcp",
  "tabs_close_mcp",
  "read_console_messages",
  "read_network_requests"
]);
var SIDEPANEL_IFRAME_STRIPPED_ARG_KEYS = /* @__PURE__ */ new Set([
  "checkUrls",
  "includePermissionState"
]);
function isOptionalStringArray(value) {
  return value === void 0 || Array.isArray(value) && value.every((item) => typeof item === "string");
}
function isExtensionPageSender(sender) {
  return sender.tab === void 0 && sender.id === chrome.runtime.id;
}
function isValidPermissionOverrides(overrides) {
  if (overrides === void 0) return true;
  if (typeof overrides !== "object" || overrides === null || Array.isArray(overrides)) {
    return false;
  }
  return isOptionalStringArray(overrides.allowedDomains) && isOptionalStringArray(overrides.onceApprovedHosts) && isOptionalStringArray(overrides.deniedDomains);
}
function sanitizeSidepanelIframeToolArgs(toolName, args) {
  const sanitized = {};
  for (const [key, value] of Object.entries(args)) {
    if (!SIDEPANEL_IFRAME_STRIPPED_ARG_KEYS.has(key)) {
      sanitized[key] = value;
    }
  }
  if (toolName === "browser_batch" && Array.isArray(sanitized.actions)) {
    const actions = [];
    for (const action of sanitized.actions) {
      if (typeof action !== "object" || action === null) {
        actions.push(action);
        continue;
      }
      const { name, input } = action;
      if (typeof name !== "string" || name === "browser_batch" || !SIDEPANEL_IFRAME_ALLOWED_TOOLS.has(name)) {
        return null;
      }
      const cleanedInput = {};
      if (typeof input === "object" && input !== null) {
        for (const [key, value] of Object.entries(input)) {
          if (!SIDEPANEL_IFRAME_STRIPPED_ARG_KEYS.has(key)) {
            cleanedInput[key] = value;
          }
        }
      }
      actions.push({ ...action, name, input: cleanedInput });
    }
    sanitized.actions = actions;
  }
  return sanitized;
}
function createCicIframeTransport(deps) {
  async function handleBridgeInit(message) {
    if (!Number.isInteger(message.panelTabId) || typeof message.sessionId !== "string") {
      return { ok: false, error: "malformed CIC_IFRAME_BRIDGE_INIT" };
    }
    try {
      const { chromeGroupId } = await deps.tabGroupManager.createIsolatedGroup(
        message.panelTabId
      );
      deps.bindSessionToTabGroup(
        { sessionId: message.sessionId },
        chromeGroupId
      );
      return { ok: true, tabGroupId: chromeGroupId };
    } catch {
      return { ok: false, error: "anchor tab-group initialization failed" };
    }
  }
  async function handleToolCall(message) {
    if (typeof message.toolName !== "string" || typeof message.sessionId !== "string" || typeof message.toolUseId !== "string" || message.panelTabId !== void 0 && !Number.isInteger(message.panelTabId) || message.tabGroupId !== void 0 && !Number.isInteger(message.tabGroupId) || message.displayName !== void 0 && typeof message.displayName !== "string" || typeof message.args !== "object" || message.args === null || Array.isArray(message.args) || !isValidPermissionOverrides(message.permissionOverrides)) {
      return { ok: false, error: "malformed CIC_IFRAME_TOOL_CALL" };
    }
    if (!SIDEPANEL_IFRAME_ALLOWED_TOOLS.has(message.toolName)) {
      return {
        ok: true,
        result: deps.makeToolErrorResult(
          `Tool "${message.toolName}" is not available on the sidepanel iframe transport.`
        )
      };
    }
    const sanitizedArgs = sanitizeSidepanelIframeToolArgs(
      message.toolName,
      message.args
    );
    if (sanitizedArgs === null) {
      return {
        ok: true,
        result: deps.makeToolErrorResult(
          "A browser_batch sub-action names a tool not available on the sidepanel iframe transport."
        )
      };
    }
    if (message.panelTabId === void 0) {
      return {
        ok: true,
        result: deps.makeToolErrorResult(
          "No tab available. Please open a new tab or window in Chrome."
        )
      };
    }
    if (message.tabGroupId === void 0) {
      return {
        ok: false,
        error: "anchor tab group not established (tabGroupId missing)"
      };
    }
    try {
      const result = await deps.executeTool({
        toolName: message.toolName,
        args: sanitizedArgs,
        tabId: message.panelTabId,
        tabGroupId: message.tabGroupId,
        sessionScope: {
          sessionId: message.sessionId,
          tabGroupId: message.tabGroupId,
          displayName: message.displayName
        },
        clientId: "redrob-code",
        source: "sidepanel-iframe",
        toolUseId: message.toolUseId,
        allowedDomains: message.permissionOverrides?.allowedDomains ? [...message.permissionOverrides.allowedDomains] : void 0,
        onceApprovedHosts: message.permissionOverrides?.onceApprovedHosts ? [...message.permissionOverrides.onceApprovedHosts] : void 0,
        deniedDomains: message.permissionOverrides?.deniedDomains ? [...message.permissionOverrides.deniedDomains] : void 0
      });
      if (result?.is_error) {
        return {
          ok: true,
          result: deps.makeToolErrorResult(
            `Tool "${message.toolName}" failed in the extension.`
          )
        };
      }
      return {
        ok: true,
        result: result ?? deps.makeToolErrorResult("no result")
      };
    } catch {
      return {
        ok: true,
        result: deps.makeToolErrorResult(
          `Tool "${message.toolName}" failed in the extension.`
        )
      };
    }
  }
  async function handleCicIframeMessage(message, sender) {
    if (!isExtensionPageSender(sender)) {
      return { ok: false, error: "sender is not an extension page" };
    }
    if (!await deps.isFeatureEnabled("chrome_ext_cowork_iframe")) {
      return {
        ok: false,
        error: "cowork iframe transport is disabled (chrome_ext_cowork_iframe)"
      };
    }
    if (message.type === "CIC_IFRAME_BRIDGE_INIT") {
      return handleBridgeInit(message);
    }
    if (message.type === "CIC_IFRAME_TOOL_CALL") {
      return handleToolCall(message);
    }
    return { ok: false, error: "unknown type" };
  }
  return {
    handleCicIframeMessage,
    isExtensionPageSender
  };
}

// src/background/side-panel-and-tabs.js
function createSidePanelAndTabOrchestration(deps, nativeHost) {
  let unsupportedBrowserNotificationShown = false;
  const mainTabAckCache = /* @__PURE__ */ new Map();
  async function removeTabQuietly(tabId) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
    }
  }
  async function ensureManagedTabGroupForSidePanel(tabId) {
    await deps.tabGroupManager.initialize(true);
    const group = await deps.tabGroupManager.findGroupByTab(tabId);
    if (group) {
      if (group.isUnmanaged) {
        try {
          await deps.tabGroupManager.adoptOrphanedGroup(
            tabId,
            group.chromeGroupId
          );
        } catch {
        }
      }
      return;
    }
    try {
      await deps.tabGroupManager.createGroup(tabId);
    } catch {
    }
    nativeHost.tryConnectNativeHost();
  }
  async function enableSidePanelEverywhere() {
    try {
      await chrome.sidePanel.setOptions({
        path: "sidepanel.html",
        enabled: true
      });
      await chrome.sidePanel.setPanelBehavior?.({
        openPanelOnActionClick: true
      });
    } catch {
    }
  }
  async function openSidePanelForTab(tabId) {
    if (!chrome.sidePanel) {
      deps.trackAnalytics("claude_chrome.sidepanel.unsupported_browser", {
        user_agent: navigator.userAgent
      });
      if (!unsupportedBrowserNotificationShown) {
        unsupportedBrowserNotificationShown = true;
        chrome.notifications.create({
          type: "basic",
          iconUrl: "/icon-128.png",
          title: "Browser not supported",
          message: "Redrob requires the Chrome Side Panel API, which isn't available in this browser. Use Google Chrome, Microsoft Edge, or Brave."
        });
      }
      return;
    }
    await enableSidePanelEverywhere();
    chrome.sidePanel.open({ tabId });
    await ensureManagedTabGroupForSidePanel(tabId);
  }
  async function toggleSidePanelForTab(tab) {
    const tabId = tab.id;
    if (!tabId) return;
    if (!chrome.sidePanel) {
      return openSidePanelForTab(tabId);
    }
    const contexts = await chrome.runtime.getContexts({
      contextTypes: [chrome.runtime.ContextType.SIDE_PANEL]
    });
    if (contexts.length > 0) {
      chrome.runtime.sendMessage({ type: "close_side_panel", tabId }).catch(console.error);
      return;
    }
    await enableSidePanelEverywhere();
    await chrome.sidePanel.open({ tabId }).catch(() => {
    });
    await ensureManagedTabGroupForSidePanel(tabId);
  }
  async function handlePermissionsDeepLink(sourceTabId) {
    try {
      const optionsUrl = chrome.runtime.getURL("options.html#permissions");
      await chrome.tabs.create({ url: optionsUrl });
    } catch {
    } finally {
      await removeTabQuietly(sourceTabId);
    }
  }
  async function handleReconnectDeepLink(sourceTabId) {
    try {
      await nativeHost.disconnectNativeHostAndRevokePermission();
      deps.closeBridgeWebSocket();
      await deps.sleep(500);
      const [nativeHostSuccess, bridgeInitiated] = await Promise.all([
        nativeHost.tryConnectNativeHost(),
        deps.connectBridgeWebSocket()
      ]);
      deps.trackAnalytics("claude_chrome.extension_url.reconnect", {
        native_host_success: nativeHostSuccess,
        bridge_initiated: bridgeInitiated
      });
    } catch {
      deps.trackAnalytics("claude_chrome.extension_url.reconnect", {
        success: false
      });
    } finally {
      await removeTabQuietly(sourceTabId);
    }
  }
  async function handleTabSwitchDeepLink(targetTabId, sourceTabId) {
    if (isNaN(targetTabId)) {
      deps.trackAnalytics("claude_chrome.extension_url.tab_switch", {
        success: false,
        error: "invalid_tab_id"
      });
      await removeTabQuietly(sourceTabId);
      return true;
    }
    try {
      await deps.tabGroupManager.initialize();
      const group = await deps.tabGroupManager.findGroupByTab(targetTabId);
      if (!group || group.isUnmanaged) {
        deps.trackAnalytics("claude_chrome.extension_url.tab_switch", {
          success: false,
          error: "tab_not_managed"
        });
        await removeTabQuietly(sourceTabId);
        return true;
      }
      const tab = await chrome.tabs.get(targetTabId);
      if (tab.windowId !== void 0) {
        await chrome.windows.update(tab.windowId, { focused: true });
      }
      await chrome.tabs.update(targetTabId, { active: true });
      deps.trackAnalytics("claude_chrome.extension_url.tab_switch", {
        success: true
      });
      await removeTabQuietly(sourceTabId);
      return true;
    } catch {
      deps.trackAnalytics("claude_chrome.extension_url.tab_switch", {
        success: false
      });
      await removeTabQuietly(sourceTabId);
      return true;
    }
  }
  async function handleRedrobDeDeepLink(url, sourceTabId) {
    try {
      const parsed = new URL(url);
      if (!REDROB_DEEP_LINK_HOSTS.includes(parsed.host)) return false;
      if (parsed.pathname.toLowerCase() === "/chrome/permissions") {
        await handlePermissionsDeepLink(sourceTabId);
        return true;
      }
      if (!parsed.pathname.startsWith("/chrome/")) return false;
      const pathAfterChrome = parsed.pathname.substring(8).toLowerCase();
      if (pathAfterChrome === "reconnect") {
        await handleReconnectDeepLink(sourceTabId);
        return true;
      }
      if (pathAfterChrome.startsWith("tab/")) {
        await handleTabSwitchDeepLink(
          parseInt(pathAfterChrome.substring(4), 10),
          sourceTabId
        );
        return true;
      }
      return false;
    } catch {
      deps.trackAnalytics("claude_chrome.extension_url.unknown_exception", {});
      return false;
    }
  }
  async function handleStaticIndicatorHeartbeat(sender, sendResponse) {
    const senderTabId = sender.tab?.id;
    if (!senderTabId) {
      sendResponse({ success: false });
      return;
    }
    try {
      const groupId = (await chrome.tabs.get(senderTabId)).groupId;
      if (groupId === void 0 || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        sendResponse({ success: false });
        return;
      }
      if (await deps.tabGroupManager.findGroupByTab(senderTabId)) {
        sendResponse({ success: true });
        return;
      }
      const tabsInGroup = await chrome.tabs.query({ groupId });
      const probeAt = async (index) => {
        if (index >= tabsInGroup.length) {
          sendResponse({ success: false });
          return;
        }
        const candidate = tabsInGroup[index];
        if (candidate.id === senderTabId || !candidate.id) {
          await probeAt(index + 1);
          return;
        }
        const candidateTabId = candidate.id;
        const now = Date.now();
        const cached = mainTabAckCache.get(candidateTabId);
        if (cached && now - cached.timestamp < 3e3) {
          if (cached.isAlive) {
            sendResponse({ success: true });
            return;
          }
          await probeAt(index + 1);
          return;
        }
        chrome.runtime.sendMessage(
          {
            type: "MAIN_TAB_ACK_REQUEST",
            secondaryTabId: senderTabId,
            mainTabId: candidateTabId,
            timestamp: now
          },
          async (response) => {
            const isAlive = response?.success ?? false;
            mainTabAckCache.set(candidateTabId, { timestamp: now, isAlive });
            if (isAlive) sendResponse({ success: true });
            else await probeAt(index + 1);
          }
        );
      };
      await probeAt(0);
    } catch {
      sendResponse({ success: false });
    }
  }
  async function handleDismissStaticIndicatorForGroup(sender, sendResponse) {
    const senderTabId = sender.tab?.id;
    if (!senderTabId) {
      sendResponse({ success: false });
      return;
    }
    try {
      const groupId = (await chrome.tabs.get(senderTabId)).groupId;
      if (groupId === void 0 || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) {
        sendResponse({ success: false });
        return;
      }
      await deps.tabGroupManager.initialize();
      await deps.tabGroupManager.dismissStaticIndicatorsForGroup(groupId);
      sendResponse({ success: true });
    } catch {
      sendResponse({ success: false });
    }
  }
  return {
    enableSidePanelEverywhere,
    openSidePanelForTab,
    toggleSidePanelForTab,
    ensureManagedTabGroupForSidePanel,
    handleRedrobDeDeepLink,
    removeTabQuietly,
    handleStaticIndicatorHeartbeat,
    handleDismissStaticIndicatorForGroup,
    mainTabAckCache
  };
}

// src/background/scheduling-and-notifications.js
function createSchedulingAndNotifications(deps) {
  async function openScheduledTaskSidepanelWindow({
    sessionId,
    skipPermissions,
    model
  }) {
    const url = chrome.runtime.getURL(
      `sidepanel.html?mode=window&sessionId=${sessionId}${skipPermissions ? "&skipPermissions=true" : ""}${model ? `&model=${encodeURIComponent(model)}` : ""}`
    );
    const win = await chrome.windows.create({
      url,
      type: "popup",
      width: 500,
      height: 768,
      left: 100,
      top: 100,
      focused: true
    });
    if (!win) throw new Error("Failed to create sidepanel window");
    return win;
  }
  function waitForTabThenExecuteTask({
    tabId,
    prompt,
    taskName,
    runLogId,
    sessionId,
    isScheduledTask
  }) {
    return new Promise((resolve, reject) => {
      const timeoutMs = 3e4;
      const startedAt = Date.now();
      let sent = false;
      const poll = async () => {
        try {
          if (Date.now() - startedAt > timeoutMs) {
            reject(
              new Error("Timeout waiting for tab to load for task execution")
            );
            return;
          }
          const tab = await chrome.tabs.get(tabId);
          if (tab.status === "complete") {
            setTimeout(() => {
              if (sent) return;
              sent = true;
              chrome.runtime.sendMessage(
                {
                  type: "EXECUTE_TASK",
                  prompt,
                  taskName,
                  runLogId,
                  windowSessionId: sessionId,
                  isScheduledTask
                },
                (response) => {
                  const errorMessage = chrome.runtime.lastError?.message;
                  if (errorMessage || !response?.success) {
                    reject(
                      new Error(
                        `Failed to send prompt: ${errorMessage ?? "side panel not ready"}`
                      )
                    );
                  } else {
                    resolve();
                  }
                }
              );
            }, 3e3);
          } else {
            setTimeout(poll, 500);
          }
        } catch (error) {
          reject(error);
        }
      };
      setTimeout(poll, 1e3);
    });
  }
  async function executeScheduledTask(task, runLogId) {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const win = await chrome.windows.create({
      url: task.url || "about:blank",
      type: "normal",
      focused: true
    });
    if (!win || !win.id || !win.tabs || win.tabs.length === 0) {
      throw new Error("Failed to create window for scheduled task");
    }
    const firstTab = win.tabs[0];
    if (!firstTab.id) {
      throw new Error("Failed to get tab in new window for scheduled task");
    }
    await deps.tabGroupManager.initialize(true);
    await deps.tabGroupManager.createGroup(firstTab.id);
    await deps.setStorageValue(deps.storageKeys.TARGET_TAB_ID, firstTab.id);
    await openScheduledTaskSidepanelWindow({
      sessionId,
      skipPermissions: task.skipPermissions,
      model: task.model
    });
    await waitForTabThenExecuteTask({
      tabId: firstTab.id,
      prompt: task.prompt,
      taskName: task.name,
      runLogId,
      sessionId,
      isScheduledTask: true
    });
  }
  async function rehydrateScheduledPromptAlarms() {
    try {
      const repeating = (await deps.savedPromptsService.getAllPrompts()).filter(
        (prompt) => prompt.repeatType && prompt.repeatType !== "none"
      );
      if (repeating.length === 0) return;
      let updated = 0;
      let failed = 0;
      for (const prompt of repeating) {
        try {
          await deps.savedPromptsService.updateAlarmForPrompt(prompt);
          updated++;
        } catch {
          failed++;
        }
      }
      void updated;
      void failed;
      try {
        await deps.savedPromptsService.updateNextRunTimes();
      } catch {
      }
    } catch {
    }
  }
  async function handleGenericNotificationClick(notificationId) {
    chrome.notifications.clear(notificationId);
    const parts = notificationId.split("_");
    let tabId = null;
    if (parts.length >= 2 && parts[1] !== "unknown") {
      tabId = parseInt(parts[1], 10);
    }
    if (tabId && !isNaN(tabId)) {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.windowId) {
          await chrome.windows.update(tab.windowId, { focused: true });
          await chrome.tabs.update(tabId, { active: true });
          return;
        }
      } catch {
      }
    }
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (activeTab?.id && activeTab.windowId) {
      await chrome.windows.update(activeTab.windowId, { focused: true });
    }
  }
  async function handleNotificationClicked(notificationId) {
    if (notificationId.startsWith("conway-")) {
      deps.handleConwayNotificationClick(notificationId);
      return;
    }
    await handleGenericNotificationClick(notificationId);
  }
  function handleNotificationClosed(notificationId) {
    if (notificationId.startsWith("conway-")) {
      deps.handleConwayNotificationClosed(notificationId);
    }
  }
  async function handleAlarm(alarm) {
    if (alarm.name.startsWith("prompt_")) {
      try {
        const promptId = alarm.name;
        const saved = ((await chrome.storage.local.get(["savedPrompts"])).savedPrompts || []).find((item) => item.id === promptId);
        if (!saved) return;
        const runLogId = `${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        let executionError = null;
        try {
          await executeScheduledTask(
            {
              id: saved.id,
              name: saved.command || "Scheduled Task",
              prompt: saved.prompt,
              url: saved.url,
              enabled: true,
              skipPermissions: saved.skipPermissions !== false,
              model: saved.model
            },
            runLogId
          );
        } catch (error) {
          executionError = error instanceof Error ? error : new Error(String(error));
          try {
            await notifyIfEnabled({
              type: "basic",
              iconUrl: "/icon-128.png",
              title: "Scheduled Task Failed",
              message: `Task "${saved.command || "Scheduled Task"}" failed to execute. ${executionError.message}`,
              priority: 2
            });
          } catch {
          }
        }
        void executionError;
        if (saved.repeatType === "monthly" || saved.repeatType === "annually") {
          try {
            await deps.savedPromptsService.updateAlarmForPrompt(saved);
          } catch {
            const retryName = `retry_${promptId}`;
            try {
              await chrome.alarms.create(retryName, { delayInMinutes: 1 });
            } catch {
            }
            try {
              await notifyIfEnabled({
                type: "basic",
                iconUrl: "/icon-128.png",
                title: "Scheduled Task Setup Failed",
                message: `Failed to schedule next occurrence of "${saved.command || "Scheduled Task"}". Please check the task settings.`,
                priority: 2
              });
            } catch {
            }
          }
        }
      } catch {
      }
      return;
    }
    if (alarm.name.startsWith("retry_")) {
      try {
        const promptId = alarm.name.replace("retry_", "");
        const saved = ((await chrome.storage.local.get(["savedPrompts"])).savedPrompts || []).find((item) => item.id === promptId);
        if (saved && (saved.repeatType === "monthly" || saved.repeatType === "annually")) {
          try {
            await deps.savedPromptsService.updateAlarmForPrompt(saved);
          } catch {
            try {
              await notifyIfEnabled({
                type: "basic",
                iconUrl: "/icon-128.png",
                title: "Scheduled Task Needs Attention",
                message: `Could not automatically reschedule "${saved.command || "Scheduled Task"}". Please edit the task to reschedule it.`,
                priority: 2
              });
            } catch {
            }
          }
        }
      } catch {
      }
    }
  }
  return {
    executeScheduledTask,
    rehydrateScheduledPromptAlarms,
    handleNotificationClicked,
    handleNotificationClosed,
    handleAlarm,
    openScheduledTaskSidepanelWindow,
    waitForTabThenExecuteTask
  };
}
async function notifyIfEnabled(options) {
  try {
    const stored = await chrome.storage.local.get("notificationsEnabled");
    if (stored?.notificationsEnabled === false) return;
  } catch {
  }
  return chrome.notifications.create(options);
}

// src/background/agent-indicators.js
function tell(tabId, message) {
  const send = globalThis.chrome?.tabs?.sendMessage;
  if (!Number.isInteger(tabId) || typeof send !== "function") {
    return Promise.resolve();
  }
  try {
    return Promise.resolve(send.call(chrome.tabs, tabId, message)).catch(
      () => {
      }
    );
  } catch {
    return Promise.resolve();
  }
}
var run = { active: false, unattended: false, tabs: /* @__PURE__ */ new Set() };
async function showAgentIndicators(tabId) {
  if (!Number.isInteger(tabId)) return;
  run.tabs.add(tabId);
  await tell(tabId, { type: "SHOW_AGENT_INDICATORS" });
  await tell(tabId, {
    type: "SET_UNATTENDED_MODE",
    unattended: run.unattended
  });
}
async function hideAgentIndicators(tabId) {
  await tell(tabId, { type: "HIDE_AGENT_INDICATORS" });
  run.tabs.delete(tabId);
}
async function setRunIndicators(active, unattended, tabId) {
  run.active = active === true;
  run.unattended = unattended === true;
  if (!run.active) {
    await Promise.all([...run.tabs].map((id) => hideAgentIndicators(id)));
    run.tabs.clear();
    return;
  }
  await showAgentIndicators(tabId);
  await Promise.all(
    [...run.tabs].map(
      (id) => tell(id, { type: "SET_UNATTENDED_MODE", unattended: run.unattended })
    )
  );
}
function trackAgentTab(tabId) {
  if (!run.active || run.tabs.has(tabId)) return Promise.resolve();
  return showAgentIndicators(tabId);
}
function movePhantomCursor(tabId, [x, y] = []) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return Promise.resolve();
  return tell(tabId, { type: "UPDATE_PHANTOM_CURSOR", x, y });
}
async function withIndicatorsHidden(tabId, run2) {
  await tell(tabId, { type: "HIDE_FOR_TOOL_USE" });
  try {
    return await run2();
  } finally {
    await tell(tabId, { type: "SHOW_AFTER_TOOL_USE" });
  }
}

// src/network/device-connect.js
var REDROB_DEVICE_PRODUCT = "browser";
var REDROB_DEVICE_API_BASE_URL = `${REDROB_API_BASE_URL}/v1`;
var FALLBACK_TTL_MS = 10 * 6e4;
var FALLBACK_INTERVAL_MS = 5e3;
var MAX_PENDING = 8;
function text(value) {
  return typeof value === "string" ? value.trim() : "";
}
function positiveNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}
async function readJson(response) {
  try {
    const body = await response.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}
function randomId() {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi?.randomUUID) return cryptoApi.randomUUID();
  return `dc_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}
function createDeviceConnections(options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const baseUrl = (options.baseUrl ?? REDROB_DEVICE_API_BASE_URL).replace(
    /\/+$/,
    ""
  );
  const now = options.now ?? (() => Date.now());
  const newId = options.newId ?? randomId;
  const pending = /* @__PURE__ */ new Map();
  function prune() {
    const at = now();
    for (const [id, record] of pending) {
      if (record.expiresAt <= at) pending.delete(id);
    }
  }
  async function start(product = REDROB_DEVICE_PRODUCT) {
    prune();
    if (pending.size >= MAX_PENDING) {
      throw new DeviceConnectError(
        "device_connect_busy",
        "Too many connection attempts are already waiting."
      );
    }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/device/authorize`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ product })
      });
    } catch {
      throw new DeviceConnectError(
        "console_unreachable",
        "Could not reach the Console to start the connection."
      );
    }
    if (!response.ok) {
      throw new DeviceConnectError(
        "device_start_rejected",
        "The Console would not start the connection."
      );
    }
    const body = await readJson(response);
    const deviceCode = text(body.deviceCode);
    const userCode = text(body.userCode);
    const verificationUri = text(body.verificationUri);
    const verificationUriComplete = text(body.verificationUriComplete) || verificationUri;
    if (!deviceCode || !userCode || !verificationUri) {
      throw new DeviceConnectError(
        "device_start_incomplete",
        "The Console did not return a usable connection code."
      );
    }
    const expiresInSeconds = positiveNumber(body.expiresIn);
    const intervalSeconds = positiveNumber(body.interval);
    const record = {
      deviceCode,
      userCode,
      verificationUri,
      verificationUriComplete,
      expiresAt: now() + (expiresInSeconds ? expiresInSeconds * 1e3 : FALLBACK_TTL_MS),
      intervalMs: intervalSeconds ? intervalSeconds * 1e3 : FALLBACK_INTERVAL_MS
    };
    const id = newId();
    pending.set(id, record);
    return {
      id,
      userCode: record.userCode,
      verificationUri: record.verificationUri,
      verificationUriComplete: record.verificationUriComplete,
      expiresAt: record.expiresAt,
      intervalMs: record.intervalMs
    };
  }
  async function poll(id) {
    const record = pending.get(id);
    if (!record) return { status: "expired" };
    if (record.expiresAt <= now()) {
      pending.delete(id);
      return { status: "expired" };
    }
    let response;
    try {
      response = await fetchImpl(`${baseUrl}/device/token`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceCode: record.deviceCode })
      });
    } catch {
      return { status: "unreachable" };
    }
    const body = await readJson(response);
    if (response.ok) {
      const key = text(body.apiKey);
      if (!key) {
        pending.delete(id);
        return { status: "failed", code: "missing_key" };
      }
      pending.delete(id);
      return { status: "connected", key };
    }
    const code = text(body.error);
    if (code === "authorization_pending") return { status: "pending" };
    if (code === "slow_down") return { status: "slow_down" };
    if (code === "access_denied") {
      pending.delete(id);
      return { status: "denied" };
    }
    if (code === "expired_token") {
      pending.delete(id);
      return { status: "expired" };
    }
    pending.delete(id);
    return { status: "failed", code: code || `http_${response.status}` };
  }
  function cancel(id) {
    return pending.delete(id);
  }
  return { start, poll, cancel, pendingCount: () => pending.size };
}
var DeviceConnectError = class extends Error {
  /**
   * @param {string} code
   * @param {string} message
   */
  constructor(code, message) {
    super(message);
    this.name = "DeviceConnectError";
    this.code = code;
  }
};

// src/storage/api-key.js
function localStorageArea(storage) {
  return storage || globalThis.chrome?.storage?.local;
}
async function persistApiKey(apiKey, storage) {
  const area = localStorageArea(storage);
  await area.set({ [STORAGE_KEYS.apiKey]: apiKey });
  await area.remove(LEGACY_API_KEY_STORAGE_KEY);
}

// src/background/device-connect-orchestrator.js
var DEVICE_CONNECT_START = "DEVICE_CONNECT_START";
var DEVICE_CONNECT_CANCEL = "DEVICE_CONNECT_CANCEL";
var DEVICE_CONNECT_UPDATE = "DEVICE_CONNECT_UPDATE";
var SLOW_DOWN_STEP_MS = 5e3;
var MAX_INTERVAL_MS = 6e4;
async function runDeviceConnectPolling(deps) {
  const { connections, id, emit, persist, sleep } = deps;
  const cancelled = deps.cancelled ?? (() => false);
  let intervalMs = deps.intervalMs;
  for (; ; ) {
    if (cancelled()) {
      connections.cancel(id);
      const phase2 = { state: "cancelled" };
      emit(phase2);
      return phase2;
    }
    await sleep(intervalMs);
    if (cancelled()) {
      connections.cancel(id);
      const phase2 = { state: "cancelled" };
      emit(phase2);
      return phase2;
    }
    const result = await connections.poll(id);
    if (result.status === "pending") {
      emit({ state: "waiting" });
      continue;
    }
    if (result.status === "slow_down") {
      intervalMs = Math.min(intervalMs + SLOW_DOWN_STEP_MS, MAX_INTERVAL_MS);
      emit({ state: "waiting" });
      continue;
    }
    if (result.status === "unreachable") {
      emit({ state: "unreachable" });
      continue;
    }
    if (result.status === "connected") {
      await persist(result.key);
      const phase2 = { state: "connected" };
      emit(phase2);
      return phase2;
    }
    if (result.status === "denied") {
      const phase2 = { state: "denied" };
      emit(phase2);
      return phase2;
    }
    if (result.status === "expired") {
      const phase2 = { state: "expired" };
      emit(phase2);
      return phase2;
    }
    const phase = { state: "failed", code: result.code };
    emit(phase);
    return phase;
  }
}
function createDeviceConnectOrchestrator(options = {}) {
  const connections = options.connections ?? createDeviceConnections();
  const persist = options.persist ?? ((apiKey) => persistApiKey(apiKey));
  const sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const chromeApi = options.chromeApi ?? globalThis.chrome;
  const openUrl = options.openUrl ?? (async (url) => {
    await chromeApi?.tabs?.create?.({ url });
  });
  const active = /* @__PURE__ */ new Map();
  function broadcast(id, phase) {
    chromeApi?.runtime?.sendMessage?.({ type: DEVICE_CONNECT_UPDATE, id, phase })?.catch?.(() => {
    });
  }
  async function handleStart(sendResponse) {
    let started;
    try {
      started = await connections.start();
    } catch (error) {
      sendResponse({
        ok: false,
        code: error?.code ?? "device_start_failed"
      });
      return;
    }
    await openUrl(started.verificationUriComplete || started.verificationUri);
    const record = { cancelled: false };
    active.set(started.id, record);
    void runDeviceConnectPolling({
      connections,
      id: started.id,
      intervalMs: started.intervalMs,
      persist,
      sleep,
      cancelled: () => record.cancelled,
      emit: (phase) => broadcast(started.id, phase)
    }).finally(() => {
      active.delete(started.id);
    });
    sendResponse({
      ok: true,
      id: started.id,
      userCode: started.userCode,
      verificationUri: started.verificationUri,
      verificationUriComplete: started.verificationUriComplete,
      expiresAt: started.expiresAt
    });
  }
  function handleCancel(id, sendResponse) {
    const record = active.get(id);
    if (record) record.cancelled = true;
    connections.cancel(id);
    sendResponse({ ok: true });
  }
  function handleMessage(message, _sender, sendResponse) {
    if (message?.type === DEVICE_CONNECT_START) {
      void handleStart(sendResponse);
      return true;
    }
    if (message?.type === DEVICE_CONNECT_CANCEL) {
      handleCancel(message.id, sendResponse);
      return false;
    }
    return false;
  }
  return { handleMessage, handleStart, handleCancel, broadcast };
}

// src/background/runtime-message-handlers.js
var UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var SIDEPANEL_HOST_CAPABILITIES = [
  "open_options",
  "switch_back_to_classic",
  "set_locale"
];
function isRedrobAiOrigin(origin) {
  return TRUSTED_EXTERNAL_ORIGINS.includes(origin);
}
function createRuntimeMessageHandlers(deps, nativeHost, cicTransport, sidePanel, scheduling, deviceConnect) {
  const handledInternalMessageTypes = /* @__PURE__ */ new Set([
    "SW_KEEPALIVE",
    "PLAY_NOTIFICATION_SOUND",
    "open_side_panel",
    "relay_redrob_org",
    "check_native_host_status",
    "SEND_MCP_NOTIFICATION",
    "OPEN_OPTIONS_WITH_TASK",
    "EXECUTE_SCHEDULED_TASK",
    "STOP_AGENT",
    "SWITCH_TO_MAIN_TAB",
    "SECONDARY_TAB_CHECK_MAIN",
    "MAIN_TAB_ACK_RESPONSE",
    "STATIC_INDICATOR_HEARTBEAT",
    "DISMISS_STATIC_INDICATOR_FOR_GROUP",
    DEVICE_CONNECT_START,
    DEVICE_CONNECT_CANCEL,
    "EXECUTE_BROWSER_TOOL",
    "REGISTER_CAPTURED_IMAGE",
    "SET_AGENT_TAB_GROUP_STATUS",
    "SET_AGENT_ACTIVITY",
    deps.conwayMessageTypes.GET_STATUS,
    ...deps.cicIframeMessageTypes
  ]);
  async function populateOnboardingPromptWithRetry(promptText) {
    const attempt = async (retryCount = 0) => {
      try {
        await deps.sleep(retryCount === 0 ? 800 : 500);
        await new Promise((resolve, reject) => {
          chrome.runtime.sendMessage(
            { type: "POPULATE_INPUT_TEXT", prompt: promptText },
            (response) => {
              const errorMessage = chrome.runtime.lastError?.message;
              if (errorMessage || !response?.success) {
                reject(new Error(errorMessage ?? "side panel not ready"));
              } else {
                resolve();
              }
            }
          );
        });
      } catch {
        if (retryCount < 5) await attempt(retryCount + 1);
      }
    };
    await attempt();
  }
  async function resolveAgentTabGroupId(activeTabId) {
    if (!Number.isInteger(activeTabId) || !deps.tabGroupManager)
      return void 0;
    try {
      const existing = await deps.tabGroupManager.findGroupByTab(activeTabId);
      if (existing) return existing.chromeGroupId;
      const created = await deps.tabGroupManager.createGroup(activeTabId);
      return created?.chromeGroupId;
    } catch {
      return void 0;
    }
  }
  async function dispatchInternalMessage(message, sender, sendResponse) {
    if (message.type === "SW_KEEPALIVE") {
      sendResponse();
      return;
    }
    if (message.type === DEVICE_CONNECT_START || message.type === DEVICE_CONNECT_CANCEL) {
      deviceConnect?.handleMessage(message, sender, sendResponse);
      return;
    }
    if (message.type === "PLAY_NOTIFICATION_SOUND") {
      try {
        await deps.ensureOffscreenDocument();
        await chrome.runtime.sendMessage({
          type: "OFFSCREEN_PLAY_SOUND",
          audioUrl: message.audioUrl,
          volume: message.volume || 0.5
        });
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
    if (message.type === "open_side_panel") {
      const tabId = message.tabId || sender.tab?.id;
      if (!tabId) {
        sendResponse({ success: false });
        return;
      }
      await sidePanel.openSidePanelForTab(tabId);
      const onboardingPrompt = deps.getOnboardingPromptText(
        message.onboardingTaskId
      );
      if (onboardingPrompt) {
        await populateOnboardingPromptWithRetry(onboardingPrompt);
      }
      sendResponse({ success: true });
      return;
    }
    if (message.type === deps.conwayMessageTypes.GET_STATUS) {
      sendResponse({
        status: deps.getConwayStatus(),
        containerId: await deps.getConwayContainerId() ?? ""
      });
      return;
    }
    if (message.type === "relay_redrob_org") {
      if (typeof message.value === "string" && UUID_RE.test(message.value)) {
        await deps.setStorageValue(
          deps.storageKeys.REDROB_ORG_HINT,
          message.value
        );
      }
      sendResponse({ success: true });
      return;
    }
    if (message.type === "check_native_host_status") {
      const status = await nativeHost.queryNativeHostStatus();
      sendResponse({
        status: {
          nativeHostInstalled: status.nativeHostInstalled,
          mcpConnected: status.mcpConnected || deps.isBridgeWebSocketOpen()
        }
      });
      return;
    }
    if (message.type === "SEND_MCP_NOTIFICATION") {
      const viaNative = nativeHost.sendNativeMcpNotification(
        message.method,
        message.params
      );
      const viaBridge = deps.sendBridgeNotification(
        message.method,
        message.params
      );
      sendResponse({ success: viaNative || viaBridge });
      return;
    }
    if (message.type === "EXECUTE_BROWSER_TOOL") {
      if (typeof message.toolName !== "string" || !message.args || typeof message.args !== "object") {
        sendResponse({ success: false, error: "Invalid tool request" });
        return;
      }
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        const result = await deps.executeTool({
          toolName: message.toolName,
          args: message.args,
          tabId: activeTab?.id,
          tabGroupId: await resolveAgentTabGroupId(activeTab?.id),
          source: "sidepanel",
          toolUseId: message.toolUseId
        });
        sendResponse({ success: true, result });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    if (message.type === "SET_AGENT_ACTIVITY") {
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        await setRunIndicators(
          message.active === true,
          message.unattended === true,
          activeTab?.id
        );
        sendResponse({ success: true });
      } catch {
        sendResponse({ success: false });
      }
      return;
    }
    if (message.type === "SET_AGENT_TAB_GROUP_STATUS") {
      try {
        const [activeTab] = await chrome.tabs.query({
          active: true,
          currentWindow: true
        });
        const groupId = await resolveAgentTabGroupId(activeTab?.id);
        await deps.tabGroupManager.setAgentStatus(groupId, message.status);
        sendResponse({ success: true });
      } catch {
        sendResponse({ success: false });
      }
      return;
    }
    if (message.type === "REGISTER_CAPTURED_IMAGE") {
      try {
        sendResponse({
          success: true,
          result: deps.registerCapturedImage(message.dataUrl)
        });
      } catch (error) {
        sendResponse({
          success: false,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    if (deps.cicIframeMessageTypes.includes(message.type)) {
      sendResponse(await cicTransport.handleCicIframeMessage(message, sender));
      return;
    }
    if (message.type === "OPEN_OPTIONS_WITH_TASK") {
      try {
        await deps.setStorageValue(
          deps.storageKeys.PENDING_SCHEDULED_TASK,
          message.task
        );
        const optionsBase = chrome.runtime.getURL("options.html");
        const existing = (await chrome.tabs.query({})).find(
          (tab) => tab.url?.startsWith(optionsBase)
        );
        if (existing?.id) {
          await chrome.tabs.update(existing.id, {
            url: chrome.runtime.getURL("options.html#prompts"),
            active: true
          });
          if (existing.windowId) {
            await chrome.windows.update(existing.windowId, { focused: true });
          }
        } else {
          await chrome.tabs.create({
            url: chrome.runtime.getURL("options.html#prompts")
          });
        }
        sendResponse({ success: true });
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
    if (message.type === "EXECUTE_SCHEDULED_TASK") {
      if (sender.tab) {
        sendResponse({ success: false, error: "Forbidden sender" });
        return;
      }
      try {
        const { task, runLogId } = message;
        await scheduling.executeScheduledTask(task, runLogId);
        deps.trackAnalytics(
          "claude_chrome.scheduled_task.executed",
          deps.scheduledTaskSuccessProps(
            task.id,
            message.isManual ? "manual" : "automatic"
          )
        );
        sendResponse({ success: true });
      } catch (error) {
        deps.trackAnalytics(
          "claude_chrome.scheduled_task.executed",
          deps.scheduledTaskFailureProps(
            message.task.id,
            message.isManual ? "manual" : "automatic",
            error
          )
        );
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
    if (message.type === "STOP_AGENT") {
      let targetTabId;
      if (message.fromTabId === "CURRENT_TAB" && sender.tab?.id) {
        targetTabId = await deps.tabGroupManager.getMainTabId(sender.tab.id) || sender.tab.id;
      } else if (typeof message.fromTabId === "number") {
        targetTabId = message.fromTabId;
      }
      if (targetTabId) {
        chrome.runtime.sendMessage({ type: "STOP_AGENT", targetTabId });
      }
      sendResponse({ success: true });
      return;
    }
    if (message.type === "SWITCH_TO_MAIN_TAB") {
      if (!sender.tab?.id) {
        sendResponse({ success: false, error: "No sender tab" });
        return;
      }
      try {
        await deps.tabGroupManager.initialize(true);
        const mainTabId = await deps.tabGroupManager.getMainTabId(
          sender.tab.id
        );
        if (mainTabId) {
          await chrome.tabs.update(mainTabId, { active: true });
          const mainTab = await chrome.tabs.get(mainTabId);
          if (mainTab.windowId) {
            await chrome.windows.update(mainTab.windowId, { focused: true });
          }
          sendResponse({ success: true });
        } else {
          sendResponse({ success: false, error: "No main tab found" });
        }
      } catch (error) {
        sendResponse({ success: false, error: error.message });
      }
      return;
    }
    if (message.type === "SECONDARY_TAB_CHECK_MAIN") {
      chrome.runtime.sendMessage(
        {
          type: "MAIN_TAB_ACK_REQUEST",
          secondaryTabId: message.secondaryTabId,
          mainTabId: message.mainTabId,
          timestamp: message.timestamp
        },
        (response) => {
          sendResponse(
            response?.success ? { success: true } : { success: false }
          );
        }
      );
      return;
    }
    if (message.type === "MAIN_TAB_ACK_RESPONSE") {
      sendResponse({ success: message.success });
      return;
    }
    if (message.type === "STATIC_INDICATOR_HEARTBEAT") {
      await sidePanel.handleStaticIndicatorHeartbeat(sender, sendResponse);
      return;
    }
    if (message.type === "DISMISS_STATIC_INDICATOR_FOR_GROUP") {
      await sidePanel.handleDismissStaticIndicatorForGroup(
        sender,
        sendResponse
      );
    }
  }
  function registerInternalMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!handledInternalMessageTypes.has(message.type)) return false;
      dispatchInternalMessage(message, sender, sendResponse).catch((error) => {
        sendResponse({ success: false, error: String(error) });
      });
      return true;
    });
  }
  async function dispatchExternalMessage(message, sender, sendResponse) {
    const isTrustedOrigin = Boolean(sender.origin) && TRUSTED_EXTERNAL_ORIGINS.includes(sender.origin);
    const viaDevCarveOut = !isTrustedOrigin && false;
    if (!isTrustedOrigin && !viaDevCarveOut) {
      sendResponse({ success: false, error: "Untrusted origin" });
      return;
    }
    if (message.type === "ping") {
      sendResponse({ success: true, exists: true });
      return;
    }
    if (message.type === "get_sidepanel_host_info") {
      try {
        const isExtensionPage = sender.tab === void 0;
        const isRedrobAi = isRedrobAiOrigin(sender.origin);
        const [accountUuid, redrobOrgUuid, notificationsEnabled, locale] = await Promise.all([
          isExtensionPage && !viaDevCarveOut ? deps.getAccountUuid() : Promise.resolve(void 0),
          isExtensionPage && !viaDevCarveOut ? deps.getStorageValue(deps.storageKeys.REDROB_ORG_HINT) : Promise.resolve(void 0),
          deps.getStorageValue(deps.storageKeys.NOTIFICATIONS_ENABLED).then((value) => value === "enabled"),
          chrome.storage.local.get("preferred_locale").then((stored) => {
            const preferred = stored.preferred_locale;
            return preferred !== void 0 && deps.availableLocales.includes(preferred) ? preferred : deps.getDefaultLocale();
          })
        ]);
        sendResponse({
          ok: true,
          accountUuid: viaDevCarveOut ? void 0 : accountUuid,
          redrobOrgUuid,
          viaDevCarveOut,
          extensionVersion: chrome.runtime.getManifest().version,
          build: { environment: "production", antOnlyBuild: false },
          notificationsEnabled,
          locale,
          availableLocales: deps.availableLocales.map((code) => ({
            code,
            displayName: deps.localeDisplayNames[code]
          })),
          capabilities: isExtensionPage && isRedrobAi ? [...SIDEPANEL_HOST_CAPABILITIES] : []
        });
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return;
    }
    if (SIDEPANEL_HOST_CAPABILITIES.includes(message.type)) {
      if (sender.tab !== void 0 || !isRedrobAiOrigin(sender.origin)) {
        sendResponse({
          ok: false,
          error: "Action not allowed from this origin/context"
        });
        return;
      }
      try {
        if (message.type === "open_options") {
          await chrome.runtime.openOptionsPage();
          sendResponse({ ok: true });
        } else if (message.type === "switch_back_to_classic") {
          await chrome.storage.local.set({ preferCoworkExperience: false });
          sendResponse({ ok: true });
        } else if (message.type === "set_locale") {
          const locale = message.locale;
          if (typeof locale !== "string" || !deps.availableLocales.includes(locale)) {
            sendResponse({ ok: false, error: "Unknown locale" });
            return;
          }
          await chrome.storage.local.set({ preferred_locale: locale });
          sendResponse({ ok: true });
        } else {
          sendResponse({
            ok: false,
            error: `Unhandled sidepanel action: ${message.type}`
          });
        }
      } catch (error) {
        sendResponse({ ok: false, error: String(error) });
      }
      return;
    }
    sendResponse();
  }
  function registerExternalMessageListener() {
    chrome.runtime.onMessageExternal.addListener(
      (message, sender, sendResponse) => {
        dispatchExternalMessage(message, sender, sendResponse).catch(
          (error) => {
            sendResponse({ success: false, error: String(error) });
          }
        );
        return true;
      }
    );
  }
  return {
    handledInternalMessageTypes,
    registerInternalMessageListener,
    registerExternalMessageListener,
    dispatchInternalMessage,
    dispatchExternalMessage
  };
}

// src/background/bootstrap.js
var UNINSTALL_FEEDBACK_URL = "https://redrob.io";
async function installApiClientHeaderRules(deps) {
  const config = deps.getExtensionConfig();
  const version = chrome.runtime.getManifest().version;
  const productUa = `${REDROB_BROWSER_ID}/${version} (external)`;
  const userAgentValue = `${productUa} ${navigator.userAgent} `;
  const rules = [
    {
      id: 1,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "User-Agent",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: userAgentValue
          },
          {
            header: "redrob-client-platform",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: REDROB_BROWSER_ID
          },
          {
            header: "redrob-client-version",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: version
          }
        ]
      },
      condition: {
        urlFilter: `${config.apiBaseUrl}/*`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER
        ]
      }
    }
  ];
  await chrome.declarativeNetRequest.updateSessionRules({
    removeRuleIds: [1],
    addRules: rules
  });
}
function bootstrapBackgroundServiceWorker(dependencyOverrides = {}) {
  const deps = createBackgroundDependencies(dependencyOverrides);
  const nativeHost = createNativeHostBridge(deps);
  const cicTransport = createCicIframeTransport(deps);
  const sidePanel = createSidePanelAndTabOrchestration(deps, nativeHost);
  const scheduling = createSchedulingAndNotifications(deps);
  const deviceConnect = createDeviceConnectOrchestrator();
  const messages = createRuntimeMessageHandlers(
    deps,
    nativeHost,
    cicTransport,
    sidePanel,
    scheduling,
    deviceConnect
  );
  deps.installBridgeKeepaliveAlarms();
  deps.installToolNavigationGuard();
  deps.connectBridgeWebSocket();
  deps.ensureOffscreenDocument().catch(() => {
  });
  nativeHost.tryConnectNativeHost();
  deps.initConwayConnection();
  chrome.runtime.onInstalled.addListener(async (details) => {
    chrome.storage.local.remove(["updateAvailable"]);
    chrome.runtime.setUninstallURL(UNINSTALL_FEEDBACK_URL);
    deps.initAnalytics();
    await deps.tabGroupManager.initialize();
    await installApiClientHeaderRules(deps);
    await sidePanel.enableSidePanelEverywhere();
    nativeHost.tryConnectNativeHost();
    await scheduling.rehydrateScheduledPromptAlarms();
  });
  chrome.runtime.onStartup.addListener(async () => {
    deps.initAnalytics();
    await installApiClientHeaderRules(deps);
    await deps.tabGroupManager.initialize();
    await sidePanel.enableSidePanelEverywhere();
    deps.connectBridgeWebSocket();
    nativeHost.tryConnectNativeHost();
    await scheduling.rehydrateScheduledPromptAlarms();
  });
  chrome.permissions.onAdded.addListener((permissions) => {
    if (permissions.permissions?.includes("nativeMessaging")) {
      nativeHost.tryConnectNativeHost();
    }
  });
  chrome.permissions.onRemoved.addListener((permissions) => {
    if (permissions.permissions?.includes("nativeMessaging")) {
      nativeHost.disconnectNativeHostAndRevokePermission();
    }
  });
  chrome.action.onClicked.addListener(async (tab) => {
    const tabId = tab.id;
    if (!tabId) return;
    await sidePanel.openSidePanelForTab(tabId);
  });
  chrome.notifications.onClicked.addListener(async (notificationId) => {
    await scheduling.handleNotificationClicked(notificationId);
  });
  chrome.notifications.onClosed.addListener((notificationId) => {
    scheduling.handleNotificationClosed(notificationId);
  });
  chrome.commands.onCommand.addListener((command) => {
    if (command !== "toggle-side-panel") return;
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab) sidePanel.toggleSidePanelForTab(tab);
    });
  });
  chrome.runtime.onUpdateAvailable.addListener((updateInfo) => {
    deps.setStorageValue(deps.storageKeys.UPDATE_AVAILABLE, true);
    deps.trackAnalytics("claude_chrome.extension.update_available", {
      current_version: chrome.runtime.getManifest().version,
      new_version: updateInfo.version
    });
  });
  messages.registerInternalMessageListener();
  messages.registerExternalMessageListener();
  chrome.tabs.onRemoved.addListener(async (tabId) => {
    deps.debuggerRelay.notifyTabDetach(tabId);
    await deps.tabGroupManager.handleTabClosed(tabId);
  });
  chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
    if (details.frameId === 0) {
      await sidePanel.handleRedrobDeDeepLink(details.url, details.tabId);
    }
  });
  chrome.alarms.onAlarm.addListener(async (alarm) => {
    await scheduling.handleAlarm(alarm);
  });
  return {
    deps,
    nativeHost,
    cicTransport,
    sidePanel,
    scheduling,
    messages,
    deviceConnect
  };
}

// src/i18n/add-locales.js
var SUPPORTED_LOCALES = ["en-US", "ko-KR"];
var LOCALE_LABELS = {
  "en-US": "English",
  "ko-KR": "한국어"
};

// src/transport/cic-bridge-messages.js
var CIC_IFRAME_BRIDGE_INIT = "CIC_IFRAME_BRIDGE_INIT";
var CIC_IFRAME_TOOL_CALL = "CIC_IFRAME_TOOL_CALL";
var CIC_IFRAME_BRIDGE_MESSAGE_TYPES = Object.freeze([
  CIC_IFRAME_BRIDGE_INIT,
  CIC_IFRAME_TOOL_CALL
]);

// src/transport/onboarding-prompts.js
var ONBOARDING_PROMPTS = Object.freeze({
  "challenge-email": "I'm learning how to use the browser extension, and need help with this practice challenge.\n\nCan you look at the demo inbox on this page and help me archive only the meeting RSVP emails? Look for emails with 'Accepted:', 'Declined:', or 'Tentative:' in the subject line. For each RSVP email, click the gray folder/archive icon button that appears to the right of the checkbox (it looks like a filing cabinet or folder icon). Leave other work emails in the inbox. Take a screenshot after archiving each RSVP.",
  "challenge-form": "I’m learning how to use the browser extension, and need help with this practice challenge.\n\nCan you take a look at this form and help me fill it out with realistic restaurant reservation information? For dropdown fields, please use the form input action to fill them in.",
  "challenge-equipment": "I’m learning how to use the browser extension, and need help with this practice challenge.\n\nLooking at these various items, can you help me select the ones that would be good video equipment for creating content? Please click on the equipment you’d recommend.",
  "usecase-zillow": "Navigate to Zillow and find me a 2-bedroom apartment in San Francisco under $4000/month. Filter for places available within the next 30 days and show me the top 3 options with photos.",
  "usecase-calendar": "Go to my Google Calendar and find a 1-hour slot this week when both [name] and I are free. Once you find a good time, create a meeting called [name] and send the invite.",
  "usecase-gdocs": "Go to Google docs and open the latest document. Read through all the comments and feedback, then give me a summary of the main concerns and create a prioritized action item list of what needs to be addressed.",
  "usecase-gmail": "Go through my recent Gmail and find email lists or promotional emails that I haven’t opened in the last 3 months. Help me unsubscribe from these via the unsubcribe button at the top of the email.",
  "usecase-doordash": "Navigate to DoorDash and find a highly rated restaurant in San Francisco that serves garlic noodles. Browse their menu, add garlic noodles and any recommended sides to my cart, but don’t complete the order yet.",
  "usecase-salesforce": "Go to Salesforce and find the lead for [name]. Convert this lead into a sales opportunity with the opportunity name [opportunity name] and set the stage to ‘Qualification’."
});
function getOnboardingPromptText(taskId) {
  if (!taskId) return void 0;
  return Object.hasOwn(ONBOARDING_PROMPTS, taskId) ? ONBOARDING_PROMPTS[taskId] : void 0;
}

// src/background/tool-execution-facade.js
function makeToolErrorResult(message) {
  return {
    content: [{ type: "text", text: message }],
    is_error: true
  };
}

// src/background/browser-tool-executor.js
var DEFAULT_MAX_CHARS = 5e4;
function createBrowserToolExecutor({
  debuggerRelay,
  tabGroupManager,
  ensureOffscreenDocument: ensureOffscreenDocument2 = async () => {
  }
}) {
  const capturedImages = /* @__PURE__ */ new Map();
  const gifRecordings = /* @__PURE__ */ new Map();
  async function executeTool(request) {
    const toolName = normalizeToolName(request.toolName);
    const args = request.args ?? {};
    try {
      if (toolName === "browser_batch") {
        return executeBatch(request, args.actions);
      }
      switch (toolName) {
        case "tabs_context":
          return textResult(await listTabs(request.tabId, request.tabGroupId));
        case "tabs_create":
          return textResult(await createTab(args, request.tabGroupId));
        case "tabs_close":
          return textResult(await closeTabs(args, request.tabId));
        case "navigate":
          return textResult(await navigate(resolveTabId(request, args), args));
        case "read_page":
          return textResult(await readPage(resolveTabId(request, args), args));
        case "get_page_text":
          return textResult(
            await getPageText(resolveTabId(request, args), args)
          );
        case "find":
          return textResult(
            await findElements(resolveTabId(request, args), args)
          );
        case "form_input":
          return textResult(
            await fillFormInput(resolveTabId(request, args), args)
          );
        case "javascript_tool":
          return textResult(
            await evaluateJavaScript(resolveTabId(request, args), args)
          );
        case "computer": {
          const tabId = resolveTabId(request, args);
          const result = await useComputer(tabId, args);
          await recordComputerFrame(request, tabId, args, result);
          return textResult(result);
        }
        case "gif_creator":
          return textResult(await useGifCreator(request, args));
        case "upload_image":
          return textResult(
            await uploadImage(resolveTabId(request, args), args)
          );
        case "resize_window":
          return textResult(
            await resizeWindow(resolveTabId(request, args), args)
          );
        case "read_console_messages":
          return textResult(
            readConsoleMessages(resolveTabId(request, args), args)
          );
        case "read_network_requests":
          return textResult(
            readNetworkRequests(resolveTabId(request, args), args)
          );
        default:
          return makeToolErrorResult(
            `Browser tool "${request.toolName}" is not supported.`
          );
      }
    } catch (error) {
      return makeToolErrorResult(
        `${request.toolName} failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  async function executeBatch(request, actions) {
    if (!Array.isArray(actions)) {
      return makeToolErrorResult("browser_batch requires an actions array.");
    }
    const results = [];
    for (const action of actions) {
      if (!action || typeof action.name !== "string") {
        return makeToolErrorResult("Malformed browser_batch action.");
      }
      if (normalizeToolName(action.name) === "browser_batch") {
        return makeToolErrorResult(
          "Nested browser_batch actions are not allowed."
        );
      }
      const result = await executeTool({
        ...request,
        toolName: action.name,
        args: action.input ?? {}
      });
      results.push(result);
      if (result?.is_error) break;
    }
    return textResult(results);
  }
  async function listTabs(currentTabId, tabGroupId) {
    const tabs = await chrome.tabs.query(
      Number.isInteger(tabGroupId) ? { groupId: tabGroupId } : {}
    );
    return {
      currentTabId,
      tabs: tabs.map((tab) => ({
        id: tab.id,
        windowId: tab.windowId,
        groupId: tab.groupId,
        active: tab.active,
        title: tab.title,
        url: tab.url
      }))
    };
  }
  async function createTab(args, tabGroupId) {
    const tab = await chrome.tabs.create({
      url: args.url || "about:blank",
      active: args.active !== false
    });
    if (tab.id && Number.isInteger(tabGroupId)) {
      await chrome.tabs.group({ groupId: tabGroupId, tabIds: [tab.id] });
    } else if (args.grouped && tab.id) {
      await tabGroupManager.createGroup(tab.id);
    }
    return { tabId: tab.id, title: tab.title, url: tab.url };
  }
  async function closeTabs(args, fallbackTabId) {
    const tabIds = Array.isArray(args.tabIds) ? args.tabIds : [args.tabId ?? fallbackTabId].filter(Number.isInteger);
    if (!tabIds.length) throw new Error("No tab ID was provided.");
    await chrome.tabs.remove(tabIds);
    return { closedTabIds: tabIds };
  }
  async function navigate(tabId, args) {
    if (typeof args.url !== "string" || !args.url.trim()) {
      throw new Error("navigate requires a URL.");
    }
    const url = normalizeUrl(args.url);
    const tab = await chrome.tabs.update(tabId, { url, active: true });
    return { tabId: tab.id, url };
  }
  async function readPage(tabId, args) {
    const options = [
      args.filter === "interactive" ? "interactive" : "all",
      args.depth,
      args.max_chars ?? DEFAULT_MAX_CHARS,
      args.ref_id
    ];
    let result = await callContentFunction(
      tabId,
      "__generateAccessibilityTree",
      options
    );
    if (!result) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: false },
        files: ["assets/accessibility-tree.js"]
      });
      result = await callContentFunction(
        tabId,
        "__generateAccessibilityTree",
        options
      );
    }
    if (!result) throw new Error("Accessibility tree is unavailable.");
    const tab = await chrome.tabs.get(tabId);
    const payload = {
      tabId,
      title: tab.title,
      url: tab.url,
      viewport: result.viewport,
      pageContent: result.pageContent
    };
    if (!result.pageContent?.trim()) {
      const note = await canvasPageNote(tabId);
      if (note) payload.note = note;
    }
    return payload;
  }
  async function canvasPageNote(tabId) {
    try {
      const [execution] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () => {
          let widest = null;
          for (const canvas2 of document.querySelectorAll("canvas")) {
            const box = canvas2.getBoundingClientRect();
            if (box.width * box.height < 4e4) continue;
            if (!widest || box.width * box.height > widest.w * widest.h) {
              widest = { w: Math.round(box.width), h: Math.round(box.height) };
            }
          }
          return widest;
        }
      });
      const canvas = execution?.result;
      if (!canvas) return null;
      return `This page draws its content into a ${canvas.w}x${canvas.h} canvas, so the DOM holds no text and no elements to reference. Read it with computer action screenshot, and act on it by coordinate: computer action left_click at a point, then computer action type, which sends real key events to whatever the click focused.`;
    } catch {
      return null;
    }
  }
  async function getPageText(tabId, args) {
    const maxChars = args.max_chars ?? DEFAULT_MAX_CHARS;
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (limit) => {
        const preferred = document.querySelector("article, main, [role=main]") ?? document.body;
        const text2 = (preferred?.innerText ?? "").replace(/\n{3,}/g, "\n\n").trim();
        return {
          title: document.title,
          url: location.href,
          text: text2.length > limit ? `${text2.slice(0, limit)}
[output truncated at ${limit} of ${text2.length} characters]` : text2
        };
      },
      args: [maxChars]
    });
    if (!execution?.result) throw new Error("Page text is unavailable.");
    if (!execution.result.text) {
      const note = await canvasPageNote(tabId);
      if (note) return { ...execution.result, note };
    }
    return execution.result;
  }
  async function findElements(tabId, args) {
    const query = String(args.query ?? "").trim().toLowerCase();
    if (!query) throw new Error("find requires a query.");
    await readPage(tabId, { filter: "all", max_chars: DEFAULT_MAX_CHARS });
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (needle) => {
        const candidates = [
          ...document.querySelectorAll(
            "a,button,input,textarea,select,[role],[aria-label],h1,h2,h3,p"
          )
        ];
        return candidates.filter((element) => {
          const haystack = [
            element.innerText,
            element.getAttribute("aria-label"),
            element.getAttribute("placeholder"),
            element.getAttribute("title"),
            element.getAttribute("value")
          ].filter(Boolean).join(" ").toLowerCase();
          return haystack.includes(needle);
        }).slice(0, 20).map((element) => ({
          ref_id: window.__redrobElementReverseMap?.get(element),
          tag: element.tagName.toLowerCase(),
          text: element.innerText?.trim().slice(0, 200) || element.getAttribute("aria-label") || element.getAttribute("placeholder") || ""
        }));
      },
      args: [query]
    });
    const matches = execution?.result ?? [];
    if (matches.length === 0) {
      const note = await canvasPageNote(tabId);
      if (note) return { query: args.query, matches, note };
    }
    return { query: args.query, matches };
  }
  async function fillFormInput(tabId, args) {
    const refId = args.ref ?? args.ref_id ?? args.refId;
    if (typeof refId !== "string") {
      throw new Error("form_input requires ref.");
    }
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id, value) => {
        const element = window.__redrobElementMap?.[id]?.deref?.();
        if (!element) return { error: `Element ${id} was not found.` };
        element.focus();
        const descriptor = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element),
          "value"
        );
        if (descriptor?.set) descriptor.set.call(element, String(value ?? ""));
        else element.value = String(value ?? "");
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return { ref_id: id, value: element.value };
      },
      args: [refId, args.value ?? args.text ?? ""]
    });
    if (execution?.result?.error) throw new Error(execution.result.error);
    return execution?.result;
  }
  async function evaluateJavaScript(tabId, args) {
    const expression = args.text ?? args.code;
    if (typeof expression !== "string") {
      throw new Error("javascript_tool requires text.");
    }
    const response = await debuggerRelay.sendCommand(
      tabId,
      "Runtime.evaluate",
      {
        expression,
        awaitPromise: true,
        returnByValue: true,
        userGesture: true
      }
    );
    if (response.exceptionDetails) {
      throw new Error(
        response.exceptionDetails.exception?.description ?? response.exceptionDetails.text
      );
    }
    return {
      tabId,
      output: response.result?.value ?? response.result?.description
    };
  }
  async function useComputer(tabId, args) {
    const action = args.action;
    if (action === "scroll_to") {
      if (typeof args.ref !== "string") {
        throw new Error("scroll_to requires ref.");
      }
      const coordinate = await resolveElementPoint(tabId, args.ref, true);
      return { action, ref: args.ref, coordinate };
    }
    if (action === "wait") {
      await new Promise(
        (resolve) => setTimeout(resolve, Math.max(0, Number(args.duration ?? 1)) * 1e3)
      );
      return { action, waited: args.duration ?? 1 };
    }
    const needsPoint = !["screenshot", "zoom", "type", "key"].includes(action);
    const point = needsPoint && typeof args.ref === "string" ? await resolveElementPoint(tabId, args.ref) : args.coordinate;
    const [x = 0, y = 0] = point ?? [];
    if (action === "screenshot") {
      const dataUrl = await withIndicatorsHidden(
        tabId,
        () => captureTabDataUrl(tabId)
      );
      const imageId = `image_${crypto.randomUUID()}`;
      capturedImages.set(imageId, dataUrl);
      return {
        action,
        imageId,
        dataUrl
      };
    }
    if (action === "zoom") {
      if (!Array.isArray(args.region) || args.region.length !== 4) {
        throw new Error("zoom requires region [x0, y0, x1, y1].");
      }
      const [x0, y0, x1, y1] = args.region;
      if (x1 <= x0 || y1 <= y0) {
        throw new Error("zoom region must have positive width and height.");
      }
      return {
        action,
        region: args.region,
        dataUrl: await captureTabDataUrl(tabId, {
          x: x0,
          y: y0,
          width: x1 - x0,
          height: y1 - y0,
          scale: 1
        })
      };
    }
    if (action === "type") {
      await debuggerRelay.sendCommand(tabId, "Input.insertText", {
        text: String(args.text ?? "")
      });
      return { action, text: args.text ?? "" };
    }
    if (action === "key") {
      return pressKey(tabId, String(args.text ?? args.key ?? "Enter"));
    }
    if (action === "scroll") {
      if (!point) throw new Error("scroll requires coordinate.");
      const direction = args.scroll_direction ?? args.direction ?? "down";
      const amount = Number(args.scroll_amount ?? 3) * 100;
      const deltaX = Number(args.delta_x ?? args.scroll_x ?? 0) || (direction === "left" ? -amount : direction === "right" ? amount : 0);
      const deltaY = Number(args.delta_y ?? args.scroll_y ?? 0) || (direction === "up" ? -amount : direction === "down" ? amount : 0);
      await debuggerRelay.sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x,
        y,
        deltaX,
        deltaY
      });
      return { action, coordinate: [x, y], deltaX, deltaY };
    }
    if (action === "hover") {
      if (!point) throw new Error("hover requires coordinate or ref.");
      await movePhantomCursor(tabId, [x, y]);
      await mouseEvent(tabId, "mouseMoved", x, y);
      return { action, coordinate: [x, y] };
    }
    if (action === "left_click_drag") {
      if (!Array.isArray(args.start_coordinate)) {
        throw new Error("left_click_drag requires start_coordinate.");
      }
      const [startX, startY] = args.start_coordinate;
      const [endX, endY] = args.coordinate ?? [];
      if (!Number.isFinite(endX) || !Number.isFinite(endY)) {
        throw new Error("left_click_drag requires coordinate.");
      }
      await mouseEvent(tabId, "mouseMoved", startX, startY);
      await mouseEvent(tabId, "mousePressed", startX, startY, "left", 1);
      await mouseEvent(tabId, "mouseMoved", endX, endY, "left", 0, 1);
      await mouseEvent(tabId, "mouseReleased", endX, endY, "left", 1);
      return { action, from: [startX, startY], to: [endX, endY] };
    }
    if (!point) {
      throw new Error(`${action} requires coordinate or ref.`);
    }
    await movePhantomCursor(tabId, [x, y]);
    const button = action === "right_click" ? "right" : "left";
    const clickCount = action === "triple_click" ? 3 : action === "double_click" ? 2 : 1;
    await mouseEvent(tabId, "mousePressed", x, y, button, clickCount);
    await mouseEvent(tabId, "mouseReleased", x, y, button, clickCount);
    return { action, coordinate: [x, y] };
  }
  async function pressKey(tabId, key) {
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key;
    const virtualKeyCode = key === "Enter" ? 13 : key === "Tab" ? 9 : key.toUpperCase().charCodeAt(0);
    const params = {
      key,
      code,
      windowsVirtualKeyCode: virtualKeyCode,
      nativeVirtualKeyCode: virtualKeyCode
    };
    await debuggerRelay.sendCommand(tabId, "Input.dispatchKeyEvent", {
      ...params,
      type: "rawKeyDown"
    });
    await debuggerRelay.sendCommand(tabId, "Input.dispatchKeyEvent", {
      ...params,
      type: "keyUp"
    });
    return { action: "key", key };
  }
  async function mouseEvent(tabId, type, x, y, button = "none", clickCount = 0, buttons = type === "mousePressed" ? button === "right" ? 2 : 1 : 0) {
    await debuggerRelay.sendCommand(tabId, "Input.dispatchMouseEvent", {
      type,
      x,
      y,
      button,
      buttons,
      clickCount
    });
  }
  async function resizeWindow(tabId, args) {
    const tab = await chrome.tabs.get(tabId);
    await chrome.windows.update(tab.windowId, {
      width: Math.round(Number(args.width)),
      height: Math.round(Number(args.height))
    });
    return { windowId: tab.windowId, width: args.width, height: args.height };
  }
  async function useGifCreator(request, args) {
    const tabId = resolveTabId(request, args);
    const recordingId = request.tabGroupId ?? tabId;
    const action = args.action;
    if (action === "start_recording") {
      const frames = [await captureGifFrame(tabId, { type: "start" })];
      gifRecordings.set(recordingId, { frames, active: true });
      return { action, recordingId, frameCount: frames.length };
    }
    const recording = gifRecordings.get(recordingId);
    if (!recording) throw new Error("No GIF recording exists for this tab.");
    if (action === "stop_recording") {
      recording.frames.push(await captureGifFrame(tabId, { type: "stop" }));
      recording.active = false;
      return { action, recordingId, frameCount: recording.frames.length };
    }
    if (action === "clear") {
      gifRecordings.delete(recordingId);
      return { action, recordingId, frameCount: 0 };
    }
    if (action !== "export") {
      throw new Error(`Unknown gif_creator action: ${action}`);
    }
    if (recording.active) {
      recording.frames.push(await captureGifFrame(tabId, { type: "stop" }));
      recording.active = false;
    }
    await ensureOffscreenDocument2();
    const response = await chrome.runtime.sendMessage({
      type: "GENERATE_GIF",
      frames: recording.frames,
      options: args.options
    });
    if (!response?.success || !response.result?.base64) {
      throw new Error(response?.error || "GIF generation failed.");
    }
    const filename = args.filename || `recording-${Date.now()}.gif`;
    const dataUrl = `data:image/gif;base64,${response.result.base64}`;
    const imageId = `image_${crypto.randomUUID()}`;
    capturedImages.set(imageId, dataUrl);
    if (args.download) {
      await chrome.downloads.download({
        url: response.result.blobUrl || dataUrl,
        filename,
        saveAs: false
      });
    } else if (args.coordinate) {
      await uploadDataUrl(tabId, dataUrl, {
        coordinate: args.coordinate,
        filename
      });
    }
    return {
      action,
      recordingId,
      imageId,
      frameCount: recording.frames.length,
      downloaded: Boolean(args.download)
    };
  }
  async function recordComputerFrame(request, tabId, args, result) {
    if (args.action === "screenshot") return;
    const recordingId = request.tabGroupId ?? tabId;
    const recording = gifRecordings.get(recordingId);
    if (!recording?.active) return;
    recording.frames.push(
      await captureGifFrame(tabId, {
        type: args.action,
        coordinate: result?.coordinate ?? args.coordinate,
        start_coordinate: args.start_coordinate,
        text: args.text,
        description: result?.action
      })
    );
  }
  async function captureGifFrame(tabId, action) {
    const dataUrl = await captureTabDataUrl(tabId);
    const viewport = await debuggerRelay.sendCommand(tabId, "Runtime.evaluate", {
      expression: "({width: innerWidth, height: innerHeight})",
      returnByValue: true
    }).then((response) => response.result?.value).catch(() => void 0);
    return {
      base64: dataUrl.split(",")[1],
      format: "png",
      delay: 800,
      viewportWidth: viewport?.width,
      viewportHeight: viewport?.height,
      action
    };
  }
  async function uploadImage(tabId, args) {
    if (typeof args.imageId !== "string") {
      throw new Error("upload_image requires imageId.");
    }
    const dataUrl = capturedImages.get(args.imageId);
    if (!dataUrl) throw new Error(`Image ${args.imageId} was not found.`);
    if (!args.ref && !args.coordinate) {
      throw new Error("upload_image requires ref or coordinate.");
    }
    if (args.ref && args.coordinate) {
      throw new Error("upload_image accepts ref or coordinate, not both.");
    }
    return uploadDataUrl(tabId, dataUrl, args);
  }
  async function uploadDataUrl(tabId, dataUrl, args) {
    const [header, encoded] = dataUrl.split(",", 2);
    const mimeType = header.match(/^data:([^;]+)/)?.[1] ?? "image/png";
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (base64, type, filename, refId, coordinate) => {
        const binary = atob(base64);
        const bytes = Uint8Array.from(
          binary,
          (character) => character.charCodeAt(0)
        );
        const file = new File([bytes], filename, {
          type
        });
        const transfer = new DataTransfer();
        transfer.items.add(file);
        const target = refId ? window.__redrobElementMap?.[refId]?.deref?.() : document.elementFromPoint(...coordinate);
        if (!target) return { error: "Upload target was not found." };
        const bounds = target.getBoundingClientRect();
        const dropX = coordinate?.[0] ?? bounds.left + bounds.width / 2;
        const dropY = coordinate?.[1] ?? bounds.top + bounds.height / 2;
        if (target instanceof HTMLInputElement && target.type === "file") {
          target.files = transfer.files;
          target.dispatchEvent(new Event("input", { bubbles: true }));
          target.dispatchEvent(new Event("change", { bubbles: true }));
        } else {
          for (const eventName of ["dragenter", "dragover", "drop"]) {
            target.dispatchEvent(
              new DragEvent(eventName, {
                bubbles: true,
                cancelable: true,
                dataTransfer: transfer,
                clientX: dropX,
                clientY: dropY,
                screenX: dropX,
                screenY: dropY
              })
            );
          }
        }
        return { uploaded: true, filename, type };
      },
      args: [
        encoded,
        mimeType,
        args.filename || "image.png",
        args.ref,
        args.coordinate
      ]
    });
    if (execution?.result?.error) throw new Error(execution.result.error);
    return execution?.result;
  }
  async function captureTabDataUrl(tabId, clip) {
    const response = await debuggerRelay.sendCommand(
      tabId,
      "Page.captureScreenshot",
      {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
        ...clip ? { clip } : {}
      }
    );
    if (!response?.data) throw new Error("Chrome returned no screenshot data.");
    return `data:image/png;base64,${response.data}`;
  }
  async function resolveElementPoint(tabId, refId, scrollIntoView = false) {
    const [execution] = await chrome.scripting.executeScript({
      target: { tabId },
      func: (id, shouldScroll) => {
        const element = window.__redrobElementMap?.[id]?.deref?.();
        if (!element) return null;
        if (shouldScroll) {
          element.scrollIntoView({ behavior: "instant", block: "center" });
        }
        const bounds = element.getBoundingClientRect();
        return [bounds.left + bounds.width / 2, bounds.top + bounds.height / 2];
      },
      args: [refId, scrollIntoView]
    });
    if (!execution?.result) {
      throw new Error(
        `Element ${refId} was not found. Call read_page again for current ref ids, or pass a coordinate instead.`
      );
    }
    return execution.result;
  }
  function readConsoleMessages(tabId, args) {
    const pattern = args.pattern ? new RegExp(args.pattern, "i") : null;
    const messages = debuggerRelay.getConsoleMessages(tabId).filter((entry) => !args.onlyErrors || entry.type === "error").filter((entry) => !pattern || pattern.test(entry.text));
    return { tabId, messages };
  }
  function readNetworkRequests(tabId, args) {
    const pattern = args.urlPattern ? new RegExp(args.urlPattern, "i") : null;
    const requests = debuggerRelay.getNetworkRequests(tabId).filter((entry) => !pattern || pattern.test(entry.url));
    return { tabId, requests };
  }
  function registerCapturedImage(dataUrl) {
    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      throw new Error("registerCapturedImage requires an image data URL.");
    }
    const imageId = `image_${crypto.randomUUID()}`;
    capturedImages.set(imageId, dataUrl);
    return { imageId };
  }
  return { executeTool, registerCapturedImage };
}
function normalizeToolName(toolName) {
  return String(toolName).replace(/_mcp$/, "").replace(/^tabs_create$/, "tabs_create").replace(/^tabs_close$/, "tabs_close");
}
function resolveTabId(request, args) {
  const tabId = args.tabId ?? request.tabId;
  if (!Number.isInteger(tabId)) throw new Error("No active tab is available.");
  void trackAgentTab(tabId);
  return tabId;
}
function normalizeUrl(value) {
  const trimmed = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(trimmed)) return new URL(trimmed).href;
  return new URL(`https://${trimmed}`).href;
}
async function callContentFunction(tabId, name, options) {
  const [execution] = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (functionName, functionArguments) => {
      const callable = globalThis[functionName];
      return typeof callable === "function" ? await callable(...functionArguments) : null;
    },
    args: [name, options]
  });
  if (execution?.error) throw new Error(execution.error.message);
  return execution?.result;
}
function textResult(value) {
  return {
    content: typeof value === "string" ? value : JSON.stringify(value, null, 2)
  };
}

// src/background/debugger-relay.js
var DEBUGGER_PROTOCOL_VERSION = "1.3";
function createDebuggerRelay() {
  const attachedTabs = /* @__PURE__ */ new Set();
  const attachPromises = /* @__PURE__ */ new Map();
  const consoleMessages = /* @__PURE__ */ new Map();
  const networkRequests = /* @__PURE__ */ new Map();
  chrome.debugger?.onEvent?.addListener((source, method, params) => {
    const tabId = source.tabId;
    if (!tabId) return;
    if (method === "Runtime.consoleAPICalled") {
      const entries = consoleMessages.get(tabId) ?? [];
      entries.push({
        type: params.type,
        timestamp: params.timestamp,
        text: (params.args ?? []).map((arg) => arg.value ?? arg.description ?? "").join(" ")
      });
      consoleMessages.set(tabId, entries.slice(-500));
    }
    if (method === "Runtime.exceptionThrown") {
      const entries = consoleMessages.get(tabId) ?? [];
      entries.push({
        type: "error",
        timestamp: params.timestamp,
        text: params.exceptionDetails?.exception?.description ?? params.exceptionDetails?.text ?? "Unknown exception"
      });
      consoleMessages.set(tabId, entries.slice(-500));
    }
    if (method === "Network.requestWillBeSent") {
      const entries = networkRequests.get(tabId) ?? [];
      entries.push({
        requestId: params.requestId,
        method: params.request?.method,
        url: params.request?.url,
        status: void 0
      });
      networkRequests.set(tabId, entries.slice(-500));
    }
    if (method === "Network.responseReceived") {
      const entries = networkRequests.get(tabId) ?? [];
      const entry = entries.find(
        (request) => request.requestId === params.requestId
      );
      if (entry) entry.status = params.response?.status;
    }
  });
  chrome.debugger?.onDetach?.addListener((source) => {
    if (source.tabId) attachedTabs.delete(source.tabId);
  });
  async function attach(tabId) {
    if (attachedTabs.has(tabId)) return;
    if (attachPromises.has(tabId)) return attachPromises.get(tabId);
    const pending = (async () => {
      try {
        await chrome.debugger.attach({ tabId }, DEBUGGER_PROTOCOL_VERSION);
      } catch (error) {
        if (!String(error).includes("already attached")) throw error;
        try {
          await chrome.debugger.sendCommand({ tabId }, "Runtime.enable");
        } catch {
          throw error;
        }
      }
      try {
        await Promise.all([
          chrome.debugger.sendCommand({ tabId }, "Runtime.enable"),
          chrome.debugger.sendCommand({ tabId }, "Network.enable"),
          chrome.debugger.sendCommand({ tabId }, "Page.enable")
        ]);
        attachedTabs.add(tabId);
      } catch (error) {
        try {
          await chrome.debugger.detach({ tabId });
        } catch {
        }
        throw error;
      }
    })();
    attachPromises.set(tabId, pending);
    try {
      await pending;
    } finally {
      attachPromises.delete(tabId);
    }
  }
  async function sendCommand(tabId, method, params = {}) {
    await attach(tabId);
    return chrome.debugger.sendCommand({ tabId }, method, params);
  }
  async function detach(tabId) {
    if (!attachedTabs.has(tabId)) return;
    attachedTabs.delete(tabId);
    attachPromises.delete(tabId);
    try {
      await chrome.debugger.detach({ tabId });
    } catch {
    }
  }
  async function detachAll() {
    await Promise.allSettled([...attachedTabs].map((tabId) => detach(tabId)));
  }
  function notifyTabDetach(tabId) {
    attachedTabs.delete(tabId);
    attachPromises.delete(tabId);
    consoleMessages.delete(tabId);
    networkRequests.delete(tabId);
  }
  return {
    attach,
    sendCommand,
    detach,
    detachAll,
    notifyTabDetach,
    getConsoleMessages: (tabId) => [...consoleMessages.get(tabId) ?? []],
    getNetworkRequests: (tabId) => [...networkRequests.get(tabId) ?? []]
  };
}

// src/background/feature-runtime.js
function hasNativeSurface() {
  const api = globalThis.chrome?.redrobPrivate;
  return typeof api?.getBrowserVersion === "function";
}
async function isFeatureEnabled(capability = "nativeSurface") {
  switch (capability) {
    case "nativeSurface":
      return hasNativeSurface();
    // Future private methods live behind their own presence checks so a browser with an OLDER Redrob native
    // surface (the API present but one method missing) still degrades that one feature, not the whole surface.
    case "browserPreferences":
      return typeof globalThis.chrome?.redrobPrivate?.getBrowserVersion === "function";
    case "omnibox":
      return false;
    // not yet registered; added in phase 4.
    default:
      return false;
  }
}

// src/background/storage.js
var BACKGROUND_STORAGE_KEYS = Object.freeze({
  MCP_CONNECTED: "mcpConnected",
  UPDATE_AVAILABLE: "updateAvailable",
  TARGET_TAB_ID: "targetTabId",
  PENDING_SCHEDULED_TASK: "pendingScheduledTask",
  NOTIFICATIONS_ENABLED: "notificationsEnabled",
  REDROB_ORG_HINT: "redrobOrgHint"
});
async function setStorageValue(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
async function getStorageValue(key, defaultValue) {
  const result = await chrome.storage.local.get(key);
  return result[key] ?? defaultValue;
}
async function removeStorageValue(key) {
  await chrome.storage.local.remove(key);
}

// src/background/tab-group-manager.js
var NO_GROUP = -1;
var GROUP_TITLE = "Redrob";
var STATUS_PREFIX = /^(⌛|🔔|✅)/;
function createTabGroupManager() {
  const groups = /* @__PURE__ */ new Map();
  const tabToGroup = /* @__PURE__ */ new Map();
  let listenerInstalled = false;
  async function initialize() {
    if (!chrome.tabs?.query) return;
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id && isGrouped(tab.groupId)) {
        rememberGroup(tab.groupId, tab.id);
      }
    }
  }
  function rememberGroup(chromeGroupId, mainTabId) {
    const previousGroupId = tabToGroup.get(mainTabId);
    if (previousGroupId !== void 0 && previousGroupId !== chromeGroupId) {
      const previous = groups.get(previousGroupId);
      previous?.tabIds.delete(mainTabId);
      if (previous?.tabIds.size === 0) groups.delete(previousGroupId);
    }
    const current = groups.get(chromeGroupId);
    const group = current ?? {
      chromeGroupId,
      mainTabId,
      tabIds: /* @__PURE__ */ new Set(),
      isUnmanaged: false
    };
    group.tabIds.add(mainTabId);
    tabToGroup.set(mainTabId, chromeGroupId);
    groups.set(chromeGroupId, group);
    return group;
  }
  function onTabGroupChanged(tabId, changeInfo, tab) {
    if (!Object.hasOwn(changeInfo, "groupId")) return;
    if (isGrouped(tab.groupId)) {
      rememberGroup(tab.groupId, tabId);
    } else {
      forgetTab(tabId);
    }
  }
  function forgetTab(tabId) {
    const groupId = tabToGroup.get(tabId);
    tabToGroup.delete(tabId);
    if (groupId === void 0) return;
    const group = groups.get(groupId);
    group?.tabIds.delete(tabId);
    if (group?.mainTabId === tabId) {
      group.mainTabId = [...group.tabIds][0];
    }
    if (group?.tabIds.size === 0) groups.delete(groupId);
  }
  function startTabGroupChangeListener() {
    if (listenerInstalled || !chrome.tabs?.onUpdated) return;
    chrome.tabs.onUpdated.addListener(onTabGroupChanged);
    listenerInstalled = true;
  }
  function stopTabGroupChangeListener() {
    if (!listenerInstalled || !chrome.tabs?.onUpdated?.removeListener) return;
    chrome.tabs.onUpdated.removeListener(onTabGroupChanged);
    listenerInstalled = false;
  }
  async function createGroup(tabId) {
    const chromeGroupId = await chrome.tabs.group({ tabIds: [tabId] });
    await chrome.tabGroups?.update?.(chromeGroupId, {
      title: GROUP_TITLE,
      color: "grey",
      collapsed: false
    });
    return rememberGroup(chromeGroupId, tabId);
  }
  async function createIsolatedGroup(panelTabId) {
    return createGroup(panelTabId);
  }
  async function findGroupByTab(tabId) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return null;
    }
    if (!isGrouped(tab.groupId)) return null;
    const known = groups.get(tab.groupId);
    if (known) {
      known.tabIds.add(tabId);
      tabToGroup.set(tabId, tab.groupId);
      return known;
    }
    const unmanaged = rememberGroup(tab.groupId, tabId);
    unmanaged.isUnmanaged = true;
    return unmanaged;
  }
  async function adoptOrphanedGroup(tabId, chromeGroupId) {
    const tabs = await chrome.tabs.query({ groupId: chromeGroupId });
    const group = rememberGroup(chromeGroupId, tabId);
    group.isUnmanaged = false;
    group.mainTabId = tabId;
    group.tabIds = new Set(tabs.flatMap((tab) => tab.id ? [tab.id] : []));
    for (const memberTabId of group.tabIds) {
      tabToGroup.set(memberTabId, chromeGroupId);
    }
    await chrome.tabGroups?.update?.(chromeGroupId, {
      title: GROUP_TITLE,
      color: "grey"
    });
  }
  async function clearAllGroups() {
    const tabIds = [...groups.values()].flatMap((group) => [...group.tabIds]);
    groups.clear();
    tabToGroup.clear();
    if (tabIds.length && chrome.tabs?.ungroup) {
      await chrome.tabs.ungroup(tabIds).catch(() => {
      });
    }
  }
  async function getMainTabId(tabId) {
    const group = await findGroupByTab(tabId);
    if (!group) return null;
    if (group.mainTabId) {
      try {
        await chrome.tabs.get(group.mainTabId);
        return group.mainTabId;
      } catch {
      }
    }
    const tabs = await chrome.tabs.query({ groupId: group.chromeGroupId });
    const main = tabs.find((tab) => tab.id)?.id ?? null;
    if (main) group.mainTabId = main;
    return main;
  }
  async function handleTabClosed(tabId) {
    forgetTab(tabId);
  }
  async function dismissStaticIndicatorsForGroup(groupId) {
    const tabs = await chrome.tabs.query({ groupId });
    await Promise.allSettled(
      tabs.flatMap(
        (tab) => tab.id ? [
          chrome.tabs.sendMessage(tab.id, {
            type: "DISMISS_STATIC_INDICATOR"
          })
        ] : []
      )
    );
  }
  async function setStatusPrefix(chromeGroupId, prefix, requiredPrefix) {
    if (!Number.isInteger(chromeGroupId) || !chrome.tabGroups?.get) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const title = (await chrome.tabGroups.get(chromeGroupId)).title ?? "";
        if (requiredPrefix && !title.startsWith(requiredPrefix)) return;
        if (prefix && title.startsWith(prefix)) return;
        if (!prefix && !STATUS_PREFIX.test(title)) return;
        const bare = title.replace(STATUS_PREFIX, "").trim() || GROUP_TITLE;
        await chrome.tabGroups.update(chromeGroupId, {
          title: prefix ? `${prefix}${bare}` : bare
        });
        return;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    }
  }
  const setAgentStatus = (chromeGroupId, status) => {
    if (status === "working") return setStatusPrefix(chromeGroupId, "⌛");
    if (status === "permission") return setStatusPrefix(chromeGroupId, "🔔");
    if (status === "done") return setStatusPrefix(chromeGroupId, "✅");
    return setStatusPrefix(chromeGroupId, null);
  };
  return {
    initialize,
    setStatusPrefix,
    setAgentStatus,
    startTabGroupChangeListener,
    stopTabGroupChangeListener,
    createIsolatedGroup,
    findGroupByTab,
    createGroup,
    adoptOrphanedGroup,
    clearAllGroups,
    getMainTabId,
    handleTabClosed,
    dismissStaticIndicatorsForGroup
  };
}
function isGrouped(groupId) {
  return Number.isInteger(groupId) && groupId !== NO_GROUP;
}

// src/background/production-dependencies.js
var CONWAY_GET_STATUS = "conwayGetStatus";
var sessionGroups = /* @__PURE__ */ new Map();
function createProductionBackgroundDependencies() {
  const tabGroupManager = createTabGroupManager();
  const debuggerRelay = createDebuggerRelay();
  const browserTools = createBrowserToolExecutor({
    debuggerRelay,
    tabGroupManager,
    ensureOffscreenDocument
  });
  tabGroupManager.startTabGroupChangeListener();
  return {
    storageKeys: BACKGROUND_STORAGE_KEYS,
    setStorageValue,
    getStorageValue,
    removeStorageValue,
    isFeatureEnabled,
    executeTool: browserTools.executeTool,
    registerCapturedImage: browserTools.registerCapturedImage,
    makeToolErrorResult,
    tabGroupManager,
    debuggerRelay,
    bindSessionToTabGroup(session, tabGroupId) {
      if (session?.sessionId) sessionGroups.set(session.sessionId, tabGroupId);
    },
    async clearAllLoadingIndicators() {
      const tabs = await chrome.tabs.query({});
      await Promise.allSettled(
        tabs.flatMap(
          (tab) => tab.id ? [
            chrome.tabs.sendMessage(tab.id, {
              type: "HIDE_AGENT_INDICATORS"
            })
          ] : []
        )
      );
    },
    trackAnalytics: () => {
    },
    scheduledTaskSuccessProps: (taskId, executionType) => ({
      task_id: taskId,
      success: true,
      execution_type: executionType
    }),
    scheduledTaskFailureProps: (taskId, executionType, error) => ({
      task_id: taskId,
      success: false,
      execution_type: executionType,
      error_name: error instanceof Error ? error.name : typeof error
    }),
    initAnalytics: async () => {
    },
    refreshAnalyticsProfile: async () => {
    },
    invalidateAnalyticsUser: () => {
    },
    bumpAnalyticsProfileGeneration: () => {
    },
    getExtensionConfig: () => ({
      apiBaseUrl: REDROB_API_BASE_URL,
      localBridge: false
    }),
    ensureOffscreenDocument,
    installBridgeKeepaliveAlarms: () => {
    },
    installToolNavigationGuard() {
      chrome.webNavigation?.onBeforeNavigate?.addListener((details) => {
        if (details.frameId === 0) void debuggerRelay.detach(details.tabId);
      });
    },
    connectBridgeWebSocket: async () => false,
    closeBridgeWebSocket: () => {
    },
    isBridgeWebSocketOpen: () => false,
    sendBridgeNotification: () => false,
    bumpBridgeGenerationAndDetach: () => {
      void debuggerRelay.detachAll();
    },
    getAccountUuid: async () => void 0,
    savedPromptsService: createSavedPromptsService(),
    cicIframeMessageTypes: CIC_IFRAME_BRIDGE_MESSAGE_TYPES,
    conwayMessageTypes: { GET_STATUS: CONWAY_GET_STATUS },
    getConwayStatus: () => ({
      state: "disabled",
      connected: false,
      reason: "API-key browser mode does not use Conway."
    }),
    getConwayContainerId: async () => null,
    initConwayConnection: async () => false,
    resetConwayConnection: () => {
    },
    handleConwayNotificationClick: async (notificationId) => {
      await chrome.notifications.clear(notificationId);
    },
    handleConwayNotificationClosed: () => {
    },
    getOnboardingPromptText,
    getDefaultLocale,
    localeDisplayNames: LOCALE_LABELS,
    availableLocales: SUPPORTED_LOCALES
  };
}
async function ensureOffscreenDocument() {
  if (!chrome.offscreen?.createDocument) return;
  if (chrome.offscreen.hasDocument && await chrome.offscreen.hasDocument()) {
    return;
  }
  try {
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: [
        chrome.offscreen.Reason.AUDIO_PLAYBACK,
        chrome.offscreen.Reason.BLOBS
      ].filter(Boolean),
      justification: "Play browser-agent audio and generate GIF blobs."
    });
  } catch (error) {
    if (!String(error).includes("Only a single offscreen document")) {
      throw error;
    }
  }
}
function createSavedPromptsService() {
  return {
    async getAllPrompts() {
      const stored = await chrome.storage.local.get("savedPrompts");
      return Array.isArray(stored.savedPrompts) ? stored.savedPrompts : [];
    },
    async updateAlarmForPrompt(prompt) {
      if (!prompt?.id || !prompt.nextRunAt) return;
      await chrome.alarms.create(prompt.id, {
        when: new Date(prompt.nextRunAt).getTime()
      });
    },
    async updateNextRunTimes() {
    }
  };
}
function getDefaultLocale() {
  const browserLocale = globalThis.navigator?.language ?? "en-US";
  if (SUPPORTED_LOCALES.includes(browserLocale)) return browserLocale;
  const language = browserLocale.split("-")[0];
  return SUPPORTED_LOCALES.find((locale) => locale.startsWith(`${language}-`)) ?? "en-US";
}

// src/background/background-entry.js
bootstrapBackgroundServiceWorker(createProductionBackgroundDependencies());
//# sourceMappingURL=service-worker.js.map
