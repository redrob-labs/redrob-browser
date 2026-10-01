// src/content/phantom-cursor.js
var SVG_NS = "http://www.w3.org/2000/svg";
function createCursorPath(attrs) {
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M0 0 L0 18 L4.5 14 L7.5 21.5 L11 20 L8 13 L14 13 Z");
  for (const [key, value] of Object.entries(attrs)) {
    path.setAttribute(key, value);
  }
  return path;
}
function createCursorSvg(id, strokeAndOuterFill, innerFill, extraCss) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.id = id;
  svg.setAttribute("width", "20");
  svg.setAttribute("height", "26");
  svg.setAttribute("viewBox", "0 0 20 26");
  svg.style.cssText = `position:absolute; top:0; left:0; overflow:visible; ${extraCss}`;
  svg.appendChild(
    createCursorPath({
      stroke: strokeAndOuterFill,
      "stroke-width": "3",
      "stroke-linejoin": "round",
      fill: strokeAndOuterFill
    })
  );
  svg.appendChild(createCursorPath({ fill: innerFill }));
  return svg;
}
function createPhantomCursor(xCoordinate, yCoordinate) {
  const container = document.createElement("div");
  container.id = "redrob-phantom-cursor";
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      pointer-events: none;
      z-index: 2147483646;
      transform: translate3d(${xCoordinate}px, ${yCoordinate}px, 0);
      transition: transform 180ms cubic-bezier(0.2, 0, 0, 1);
      will-change: transform;
    `;
  const plain = createCursorSvg(
    "redrob-phantom-cursor-plain",
    "white",
    "#111",
    ""
  );
  const styled = createCursorSvg(
    "redrob-phantom-cursor-styled",
    "#2B52FF",
    "#FAF9F5",
    "filter: drop-shadow(0 0 4px rgba(43,82,255,0.9)) drop-shadow(0 0 10px rgba(43,82,255,0.45));"
  );
  container.appendChild(plain);
  container.appendChild(styled);
  return { container, styled };
}
function updatePhantomCursor(state, xCoordinate, yCoordinate) {
  const alreadyAtPosition = state.phantomCursorContainer !== null && xCoordinate === state.displayedCursorX && yCoordinate === state.displayedCursorY;
  state.lastCursorX = xCoordinate;
  state.lastCursorY = yCoordinate;
  if (!state.agentIndicatorsActive) return Promise.resolve();
  if (!state.phantomCursorContainer) {
    if (document.hidden) return Promise.resolve();
    const { container, styled } = createPhantomCursor(xCoordinate, yCoordinate);
    state.phantomCursorContainer = container;
    state.phantomCursorStyled = styled;
    document.body.appendChild(state.phantomCursorContainer);
    state.displayedCursorX = xCoordinate;
    state.displayedCursorY = yCoordinate;
    return Promise.resolve();
  }
  state.phantomCursorContainer.style.transform = `translate3d(${xCoordinate}px, ${yCoordinate}px, 0)`;
  state.displayedCursorX = xCoordinate;
  state.displayedCursorY = yCoordinate;
  if (alreadyAtPosition || document.hidden) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      state.phantomCursorContainer?.removeEventListener(
        "transitionend",
        finish
      );
      resolve();
    };
    state.phantomCursorContainer.addEventListener("transitionend", finish, {
      once: true
    });
    setTimeout(finish, 220);
  });
}
function removePhantomCursor(state) {
  if (state.phantomCursorContainer && state.phantomCursorContainer.parentNode) {
    state.phantomCursorContainer.parentNode.removeChild(
      state.phantomCursorContainer
    );
  }
  state.phantomCursorContainer = null;
  state.phantomCursorStyled = null;
}

// src/content/glow-border.js
function ensureAgentAnimationStyles() {
  if (document.getElementById("redrob-agent-animation-styles")) return;
  const style = document.createElement("style");
  style.id = "redrob-agent-animation-styles";
  style.textContent = `
      @keyframes redrob-pulse {
        0%, 100% { opacity: 0.6; }
        50% { opacity: 1; }
      }
      #redrob-agent-glow-border-inner {
        animation: redrob-pulse 2s ease-in-out infinite;
      }
      @media (prefers-reduced-motion: reduce) {
        #redrob-agent-glow-border-inner {
          animation: none;
        }
      }
    `;
  document.head.appendChild(style);
}
function createGlowBorderElement() {
  const outer = document.createElement("div");
  outer.id = "redrob-agent-glow-border";
  outer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      pointer-events: none;
      z-index: 2147483646;
      opacity: 0;
      transition: opacity 0.3s ease-in-out;
    `;
  const inner = document.createElement("div");
  inner.id = "redrob-agent-glow-border-inner";
  inner.style.cssText = `
      position: absolute;
      inset: 0;
      will-change: opacity;
      box-shadow: ${ATTENDED_GLOW};
    `;
  outer.appendChild(inner);
  return outer;
}
var ATTENDED_GLOW = `
        inset 0 0 15px rgba(43, 82, 255, 0.7),
        inset 0 0 25px rgba(43, 82, 255, 0.5),
        inset 0 0 35px rgba(43, 82, 255, 0.2)`;
var UNATTENDED_GLOW = `
        inset 0 0 15px rgba(245, 176, 24, 0.7),
        inset 0 0 25px rgba(245, 176, 24, 0.5),
        inset 0 0 35px rgba(245, 176, 24, 0.2)`;
function setGlowBorderMode(state, unattended) {
  const inner = state.glowBorderElement?.firstElementChild;
  if (!inner) return;
  inner.style.border = unattended ? "2px dashed rgba(245, 176, 24, 0.95)" : "";
  inner.style.boxShadow = unattended ? UNATTENDED_GLOW : ATTENDED_GLOW;
}
function showGlowBorder(state) {
  ensureAgentAnimationStyles();
  if (state.glowBorderElement) {
    state.glowBorderElement.style.display = "";
  } else {
    state.glowBorderElement = createGlowBorderElement();
    document.body.appendChild(state.glowBorderElement);
  }
  setGlowBorderMode(state, state.unattended === true);
  requestAnimationFrame(() => {
    if (state.glowBorderElement) {
      state.glowBorderElement.style.opacity = "1";
    }
  });
}
function fadeOutGlowBorder(state) {
  if (state.agentIndicatorsActive || state.staticIndicatorActive) return;
  if (state.glowBorderElement) {
    state.glowBorderElement.style.opacity = "0";
  }
  setTimeout(() => {
    if (state.agentIndicatorsActive || state.staticIndicatorActive) return;
    if (state.glowBorderElement && state.glowBorderElement.parentNode) {
      state.glowBorderElement.parentNode.removeChild(state.glowBorderElement);
      state.glowBorderElement = null;
    }
  }, 300);
}

