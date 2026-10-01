// src/content/redrob-page-dependencies.js
function createRedrobPageContentDependencies(overrides = {}) {
  return {
    getOnboardingPromptText: overrides.getOnboardingPromptText ?? (() => {
      throw new Error(
        "getOnboardingPromptText dependency not injected (raw import `t` from onboarding-prompts chunk)"
      );
    })
  };
}

// src/content/onboarding-button-click.js
async function handleOnboardingButtonClick(button, getOnboardingPromptText2) {
  const taskId = button.getAttribute("data-task-id");
  if (getOnboardingPromptText2(taskId)) {
    await chrome.runtime.sendMessage({
      type: "open_side_panel",
      onboardingTaskId: taskId
    });
  }
}
function installOnboardingButtonClickHandler(deps) {
  document.body.addEventListener("click", (event) => {
    const button = (
      /** @type {Element | null} */
      /** @type {Element} */
      event.target.closest("#redrob-onboarding-button")
    );
    if (button) {
      handleOnboardingButtonClick(button, deps.getOnboardingPromptText);
    }
  });
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
var TRUSTED_EXTERNAL_COOKIE_HOSTS = [
  "console.redrob.ai",
  "redrob.io",
  "www.redrob.io"
];
var REDROB_ORG_COOKIE_NAME = "redrobOrg";

// src/content/relay-redrob-org.js
function readCookie(name) {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match?.[1];
}
function relayRedrobOrgCookie() {
  if (!TRUSTED_EXTERNAL_COOKIE_HOSTS.includes(location.hostname)) return;
  const value = readCookie(REDROB_ORG_COOKIE_NAME);
  if (!value) return;
  chrome.runtime.sendMessage({
    type: "relay_redrob_org",
    value
  });
}

// src/content/index.js
function bootstrapRedrobPageContentScript(dependencyOverrides = {}) {
  const deps = createRedrobPageContentDependencies(dependencyOverrides);
  installOnboardingButtonClickHandler(deps);
  relayRedrobOrgCookie();
  return deps;
}

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

// src/content/redrob-page-entry.js
bootstrapRedrobPageContentScript({ getOnboardingPromptText });
//# sourceMappingURL=content-script.js.map
