// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/redrob_ui.h"

#include <string>
#include <string_view>

#include "base/functional/bind.h"
#include "base/memory/ref_counted_memory.h"
#include "base/strings/string_util.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "services/network/public/mojom/content_security_policy.mojom.h"

namespace redrob {
namespace {

// The page. Kept as three separate responses rather than one inlined document because the WebUI
// default CSP forbids inline script and style, and relaxing it for a page that will eventually talk
// to a model over Mojo would be the wrong trade to make for a few saved lines.
constexpr char kIndexHtml[] = R"HTML(<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Redrob</title>
  <link rel="stylesheet" href="redrob.css">
</head>
<body>
  <main>
    <h1>Ask AI a task</h1>
    <form id="composer" autocomplete="off">
      <textarea id="prompt" rows="3" aria-label="Task for the agent"
                placeholder="Ask AI a task, @ for context"></textarea>
      <div class="controls">
        <fieldset>
          <legend class="visually-hidden">Routing</legend>
          <label><input type="radio" name="routing" value="local" checked> Local</label>
          <label><input type="radio" name="routing" value="guard"> Guard</label>
        </fieldset>
        <button type="submit" id="run">Run task</button>
      </div>
    </form>
    <section aria-labelledby="recent-heading">
      <h2 id="recent-heading">Recent tasks</h2>
      <ol id="tasks" class="cards"></ol>
      <p id="empty" role="status">No tasks yet. The sidecar is not connected in this build.</p>
    </section>
  </main>
  <script type="module" src="redrob.js"></script>
</body>
</html>
)HTML";

constexpr char kStylesheet[] = R"CSS(:root {
  color-scheme: light dark;
  --surface: light-dark(#ffffff, #10131a);
  --ink: light-dark(#000921, #eef1f6);
  --muted: light-dark(#5b6472, #9aa4b2);
  --line: light-dark(#dfe3ea, #262c38);
  --accent: light-dark(#2440ff, #6f86ff);
}
* { box-sizing: border-box; }
body {
  margin: 0;
  padding: 48px 24px;
  background: var(--surface);
  color: var(--ink);
  font: 14px/1.5 system-ui, sans-serif;
}
main { margin: 0 auto; max-width: 720px; }
h1 { margin: 0 0 16px; font-size: 28px; font-weight: 600; letter-spacing: -0.01em; }
h2 { margin: 40px 0 12px; font-size: 13px; font-weight: 600; text-transform: uppercase;
     letter-spacing: 0.06em; color: var(--muted); }
textarea {
  width: 100%; padding: 12px; resize: vertical;
  border: 1px solid var(--line); border-radius: 10px;
  background: transparent; color: inherit; font: inherit;
}
textarea:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.controls { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
fieldset { display: flex; gap: 12px; margin: 0; padding: 0; border: 0; }
label { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
button {
  margin-left: auto; padding: 8px 16px;
  border: 0; border-radius: 8px;
  background: var(--accent); color: #fff; font: inherit; font-weight: 500; cursor: pointer;
}
button:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.cards { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.cards li { padding: 12px; border: 1px solid var(--line); border-radius: 10px; }
#empty { color: var(--muted); }
.visually-hidden {
  position: absolute; width: 1px; height: 1px;
  clip-path: inset(50%); overflow: hidden; white-space: nowrap;
}
)CSS";

// No task is started here. The submit handler exists so the surface is honest about its own state
// rather than appearing to work: docs/AI_SURFACE.md puts StartTask on a Mojo interface that this
// build does not have, and a fake result on an AI page is worse than a visible gap.
constexpr char kScript[] = R"JS(const form = document.querySelector('#composer');
const empty = document.querySelector('#empty');

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const prompt = document.querySelector('#prompt').value.trim();
  if (!prompt) {
    return;
  }
  const routing = form.elements.routing.value;
  empty.textContent =
      `Not sent: this build has no sidecar. Would have run "${prompt}" with routing=${routing}.`;
});
)JS";

struct Resource {
  std::string_view path;
  std::string_view body;
  std::string_view mime;
};

constexpr Resource kResources[] = {
    {"", kIndexHtml, "text/html"},
    {"redrob.css", kStylesheet, "text/css"},
    {"redrob.js", kScript, "application/javascript"},
};

const Resource* Lookup(const std::string& path) {
  // Strip a query or fragment before matching; the data source hands the raw path through.
  std::string_view trimmed(path);
  const size_t cut = trimmed.find_first_of("?#");
  if (cut != std::string_view::npos) {
    trimmed = trimmed.substr(0, cut);
  }
  for (const Resource& resource : kResources) {
    if (trimmed == resource.path) {
      return &resource;
    }
  }
  return nullptr;
}

bool ShouldHandleRequest(const std::string& path) {
  return Lookup(path) != nullptr;
}

void HandleRequest(const std::string& path,
                   content::WebUIDataSource::GotDataCallback callback) {
  const Resource* resource = Lookup(path);
  // ShouldHandleRequest gates this, so a miss here is a programming error rather than a bad URL.
  CHECK(resource);
  std::move(callback).Run(
      base::MakeRefCounted<base::RefCountedString>(std::string(resource->body)));
}

}  // namespace

RedrobUI::RedrobUI(content::WebUI* web_ui) : content::WebUIController(web_ui) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), chrome::kChromeUIRedrobHost);

  // A module script needs to be reachable by name, and the default WebUI policy allows 'self'
  // already; nothing here loosens the page's CSP.
  source->OverrideContentSecurityPolicy(
      network::mojom::CSPDirectiveName::ScriptSrc, "script-src chrome://resources 'self';");
  source->SetRequestFilter(base::BindRepeating(&ShouldHandleRequest),
                           base::BindRepeating(&HandleRequest));
}

RedrobUI::~RedrobUI() = default;

}  // namespace redrob