// src/content/audio-keepalive.js
function ensureAudioContextKeepalive(state) {
  try {
    if (!state.audioContext) {
      state.audioContext = new AudioContext();
      const gain = state.audioContext.createGain();
      gain.gain.value = 0;
      gain.connect(state.audioContext.destination);
      const constantSource = state.audioContext.createConstantSource();
      constantSource.connect(gain);
      constantSource.start();
      state.audioContext.addEventListener("statechange", () => {
      });
      document.addEventListener(
        "pointerdown",
        () => {
          if (state.agentIndicatorsActive) {
            state.audioContext?.resume().catch(() => {
            });
          }
        },
        { capture: true }
      );
    }
    state.audioContext.resume().catch(() => {
    });
  } catch {
  }
}
function suspendAudioContextKeepalive(state) {
  state.audioContext?.suspend().catch(() => {
  });
}
function closeAudioContextKeepalive(state) {
  state.audioContext?.close().catch(() => {
  });
  state.audioContext = null;
}

// src/i18n/first-party-copy.js
var COPY = {
  "en-US": {
    locale: "en-US",
    getKey: "Get API key",
    apiKeyLabel: "API key",
    apiKeyPlaceholder: "e.g. rrk_a1b2c3d4e5f6",
    settingsTitle: "API key",
    settingsBody: "Change the key Redrob uses for this browser.",
    settingsHint: "A key is already saved. Enter a new one to replace it.",
    accountTitle: "Account",
    accountBody: "Manage the API key connected to this browser.",
    apiKeyHelp: "Paste a Redrob API key issued from the console.",
    savedKeyLabel: "Saved key",
    keyConnected: "Connected",
    keyNotConfigured: "Not configured",
    deleteKey: "Delete key",
    dangerTitle: "Remove API key",
    dangerBody: "Deleting the key disables chat until another key is saved.",
    deleteTitle: "Delete this API key?",
    deleteBody: "Redrob will stop working in this browser until you add another key.",
    deleteConfirm: "Delete key",
    cancel: "Cancel",
    deleted: "The API key was deleted.",
    permissionGranted: "Allowed",
    permissionBlocked: "Blocked",
    permissionNotRequested: "Not requested",
    saveKey: "Save API key",
    checking: "Checking...",
    keyRejected: "That key was rejected. Check it and try again.",
    keyUnreachable: "Could not reach Redrob. Try again in a moment.",
    saving: "Saving...",
    saved: "Saved. New chats will use this key.",
    onboardingTitle: "Redrob can now control your browser",
    onboardingBody: "It acts in your browser on your behalf.",
    onboardingRiskInjection: "Pages can hide instructions that trick it.",
    onboardingRiskPrivacy: "It reads your tabs and takes screenshots.",
    onboardingRiskOversight: "Keep an eye on it and stop anything wrong.",
    onboardingAccept: "I understand",
    allowOnce: "Allow once",
    allowSite: (host) => `Always allow on ${host}`,
    approvedSitesTitle: "Approved sites",
    approvedSitesBody: "Redrob acts on these sites without asking. Everything else still prompts.",
    approvedSitesEmpty: "No sites approved yet.",
    revokeSite: "Revoke",
    moreOptions: "More options",
    exportConversation: "Export conversation",
    copyMessage: "Copy message",
    copied: "Copied",
    memoryTitle: "Memory",
    memoryBody: "Facts Redrob has kept about you. They stay on this machine and ride along with your requests.",
    memoryEmpty: "Nothing remembered yet.",
    memoryClear: "Forget everything",
    instructionsTitle: "Global instructions",
    instructionsBody: "Customize the instructions given to Redrob for browser automation tasks.",
    instructionsPlaceholder: "Always prefer keyboard navigation over clicking.",
    instructionsSave: "Save instructions",
    modelTitle: "Model",
    modelBody: "Choose the model Redrob uses for new messages.",
    permissionModeTitle: "Asking before acting",
    permissionModeBody: "Reads never interrupt. Choose what happens when Redrob wants to change a page.",
    permissionModeAsk: "Ask before acting",
    permissionAskBody: "Redrob asks before it changes anything on a page.",
    permissionAutoBody: "Redrob works without pausing for approval.",
    togglePermissionMode: "Toggle permission mode",
    permissionModeAuto: "Act without asking",
    navAccount: "Account",
    navPermissions: "Permissions",
    navShortcuts: "Shortcuts",
    navOptions: "Options",
    keyboardShortcutTitle: "Keyboard shortcut",
    keyboardShortcutBody: "Configure the keyboard shortcut used to open Redrob in Browser.",
    openSidePanel: "Open side panel",
    currentShortcut: "Current shortcut",
    noShortcut: "No shortcut configured",
    configure: "Configure",
    permissionsTitle: "Permissions",
    permissionsBody: "Control the browser capabilities Redrob can use.",
    notificationsTitle: "Notifications",
    notificationsBody: "Show a notification when an agent task finishes.",
    notificationsBlocked: "Chrome is blocking notifications for this extension. Allow them in Chrome settings first.",
    microphoneTitle: "Microphone",
    microphoneBody: "Allow voice input in the side panel.",
    appearanceTitle: "Appearance",
    appearanceBody: "Choose how Redrob looks in this browser.",
    appearanceLabels: { system: "System", light: "Light", dark: "Dark" },
    languageTitle: "Language",
    languageBody: "Choose your preferred language for the extension interface.",
    shortcutsTitle: "Shortcuts",
    shortcutsBody: "Save prompts you reuse, then run one by typing / in the chat.",
    shortcutsEmpty: "Create your first shortcut to get started.",
    shortcutName: "Name",
    shortcutNamePlaceholder: "summarize",
    shortcutPrompt: "Prompt",
    shortcutPromptPlaceholder: "Summarize this page in five bullet points.",
    shortcutCreate: "Create shortcut",
    shortcutSave: "Save shortcut",
    shortcutEdit: "Edit",
    shortcutDelete: "Delete",
    keyNoticeTitle: "Add an API key to start working",
    keyNoticeAction: "Add key",
    connectTitle: "Connect Redrob",
    connectBody: "Add a Redrob API key to use the browser agent.",
    connect: "Connect",
    connected: "Connected.",
    connectPrimary: "Connect to Redrob",
    connectStarting: "Starting the connection...",
    connectEnterCode: "In the tab that opened, enter this code to approve:",
    connectWaiting: "Waiting for you to approve in the browser tab.",
    connectUnreachable: "Cannot reach the Console right now. Still trying, leave this open.",
    connectDenied: "The request was refused. You can try again.",
    connectExpired: "The code expired. Start the connection again.",
    connectFailed: "The connection could not be completed. Try again.",
    connectConnected: "Connected. This browser now has a key.",
    connectCancel: "Cancel",
    connectRetry: "Try again",
    connectPasteInstead: "Paste a key instead",
    emptyTitle: "Ask Redrob to work in your browser.",
    emptyBody: "Redrob reads the page, clicks and types for you, and pulls answers out of your open tabs.",
    composerPlaceholder: "Message Redrob",
    composerHint: "Enter to send · Shift+Enter for a new line",
    sendMessage: "Send message",
    stopGenerating: "Stop generating",
    stopAgent: "Stop Redrob",
    newChat: "New chat",
    settings: "Settings",
    thinking: "Thinking",
    stopped: "Stopped.",
    iterationLimit: "Stopped after the maximum number of steps.",
    engineRunning: "Running this turn on the Redrob Code engine.",
    engineNoBrowserTools: "The Redrob Code engine runs its own tools on the machine hosting it, so the browser tools were not available for this turn.",
    engineUnreachable: (message) => `Could not reach the Redrob Code engine: ${message}`,
    engineRequired: "The local Redrob Code engine is required for chat and is not reachable. Install Redrob Code, start it with 'redrob serve', or install the Redrob native host that starts it for you, then try again.",
    iterationLimitPrompt: "You have used all available tool steps. Answer now with what you have, and say plainly what is still unfinished.",
    rawResult: "Raw result",
    hideRawResult: "Hide raw result",
    stepsFailed: "failed",
    workedInBrowser: "Worked in the browser",
    stepCount: (count) => `${count} ${count === 1 ? "step" : "steps"}`,
    // A denied step is not a failure of the tool. AgentAction has no denied state,
    // so it takes the error ground and this label keeps the two apart.
    toolStatusLabels: {
      running: "Running",
      done: "Done",
      error: "Failed",
      denied: "Not allowed"
    },
    stepFailures: (count) => `${count} ${count === 1 ? "step" : "steps"} did not run`,
    allowActionSuffix: "?",
    allowActionBody: (toolName) => `Redrob wants to run ${toolName} on this page.`,
    deny: "Deny",
    alwaysAllow: "Always allow",
    allow: "Allow",
    toolLabels: {
      tabs_context: "Listing tabs",
      tabs_create: "Opening a tab",
      tabs_close: "Closing tabs",
      navigate: "Navigating",
      read_page: "Reading the page",
      get_page_text: "Reading page text",
      find: "Searching the page",
      form_input: "Filling a field",
      javascript_tool: "Running JavaScript",
      read_console_messages: "Reading the console",
      read_network_requests: "Reading network activity",
      resize_window: "Resizing the window",
      gif_creator: "Recording a GIF",
      upload_image: "Attaching an image",
      browser_batch: "Running browser actions",
      memory_write: "Remembering something",
      memory_search: "Searching memory",
      memory_delete: "Forgetting something"
    },
    computerLabels: {
      left_click: "Clicking",
      right_click: "Right-clicking",
      double_click: "Double-clicking",
      triple_click: "Selecting text",
      left_click_drag: "Dragging",
      hover: "Hovering",
      type: "Typing",
      key: "Pressing a key",
      screenshot: "Taking a screenshot",
      scroll: "Scrolling",
      scroll_to: "Scrolling to an element",
      zoom: "Zooming in",
      wait: "Waiting"
    },
    usingThePage: "Using the page",
    runningTool: (toolName) => `Running ${toolName}`,
    navigatingTo: (url) => `Navigating to ${url}`,
    searchingFor: (query) => `Searching for “${query}”`,
    uploadImage: "Upload image",
    removeAttachment: "Remove attachment",
    uploadTypeError: "File type not supported. Please upload an image (PNG, JPG, GIF, or WebP).",
    uploadFailed: "Upload failed.",
    startRecording: "Start recording",
    stopRecording: "Stop recording and save GIF",
    recordingHint: "Recording — Redrob's actions are being captured as a GIF.",
    recordingFailed: "Recording could not be started.",
    // A-5: what the agent can already act in. One entry per group in
    // src/chat/capabilities.js, which refuses to load if the two drift apart.
    capabilityTitle: "What it can do in this browser",
    tryPrompt: "Try this",
    capabilityReadNote: "Looks only. These never change anything.",
    capabilityWriteNote: "Acts. Each one asks you first.",
    capabilityLabels: {
      reading: "Read the page and your tabs",
      inspecting: "Read the console and network",
      capturing: "Record the screen",
      browsing: "Open, close and go to pages",
      acting: "Fill in forms and click",
      running: "Run code on a page",
      window: "Resize the window and send files"
    },
    capabilityPrompts: {
      reading: "What does this page say about pricing?",
      inspecting: "Any errors in the console on this page?",
      capturing: "Record a short clip of this page scrolling.",
      browsing: "Open the three links in this list, each in its own tab.",
      acting: "Fill this form with my details and stop before submitting.",
      running: "Count every image on this page that has no alt text.",
      window: "Make the window phone-sized and show me what breaks."
    },
    starterPrompts: [
      {
        title: "Summarize this page",
        prompt: "Summarize the page in the current tab. Key points only, in a short list."
      },
      {
        title: "Pull it into a table",
        prompt: "Collect the key information on this page into a table I can copy."
      },
      {
        title: "Compare my open tabs",
        prompt: "Compare the pages in my open tabs and tell me how they differ."
      },
      {
        title: "Fill out this form",
        prompt: "Fill out the form on this page with realistic sample values, but do not submit it."
      }
    ]
  },
  "ko-KR": {
    locale: "ko-KR",
    getKey: "API 키 발급받기",
    apiKeyLabel: "API 키",
    apiKeyPlaceholder: "예: rrk_a1b2c3d4e5f6",
    settingsTitle: "API 키",
    settingsBody: "이 브라우저에서 레드롭이 사용하는 키를 변경하세요.",
    settingsHint: "이미 저장된 키가 있습니다. 새 키를 입력하면 교체됩니다.",
    accountTitle: "계정",
    accountBody: "이 브라우저에 연결된 API 키를 관리합니다.",
    apiKeyHelp: "레드롭 콘솔에서 발급받은 API 키를 붙여 넣으세요.",
    savedKeyLabel: "저장된 키",
    keyConnected: "연결됨",
    keyNotConfigured: "미설정",
    deleteKey: "키 삭제",
    dangerTitle: "API 키 삭제",
    dangerBody: "키를 삭제하면 새 키를 저장하기 전까지 채팅을 사용할 수 없습니다.",
    deleteTitle: "이 API 키를 삭제할까요?",
    deleteBody: "다른 키를 추가하기 전까지 이 브라우저에서 레드롭을 사용할 수 없습니다.",
    deleteConfirm: "키 삭제",
    cancel: "취소",
    deleted: "API 키를 삭제했습니다.",
    permissionGranted: "허용됨",
    permissionBlocked: "차단됨",
    permissionNotRequested: "미요청",
    saveKey: "API 키 저장",
    checking: "확인 중...",
    keyRejected: "이 키는 거부됐어요. 다시 확인해 주세요.",
    keyUnreachable: "레드롭에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
    saving: "저장 중...",
    saved: "저장되었습니다. 다음 대화부터 이 키를 사용합니다.",
    onboardingTitle: "이제 레드롭이 브라우저를 제어할 수 있습니다",
    onboardingBody: "브라우저에서 사용자를 대신해 작업합니다.",
    onboardingRiskInjection: "페이지에 숨은 지침이 에이전트를 속일 수 있어요.",
    onboardingRiskPrivacy: "열린 탭을 읽고 스크린샷을 찍습니다.",
    onboardingRiskOversight: "하는 일을 지켜보고, 이상하면 멈춰 주세요.",
    onboardingAccept: "이해했습니다",
    allowOnce: "이번만 허용",
    allowSite: (host) => `${host}에서 항상 허용`,
    approvedSitesTitle: "허용한 사이트",
    approvedSitesBody: "이 사이트에서는 묻지 않고 실행합니다. 나머지는 계속 확인합니다.",
    approvedSitesEmpty: "아직 허용한 사이트가 없습니다.",
    revokeSite: "해제",
    moreOptions: "더 많은 옵션",
    exportConversation: "대화 내보내기",
    copyMessage: "메시지 복사",
    copied: "복사됨",
    memoryTitle: "기억",
    memoryBody: "레드롭이 기억하고 있는 내용입니다. 이 컴퓨터에만 저장되고, 요청을 보낼 때 함께 전달됩니다.",
    memoryEmpty: "아직 기억한 내용이 없습니다.",
    memoryClear: "전부 지우기",
    instructionsTitle: "전역 지침",
    instructionsBody: "브라우저 자동화 작업에서 레드롭이 따를 지침을 직접 정합니다.",
    instructionsPlaceholder: "가능하면 클릭보다 키보드 이동을 쓰세요.",
    instructionsSave: "지침 저장",
    modelTitle: "모델",
    modelBody: "새 메시지에 사용할 모델을 고르세요.",
    permissionModeTitle: "실행 전 확인",
    permissionModeBody: "읽기 작업은 묻지 않습니다. 페이지를 바꾸려 할 때 어떻게 할지 고르세요.",
    permissionModeAsk: "실행 전 확인",
    permissionAskBody: "페이지를 바꾸기 전에 레드롭이 먼저 확인합니다.",
    permissionAutoBody: "레드롭이 승인 대기 없이 작업합니다.",
    togglePermissionMode: "권한 모드 전환",
    permissionModeAuto: "묻지 않고 실행",
    navAccount: "계정",
    navPermissions: "권한",
    navShortcuts: "단축어",
    navOptions: "옵션",
    keyboardShortcutTitle: "키보드 단축키",
    keyboardShortcutBody: "브라우저용 레드롭을 여는 키보드 단축키를 설정합니다.",
    openSidePanel: "사이드 패널 열기",
    currentShortcut: "현재 단축키",
    noShortcut: "설정된 단축키가 없습니다",
    configure: "설정",
    permissionsTitle: "권한",
    permissionsBody: "레드롭이 사용할 수 있는 브라우저 기능을 관리합니다.",
    notificationsTitle: "알림",
    notificationsBody: "에이전트 작업이 끝나면 알림을 표시합니다.",
    notificationsBlocked: "크롬이 이 확장 프로그램의 알림을 차단하고 있습니다. 크롬 설정에서 먼저 허용해 주세요.",
    microphoneTitle: "마이크",
    microphoneBody: "사이드패널에서 음성 입력을 허용합니다.",
    appearanceTitle: "화면 모드",
    appearanceBody: "이 브라우저에서 레드롭을 어떻게 보여줄지 고르세요.",
    appearanceLabels: { system: "시스템", light: "라이트", dark: "다크" },
    languageTitle: "언어",
    languageBody: "확장 프로그램 인터페이스에 사용할 언어를 선택하세요.",
    shortcutsTitle: "단축어",
    shortcutsBody: "자주 쓰는 프롬프트를 저장해 두고, 대화에서 /를 입력해 바로 부르세요.",
    shortcutsEmpty: "첫 단축어를 만들어 보세요.",
    shortcutName: "이름",
    shortcutNamePlaceholder: "요약",
    shortcutPrompt: "프롬프트",
    shortcutPromptPlaceholder: "이 페이지를 다섯 줄로 요약해 주세요.",
    shortcutCreate: "단축어 만들기",
    shortcutSave: "저장",
    shortcutEdit: "수정",
    shortcutDelete: "삭제",
    keyNoticeTitle: "작업을 시작하려면 API 키를 입력하세요",
    keyNoticeAction: "키 입력",
    connectTitle: "레드롭 연결",
    connectBody: "브라우저 에이전트를 사용하려면 레드롭 API 키를 입력하세요.",
    connect: "연결",
    connected: "연결되었습니다.",
    connectPrimary: "레드롭에 연결",
    connectStarting: "연결을 시작하는 중입니다...",
    connectEnterCode: "열린 탭에서 이 코드를 입력해 승인하세요:",
    connectWaiting: "브라우저 탭에서 승인하기를 기다리는 중입니다.",
    connectUnreachable: "지금 콘솔에 연결할 수 없습니다. 계속 시도 중이니 이 화면을 열어 두세요.",
    connectDenied: "요청이 거부되었습니다. 다시 시도할 수 있습니다.",
    connectExpired: "코드가 만료되었습니다. 연결을 다시 시작하세요.",
    connectFailed: "연결을 완료하지 못했습니다. 다시 시도하세요.",
    connectConnected: "연결되었습니다. 이제 이 브라우저에 키가 있습니다.",
    connectCancel: "취소",
    connectRetry: "다시 시도",
    connectPasteInstead: "대신 키 붙여넣기",
    emptyTitle: "브라우저 작업을 레드롭에게 맡겨보세요.",
    emptyBody: "페이지를 읽고, 대신 클릭하고 입력하고, 열려 있는 탭에서 필요한 답을 찾아옵니다.",
    composerPlaceholder: "레드롭에게 메시지",
    composerHint: "Enter로 전송 · Shift+Enter로 줄바꿈",
    sendMessage: "메시지 보내기",
    stopGenerating: "생성 중지",
    stopAgent: "레드롭 중지",
    newChat: "새 대화",
    settings: "설정",
    thinking: "생각하는 중",
    stopped: "중지했습니다.",
    iterationLimit: "최대 단계 수에 도달해 중단했습니다.",
    engineRunning: "이번 턴은 레드롭 코드 엔진에서 실행합니다.",
    engineNoBrowserTools: "레드롭 코드 엔진은 엔진이 실행되는 컴퓨터에서 자체 도구를 사용하므로, 이번 턴에서는 브라우저 도구를 쓸 수 없었습니다.",
    engineUnreachable: (message) => `레드롭 코드 엔진에 연결할 수 없습니다: ${message}`,
    engineRequired: "채팅에는 로컬 레드롭 코드 엔진이 필요하지만 연결할 수 없습니다. 레드롭 코드를 설치한 뒤 'redrob serve'로 실행하거나, 엔진을 대신 실행해 주는 레드롭 네이티브 호스트를 설치한 다음 다시 시도하세요.",
    iterationLimitPrompt: "사용할 수 있는 도구 단계를 모두 소진했습니다. 지금까지 확인한 내용으로 답하고, 아직 끝내지 못한 부분을 분명히 알려 주세요.",
    rawResult: "원본 결과",
    hideRawResult: "원본 결과 숨기기",
    stepsFailed: "실패",
    workedInBrowser: "브라우저에서 작업함",
    stepCount: (count) => `${count}단계`,
    toolStatusLabels: {
      running: "실행 중",
      done: "완료",
      error: "실패",
      denied: "허용하지 않음"
    },
    stepFailures: (count) => `${count}단계가 실행되지 않음`,
    allowActionSuffix: "할까요?",
    allowActionBody: (toolName) => `레드롭이 이 페이지에서 ${toolName}을(를) 실행하려고 합니다.`,
    deny: "거부",
    alwaysAllow: "항상 허용",
    allow: "허용",
    toolLabels: {
      tabs_context: "탭 목록 확인",
      tabs_create: "새 탭 열기",
      tabs_close: "탭 닫기",
      navigate: "페이지 이동",
      read_page: "페이지 읽기",
      get_page_text: "페이지 텍스트 읽기",
      find: "페이지에서 찾기",
      form_input: "입력란 채우기",
      javascript_tool: "JavaScript 실행",
      read_console_messages: "콘솔 읽기",
      read_network_requests: "네트워크 기록 읽기",
      resize_window: "창 크기 조절",
      gif_creator: "GIF 녹화",
      upload_image: "이미지 첨부",
      browser_batch: "브라우저 작업 실행",
      memory_write: "기억하는 중",
      memory_search: "기억 검색",
      memory_delete: "기억 삭제"
    },
    computerLabels: {
      left_click: "클릭",
      right_click: "우클릭",
      double_click: "더블클릭",
      triple_click: "텍스트 선택",
      left_click_drag: "드래그",
      hover: "마우스 올리기",
      type: "입력",
      key: "키 입력",
      screenshot: "스크린샷 촬영",
      scroll: "스크롤",
      scroll_to: "요소로 스크롤",
      zoom: "확대",
      wait: "대기"
    },
    usingThePage: "페이지 조작",
    runningTool: (toolName) => `${toolName} 실행`,
    navigatingTo: (url) => `${url}로 이동`,
    searchingFor: (query) => `“${query}” 검색`,
    uploadImage: "이미지 업로드",
    removeAttachment: "첨부 제거",
    uploadTypeError: "지원하지 않는 파일 형식입니다. 이미지(PNG, JPG, GIF, WebP)를 올려주세요.",
    uploadFailed: "업로드하지 못했습니다.",
    startRecording: "녹화 시작",
    stopRecording: "녹화 종료하고 GIF 저장",
    recordingHint: "녹화 중 — 레드롭의 동작을 GIF로 담고 있습니다.",
    recordingFailed: "녹화를 시작하지 못했습니다.",
    capabilityTitle: "이 브라우저에서 할 수 있는 일",
    tryPrompt: "이걸 시켜보기",
    capabilityReadNote: "보기만 합니다. 아무것도 바꾸지 않습니다.",
    capabilityWriteNote: "실제로 행동합니다. 할 때마다 먼저 묻습니다.",
    capabilityLabels: {
      reading: "페이지와 탭 읽기",
      inspecting: "콘솔과 네트워크 읽기",
      capturing: "화면 녹화",
      browsing: "페이지 열기, 닫기, 이동",
      acting: "양식 채우기와 클릭",
      running: "페이지에서 코드 실행",
      window: "창 크기 바꾸기와 파일 보내기"
    },
    capabilityPrompts: {
      reading: "이 페이지에서 가격에 대해 뭐라고 하나요?",
      inspecting: "이 페이지 콘솔에 오류가 있나요?",
      capturing: "이 페이지를 스크롤하는 짧은 영상으로 담아 주세요.",
      browsing: "이 목록의 링크 세 개를 각각 새 탭으로 열어 주세요.",
      acting: "이 양식을 내 정보로 채우고 제출 전에 멈춰 주세요.",
      running: "이 페이지에서 대체 텍스트가 없는 이미지를 모두 세어 주세요.",
      window: "창을 휴대폰 크기로 만들고 무엇이 깨지는지 보여 주세요."
    },
    starterPrompts: [
      {
        title: "이 페이지 요약",
        prompt: "지금 보고 있는 탭의 내용을 핵심만 짧게 정리해 주세요."
      },
      {
        title: "표로 정리",
        prompt: "이 페이지의 주요 정보를 복사해서 쓸 수 있게 표로 정리해 주세요."
      },
      {
        title: "열린 탭 비교",
        prompt: "열려 있는 탭들의 내용을 비교해서 차이를 알려주세요."
      },
      {
        title: "폼 채우기",
        prompt: "이 페이지의 입력 폼을 그럴듯한 예시 값으로 채워 주세요. 제출은 하지 마세요."
      }
    ]
  }
};
function firstPartyCopy(locale) {
  return COPY[locale] || COPY["en-US"];
}

// src/i18n/add-locales.js
var SUPPORTED_LOCALES = ["en-US", "ko-KR"];

// src/i18n/preferred-locale.js
function isKoreanLocale(locale) {
  return String(locale || "").toLowerCase().startsWith("ko");
}
async function resolveUiLocale() {
  const chromeApi = globalThis.chrome;
  if (!chromeApi?.storage?.local) {
    return navigatorLanguageToLocale();
  }
  const stored = await chromeApi.storage.local.get("preferred_locale");
  const preferred = stored.preferred_locale;
  if (SUPPORTED_LOCALES.includes(preferred)) {
    return preferred;
  }
  const fallback = navigatorLanguageToLocale();
  if (preferred) {
    await chromeApi.storage.local.set({ preferred_locale: fallback });
  }
  return fallback;
}
function navigatorLanguageToLocale() {
  return isKoreanLocale(globalThis.navigator?.language) ? "ko-KR" : "en-US";
}

// src/content/stop-agent-button.js
function createStopAgentButtonContainer(isAgentActive) {
  const container = document.createElement("div");
  container.id = "redrob-agent-stop-container";
  container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      justify-content: center;
      align-items: center;
      pointer-events: none;
      z-index: 2147483647;
    `;
  const button = document.createElement("button");
  button.id = "redrob-agent-stop-button";
  button.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor" style="margin-right: 12px; vertical-align: middle;">
        <path d="M128,20A108,108,0,1,0,236,128,108.12,108.12,0,0,0,128,20Zm0,192a84,84,0,1,1,84-84A84.09,84.09,0,0,1,128,212Zm40-112v56a12,12,0,0,1-12,12H100a12,12,0,0,1-12-12V100a12,12,0,0,1,12-12h56A12,12,0,0,1,168,100Z"></path>
      </svg>
      <span id="redrob-agent-stop-label" style="vertical-align: middle;">${firstPartyCopy("en-US").stopAgent}</span>
    `;
  void resolveUiLocale().then((locale) => {
    const label = button.querySelector("#redrob-agent-stop-label");
    if (label) label.textContent = firstPartyCopy(locale).stopAgent;
  });
  button.style.cssText = `
      position: relative;
      transform: translateY(100px);
      padding: 12px 16px;
      background: #FAF9F5;
      color: #141413;
      border: 0.5px solid rgba(31, 30, 29, 0.4);
      border-radius: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-shadow:
        0 40px 80px rgba(43, 82, 255, 0.24),
        0 4px 14px rgba(43, 82, 255, 0.24);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      opacity: 0;
      user-select: none;
      pointer-events: auto;
      white-space: nowrap;
      margin: 0 auto;
    `;
  button.addEventListener("mouseenter", () => {
    if (!isAgentActive()) return;
    button.style.background = "#F5F4F0";
    button.style.boxShadow = "0 40px 80px rgba(43, 82, 255, 0.24), 0 4px 14px rgba(43, 82, 255, 0.24)";
  });
  button.addEventListener("mouseleave", () => {
    if (!isAgentActive()) return;
    button.style.background = "#FAF9F5";
    button.style.boxShadow = "0 40px 80px rgba(43, 82, 255, 0.24), 0 4px 14px rgba(43, 82, 255, 0.24)";
  });
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.style.opacity = "0.6";
    button.style.cursor = "default";
    try {
      await chrome.runtime.sendMessage({
        type: "STOP_AGENT",
        fromTabId: "CURRENT_TAB"
      });
    } catch {
    }
  });
  container.appendChild(button);
  return container;
}
function animateStopButtonIn(container) {
  if (!container) return;
  const button = container.querySelector("#redrob-agent-stop-button");
  if (button) {
    button.style.transform = "translateY(0)";
    button.style.opacity = "1";
  }
}
function animateStopButtonOut(container) {
  if (!container) return;
  const button = container.querySelector("#redrob-agent-stop-button");
  if (button) {
    button.style.transform = "translateY(100px)";
    button.style.opacity = "0";
  }
}

// src/content/static-tab-group-indicator.js
var STATIC_INDICATOR_HEARTBEAT_MS = 5e3;
function createStaticIndicatorContainer() {
  const container = document.createElement("div");
  container.id = "redrob-static-indicator-container";
  container.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 16px; height: 16px; display: inline-block; vertical-align: middle; flex-shrink: 0; margin-right: 8px;">
        <path d="M3.13946 10.6399L6.28757 8.87462L6.37405 8.73821L6.28757 8.6339H6.13189L5.60432 8.6018L3.80541 8.55366L2.24865 8.48947L0.735135 8.40923H0.492973L0.354595 8.32899L0.181622 8.1685L0.0345946 8.01605L0 7.85557L0.0345946 7.62287L0.138378 7.44634L0.224865 7.40622H0.354595L0.812973 7.44634L1.82486 7.51856L3.34703 7.62287L4.44541 7.68706L6.08 7.85557H6.33946L6.37405 7.75125L6.28757 7.68706L6.21838 7.62287L4.64432 6.55567L2.94054 5.4323L2.04973 4.78235L1.57405 4.45336L1.33189 4.14845L1.22811 3.92377L1.17622 3.69107L1.22811 3.47442L1.33189 3.28185L1.46162 3.13741L1.66054 2.99298H1.87676L2.24865 3.0331L2.39568 3.07322L2.99243 3.53059L4.26378 4.51755L5.92432 5.73721L6.16649 5.93781H6.27892V5.82548L6.16649 5.64092L5.26703 4.01204L4.30703 2.35105L3.87459 1.66098L3.76216 1.25176C3.7391 1.16082 3.69297 0.977332 3.69297 0.970913V0.762287L3.77946 0.505517L3.93513 0.240722L4.18595 0.0882648L4.4627 0H4.67892L4.83459 0.0240722L5.12865 0.0882648L5.4054 0.328987L5.82054 1.27583L6.48649 2.76028L7.52432 4.78235L7.82703 5.38415L7.99135 5.93781L8.05189 6.10632H8.15567V6.01003L8.24216 4.87061L8.39784 3.47442L8.55351 1.67703L8.6054 1.17151L8.85622 0.561685L8.9773 0.417252L9.21946 0.232698H9.35784L9.74703 0.417252L9.97189 0.665998L10.067 0.874624L10.0238 1.17151L9.83351 2.40722L9.46162 4.34102L9.21946 5.64092H9.35784L9.52216 5.47242L10.1795 4.60582L11.2778 3.22568L11.7622 2.68004L12.333 2.07823L12.6962 1.78937L13.0162 1.67703L13.3881 1.78937L13.7168 2.06219L13.8897 2.54363V2.76028L13.6649 3.32197L12.9557 4.22066L12.3676 4.98295L12.0043 5.56871L11.0011 7.02106V7.08526H11.1741L13.0768 6.67603L14.1059 6.49147L15.3341 6.28285L15.5762 6.34704L15.8876 6.53962L15.9481 6.80441L15.8876 7.12538L15.7319 7.34203L14.4173 7.66299L12.8778 7.97593L10.5854 8.51559C10.5705 8.51909 10.56 8.53236 10.56 8.54764C10.56 8.56468 10.573 8.57891 10.59 8.58044L11.6238 8.67402L12.0649 8.69809H13.1459L15.1611 8.85055L15.6886 9.19559L15.9481 9.39619L16 9.62086L15.9481 9.94985L15.8443 10.1023L15.4119 10.3029L15.1351 10.3591L14.0454 10.1023L11.4941 9.49248L10.6205 9.27583H10.4995V9.34804L11.2259 10.0622L12.5665 11.2658L14.2357 12.8225L14.3222 13.0953V13.2076L14.1059 13.5125L13.9243 13.5206L13.8811 13.4804L12.4108 12.3731L12.2984 12.325L11.84 11.8756L10.56 10.7924H10.4735V10.9047L10.7676 11.338L12.333 13.6891L12.4108 14.4112L12.2984 14.6439L11.8919 14.7884L11.667 14.7563L11.4508 14.7081L11.2605 14.5396L10.5254 13.4162L9.5827 11.9719L8.82162 10.672H8.79342C8.76039 10.672 8.73278 10.6972 8.7297 10.73L8.27676 15.5667L8.06919 15.8154L7.6454 16H7.58486L7.17838 15.6951L6.96216 15.1976L7.17838 14.2106L7.43784 12.9268L7.6454 11.9077L7.83567 10.6399L7.95187 10.2164C7.9548 10.2057 7.95069 10.1944 7.94161 10.1881C7.91157 10.1672 7.87034 10.1741 7.84878 10.2037L6.89297 11.5145L5.44 13.4804L4.28973 14.7081L4.01297 14.8205H3.80541L3.5373 14.5717V14.4514L3.58054 14.1304L3.84865 13.7372L5.44 11.7151L6.4 10.4554L7.01872 9.73222C7.04511 9.70139 7.04245 9.65523 7.0127 9.62763C7.00333 9.61894 6.98925 9.61773 6.97854 9.62471L2.75027 12.3811L1.99784 12.4774L1.66919 12.1725L1.71243 11.675L1.86811 11.5145L3.13946 10.6399Z" fill="#2B52FF"/>
      </svg>
      <span style="vertical-align: middle; color: #141413; font-size: 14px; display: inline-block;">Redrob is active in this tab group</span>
      <div style="display: inline-block; width: 0.5px; height: 32px; background: rgba(31, 30, 29, 0.15); margin: 0 8px; vertical-align: middle;"></div>
      <button id="redrob-static-chat-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; border-radius: 8px; transition: background 0.2s;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="#141413" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
          <path d="M10 2.5C14.1421 2.5 17.5 5.85786 17.5 10C17.5 14.1421 14.1421 17.5 10 17.5H3C2.79779 17.5 2.61549 17.3782 2.53809 17.1914C2.4607 17.0046 2.50349 16.7895 2.64648 16.6465L4.35547 14.9365C3.20124 13.6175 2.5 11.8906 2.5 10C2.5 5.85786 5.85786 2.5 10 2.5ZM10 3.5C6.41015 3.5 3.5 6.41015 3.5 10C3.5 11.7952 4.22659 13.4199 5.40332 14.5967L5.46582 14.6729C5.52017 14.7544 5.5498 14.8508 5.5498 14.9502C5.5498 15.0828 5.49709 15.2099 5.40332 15.3037L4.20703 16.5H10C13.5899 16.5 16.5 13.5899 16.5 10C16.5 6.41015 13.5899 3.5 10 3.5ZM13.29 9.30371C13.3986 9.05001 13.6925 8.93174 13.9463 9.04004C14.2 9.14863 14.3183 9.44253 14.21 9.69629C13.8506 10.536 13.1645 11.25 12.25 11.25C11.6372 11.25 11.128 10.9289 10.75 10.4648C10.372 10.9289 9.86276 11.25 9.25 11.25C8.63724 11.25 8.12801 10.9289 7.75 10.4648C7.37198 10.9289 6.86276 11.25 6.25 11.25C5.97386 11.25 5.75 11.0261 5.75 10.75C5.75 10.4739 5.97386 10.25 6.25 10.25C6.58764 10.25 7.00448 9.97056 7.29004 9.30371L7.32422 9.2373C7.41431 9.09121 7.5749 9 7.75 9C7.9501 9 8.13123 9.11975 8.20996 9.30371L8.32227 9.53516C8.59804 10.0359 8.95442 10.25 9.25 10.25C9.58764 10.25 10.0045 9.97056 10.29 9.30371L10.3242 9.2373C10.4143 9.09121 10.5749 9 10.75 9C10.9501 9 11.1312 9.11975 11.21 9.30371L11.3223 9.53516C11.598 10.0359 11.9544 10.25 12.25 10.25C12.5876 10.25 13.0045 9.97056 13.29 9.30371Z" />
        </svg>
        <span id="redrob-static-chat-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: #FAF9F5; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Open chat</span>
      </button>
      <button id="redrob-static-close-button" style="position: relative; display: inline-flex; align-items: center; justify-content: center; padding: 6px; background: transparent; border: none; cursor: pointer; pointer-events: auto; vertical-align: middle; width: 32px; height: 32px; margin-left: 4px; border-radius: 8px; transition: background 0.2s;">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px; display: block;">
          <path d="M15.1464 4.14642C15.3417 3.95121 15.6582 3.95118 15.8534 4.14642C16.0486 4.34168 16.0486 4.65822 15.8534 4.85346L10.7069 9.99997L15.8534 15.1465C16.0486 15.3417 16.0486 15.6583 15.8534 15.8535C15.6826 16.0244 15.4186 16.0461 15.2245 15.918L15.1464 15.8535L9.99989 10.707L4.85338 15.8535C4.65813 16.0486 4.34155 16.0486 4.14634 15.8535C3.95115 15.6583 3.95129 15.3418 4.14634 15.1465L9.29286 9.99997L4.14634 4.85346C3.95129 4.65818 3.95115 4.34162 4.14634 4.14642C4.34154 3.95128 4.65812 3.95138 4.85338 4.14642L9.99989 9.29294L15.1464 4.14642Z" fill="#141413"/>
        </svg>
        <span id="redrob-static-close-tooltip" style="position: absolute; bottom: calc(100% + 12px); left: 50%; transform: translateX(-50%); padding: 6px 12px; background: #30302E; color: #FAF9F5; border-radius: 6px; font-size: 12px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity 0.2s; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">Dismiss</span>
      </button>
    `;
  container.style.cssText = `
      position: fixed;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 6px 6px 6px 16px;
      background: #FAF9F5;
      border: 0.5px solid rgba(31, 30, 29, 0.30);
      border-radius: 14px;
      box-shadow: 0 40px 80px 0 rgba(0, 0, 0, 0.15);
      z-index: 2147483647;
      pointer-events: none;
      white-space: nowrap;
      user-select: none;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    `;
  const chatButton = container.querySelector("#redrob-static-chat-button");
  const chatTooltip = container.querySelector("#redrob-static-chat-tooltip");
  if (chatButton) {
    chatButton.addEventListener("mouseenter", () => {
      chatButton.style.background = "#F0EEE6";
      if (chatTooltip) chatTooltip.style.opacity = "1";
    });
    chatButton.addEventListener("mouseleave", () => {
      chatButton.style.background = "transparent";
      if (chatTooltip) chatTooltip.style.opacity = "0";
    });
    chatButton.addEventListener("click", async () => {
      try {
        await chrome.runtime.sendMessage({ type: "SWITCH_TO_MAIN_TAB" });
      } catch {
      }
    });
  }
  const closeButton = container.querySelector("#redrob-static-close-button");
  const closeTooltip = container.querySelector("#redrob-static-close-tooltip");
  if (closeButton) {
    closeButton.addEventListener("mouseenter", () => {
      closeButton.style.background = "#F0EEE6";
      if (closeTooltip) closeTooltip.style.opacity = "1";
    });
    closeButton.addEventListener("mouseleave", () => {
      closeButton.style.background = "transparent";
      if (closeTooltip) closeTooltip.style.opacity = "0";
    });
    closeButton.addEventListener("click", async () => {
      try {
        await chrome.runtime.sendMessage({
          type: "DISMISS_STATIC_INDICATOR_FOR_GROUP"
        });
      } catch {
      }
    });
  }
  return container;
}

// src/content/agent-visual-indicator-controller.js
function createInitialState() {
  return {
    glowBorderElement: null,
    // raw L3: e
    stopButtonContainer: null,
    // raw L4: t
    staticIndicatorContainer: null,
    // raw L5: n
    phantomCursorContainer: null,
    // raw L6: i
    phantomCursorStyled: null,
    // raw L7: o
    lastCursorX: null,
    // raw L8: s
    lastCursorY: null,
    // raw L9: a
    displayedCursorX: null,
    // raw L10: r
    displayedCursorY: null,
    // raw L11: l
    audioContext: null,
    // raw L12: d
    agentIndicatorsActive: false,
    // raw L13: c
    staticIndicatorActive: false,
    // raw L14: p
    agentWasHiddenForToolUse: false,
    // raw L15: u
    staticWasHiddenForToolUse: false,
    // raw L16: L
    heartbeatIntervalId: null,
    // raw L17: y
    suppressStopButtonForMcp: false,
    // raw L18: m
    staticIndicatorDismissed: false,
    // raw L19: h
    unattended: false
  };
}
function createAgentVisualIndicatorController(options = {}) {
  const { autoInstall = true } = options;
  const state = createInitialState();
  function renderActiveAgentUi() {
    showGlowBorder(state);
    syncStopButton();
    try {
      if (!state.phantomCursorContainer) {
        updatePhantomCursor(
          state,
          state.lastCursorX ?? Math.round(window.innerWidth / 2),
          state.lastCursorY ?? Math.round(window.innerHeight / 2)
        );
      }
      if (state.phantomCursorStyled) {
        state.phantomCursorStyled.style.display = "";
      }
    } catch {
    }
    requestAnimationFrame(() => {
      animateStopButtonIn(state.stopButtonContainer);
    });
  }
  function syncStopButton() {
    const wanted = state.agentIndicatorsActive && state.unattended && !state.suppressStopButtonForMcp;
    if (!wanted) {
      if (!state.stopButtonContainer) return;
      const container = state.stopButtonContainer;
      state.stopButtonContainer = null;
      animateStopButtonOut(container);
      setTimeout(() => container.parentNode?.removeChild(container), 300);
      return;
    }
    if (state.stopButtonContainer) {
      state.stopButtonContainer.style.display = "";
      return;
    }
    state.stopButtonContainer = createStopAgentButtonContainer(
      () => state.agentIndicatorsActive
    );
    document.body.appendChild(state.stopButtonContainer);
    requestAnimationFrame(() => animateStopButtonIn(state.stopButtonContainer));
  }
  function showAgentIndicators() {
    state.agentIndicatorsActive = true;
    state.agentWasHiddenForToolUse = false;
    state.staticWasHiddenForToolUse = false;
    ensureAudioContextKeepalive(state);
    if (!document.hidden) renderActiveAgentUi();
  }
  function hideAgentIndicators() {
    if (!state.agentIndicatorsActive) return;
    state.agentIndicatorsActive = false;
    fadeOutGlowBorder(state);
    suspendAudioContextKeepalive(state);
    if (state.staticIndicatorActive) {
      if (state.stopButtonContainer && state.stopButtonContainer.parentNode) {
        state.stopButtonContainer.parentNode.removeChild(
          state.stopButtonContainer
        );
        state.stopButtonContainer = null;
      }
      removePhantomCursor(state);
      return;
    }
    animateStopButtonOut(state.stopButtonContainer);
    setTimeout(() => {
      if (state.agentIndicatorsActive) return;
      if (state.stopButtonContainer && state.stopButtonContainer.parentNode) {
        state.stopButtonContainer.parentNode.removeChild(
          state.stopButtonContainer
        );
        state.stopButtonContainer = null;
      }
      removePhantomCursor(state);
    }, 300);
  }
  function hideStaticPill() {
    state.staticIndicatorDismissed = true;
    if (state.staticIndicatorContainer && state.staticIndicatorContainer.parentNode) {
      state.staticIndicatorContainer.parentNode.removeChild(
        state.staticIndicatorContainer
      );
      state.staticIndicatorContainer = null;
    }
  }
  function renderStaticIndicator() {
    showGlowBorder(state);
    if (state.staticIndicatorDismissed) {
      hideStaticPill();
      return;
    }
    if (state.staticIndicatorContainer) {
      state.staticIndicatorContainer.style.display = "";
    } else {
      state.staticIndicatorContainer = createStaticIndicatorContainer();
      document.body.appendChild(state.staticIndicatorContainer);
    }
  }
  function hideStaticIndicator() {
    if (!state.staticIndicatorActive) return;
    state.staticIndicatorActive = false;
    if (state.heartbeatIntervalId) {
      clearInterval(state.heartbeatIntervalId);
      state.heartbeatIntervalId = null;
    }
    hideStaticPill();
    fadeOutGlowBorder(state);
  }
  function showStaticIndicator(dismissed) {
    state.staticIndicatorActive = true;
    state.staticIndicatorDismissed = dismissed;
    state.agentWasHiddenForToolUse = false;
    state.staticWasHiddenForToolUse = false;
    if (state.heartbeatIntervalId) {
      clearInterval(state.heartbeatIntervalId);
      state.heartbeatIntervalId = null;
    }
    state.heartbeatIntervalId = setInterval(async () => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: "STATIC_INDICATOR_HEARTBEAT"
        });
        if (!response?.success) hideStaticIndicator();
      } catch {
        hideStaticIndicator();
      }
    }, STATIC_INDICATOR_HEARTBEAT_MS);
    if (document.hidden) {
      if (dismissed) hideStaticPill();
    } else {
      renderStaticIndicator();
    }
  }
  function onDocumentVisibilityChange() {
    if (document.hidden) return;
    if (state.agentWasHiddenForToolUse || state.staticWasHiddenForToolUse) {
      return;
    }
    if (state.agentIndicatorsActive) renderActiveAgentUi();
    if (state.staticIndicatorActive) renderStaticIndicator();
  }
  function hideForToolUse() {
    state.agentWasHiddenForToolUse = state.agentIndicatorsActive;
    state.staticWasHiddenForToolUse = state.staticIndicatorActive;
    if (state.glowBorderElement) state.glowBorderElement.style.display = "none";
    if (state.stopButtonContainer) {
      state.stopButtonContainer.style.display = "none";
    }
    if (state.phantomCursorStyled) {
      state.phantomCursorStyled.style.display = "none";
    }
    if (state.staticIndicatorContainer && state.staticIndicatorActive) {
      state.staticIndicatorContainer.style.display = "none";
    }
  }
  function showAfterToolUse() {
    if ((state.agentWasHiddenForToolUse || state.staticWasHiddenForToolUse) && state.glowBorderElement) {
      state.glowBorderElement.style.display = "";
    }
    if (state.agentWasHiddenForToolUse && state.stopButtonContainer) {
      state.stopButtonContainer.style.display = "";
    }
    if (state.phantomCursorStyled) {
      state.phantomCursorStyled.style.display = "";
    }
    if (state.staticWasHiddenForToolUse && state.staticIndicatorContainer) {
      state.staticIndicatorContainer.style.display = "";
    }
    state.agentWasHiddenForToolUse = false;
    state.staticWasHiddenForToolUse = false;
    onDocumentVisibilityChange();
  }
  function handleRuntimeMessage(message, _sender, sendResponse) {
    if (message.type === "SHOW_AGENT_INDICATORS") {
      state.suppressStopButtonForMcp = state.suppressStopButtonForMcp || message.isMcp === true;
      showAgentIndicators();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "HIDE_AGENT_INDICATORS") {
      hideAgentIndicators();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "SET_UNATTENDED_MODE") {
      state.unattended = message.unattended === true;
      setGlowBorderMode(state, state.unattended);
      syncStopButton();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "UPDATE_PHANTOM_CURSOR") {
      updatePhantomCursor(state, message.x, message.y).then(
        () => sendResponse({ success: true })
      );
      return true;
    }
    if (message.type === "HIDE_FOR_TOOL_USE") {
      hideForToolUse();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "SHOW_AFTER_TOOL_USE") {
      showAfterToolUse();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "SHOW_STATIC_INDICATOR") {
      showStaticIndicator(message.dismissed === true);
      sendResponse({ success: true });
      return;
    }
    if (message.type === "HIDE_STATIC_INDICATOR") {
      hideStaticIndicator();
      sendResponse({ success: true });
      return;
    }
    if (message.type === "HIDE_STATIC_PILL") {
      hideStaticPill();
      sendResponse({ success: true });
    }
  }
  function onBeforeUnload() {
    hideAgentIndicators();
    hideStaticIndicator();
    removePhantomCursor(state);
    closeAudioContextKeepalive(state);
  }
  function install() {
    document.addEventListener("visibilitychange", onDocumentVisibilityChange);
    chrome.runtime.onMessage.addListener(handleRuntimeMessage);
    window.addEventListener("beforeunload", onBeforeUnload);
  }
  if (autoInstall) install();
  return {
    state,
    install,
    showAgentIndicators,
    hideAgentIndicators,
    showStaticIndicator,
    hideStaticIndicator,
    hideStaticPill,
    updatePhantomCursor: (x, y) => updatePhantomCursor(state, x, y),
    hideForToolUse,
    showAfterToolUse,
    handleRuntimeMessage
  };
}
function installAgentVisualIndicator() {
  return createAgentVisualIndicatorController({ autoInstall: true });
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
function bootstrapAgentVisualIndicator() {
  return installAgentVisualIndicator();
}

// src/content/agent-visual-indicator-entry.js
bootstrapAgentVisualIndicator();
//# sourceMappingURL=agent-visual-indicator.js.map
