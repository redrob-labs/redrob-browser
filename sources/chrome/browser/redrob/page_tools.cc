// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/page_tools.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/json/json_writer.h"
#include "base/strings/strcat.h"
#include "base/values.h"
#include "content/public/browser/render_frame_host.h"
#include "content/public/browser/web_contents.h"
#include "base/strings/utf_string_conversions.h"
#include "ui/accessibility/ax_mode.h"
#include "ui/accessibility/ax_node_data.h"
#include "ui/accessibility/ax_tree_update.h"

namespace redrob {
namespace {

// A page can be arbitrarily large and this text goes to a model in a browser-process message. Truncated
// rather than streamed: a tool result is one value, and a model that needs more of a page should be
// asked to narrow what it wants.
constexpr size_t kMaxPageTextBytes = 96 * 1024;

// The world our script runs in. Any non-zero id is an isolated world; this one is ours so nothing else
// in the browser shares state with it.
constexpr int32_t kRedrobIsolatedWorldId = 0x52444231;  // "RDB1"

// JSON-encodes a string for embedding in the script. Model output goes into these scripts, so it is
// never concatenated raw -- a single quote in a link name would otherwise be a script injection into
// our own isolated world.
std::string Quote(const std::string& value) {
  std::string json;
  base::JSONWriter::Write(base::Value(value), &json);
  return json;
}

void CollectText(const ui::AXTreeUpdate& update, std::string* out) {
  for (const ui::AXNodeData& node : update.nodes) {
    if (out->size() > kMaxPageTextBytes) {
      return;
    }
    const std::string& name =
        node.GetStringAttribute(ax::mojom::StringAttribute::kName);
    if (name.empty()) {
      continue;
    }
    // Roles that carry the page's words. Containers repeat their children's names, so including them
    // would return the same sentence several times and spend the budget on duplicates.
    switch (node.role) {
      case ax::mojom::Role::kStaticText:
      case ax::mojom::Role::kHeading:
      case ax::mojom::Role::kLink:
      case ax::mojom::Role::kButton:
      case ax::mojom::Role::kTextField:
      case ax::mojom::Role::kListItem:
        base::StrAppend(out, {name, "\n"});
        break;
      default:
        break;
    }
  }
}

}  // namespace

// static
void PageTools::ReadPageText(content::WebContents* contents, TextCallback callback) {
  if (!contents) {
    std::move(callback).Run(std::string());
    return;
  }
  contents->RequestAXTreeSnapshot(
      base::BindOnce(
          [](TextCallback callback, ui::AXTreeUpdate& update) {
            std::string text;
            CollectText(update, &text);
            std::move(callback).Run(std::move(text));
          },
          std::move(callback)),
      ui::kAXModeWebContentsOnly,
      /*max_nodes=*/5000,
      /*timeout=*/base::Seconds(5),
      content::WebContents::AXTreeSnapshotPolicy::kAll);
}

// static
void PageTools::ClickByName(content::WebContents* contents,
                            const std::string& target,
                            DoneCallback callback) {
  // Visible only, and matched on trimmed text. An agent clicking something the user cannot see is an
  // agent doing something the user cannot check.
  const std::string script = base::StrCat({
      R"((() => {
        const wanted = )", Quote(target), R"(.trim().toLowerCase();
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0 &&
                 getComputedStyle(el).visibility !== 'hidden';
        };
        const candidates = document.querySelectorAll(
            'a, button, [role=button], input[type=submit], input[type=button], summary');
        for (const el of candidates) {
          if (!visible(el)) continue;
          const label = (el.getAttribute('aria-label') || el.innerText || el.value || '')
              .trim().toLowerCase();
          if (label && (label === wanted || label.includes(wanted))) {
            el.click();
            return true;
          }
        }
        return false;
      })())"});
  RunInIsolatedWorld(contents, script,
                     base::BindOnce(
                         [](DoneCallback callback, base::Value result) {
                           std::move(callback).Run(result.is_bool() && result.GetBool());
                         },
                         std::move(callback)));
}

// static
void PageTools::TypeIntoField(content::WebContents* contents,
                              const std::string& field,
                              const std::string& text,
                              DoneCallback callback) {
  // Events are dispatched after setting the value because a framework-managed field ignores a value
  // assigned behind its back, and a form that looks filled but is not is the worst outcome here.
  //
  // Password fields are refused. Filling one from model output would put a credential in a place the
  // model chose, and the browser has a password manager for exactly this.
  const std::string script = base::StrCat({
      R"((() => {
        const wanted = )", Quote(field), R"(.trim().toLowerCase();
        const value = )", Quote(text), R"(;
        const fields = document.querySelectorAll('input, textarea');
        for (const el of fields) {
          if (el.type === 'password' || el.type === 'hidden' || el.disabled || el.readOnly) continue;
          const label = (el.getAttribute('aria-label') || el.placeholder || el.name ||
                         (el.labels && el.labels[0] ? el.labels[0].innerText : '') || '')
              .trim().toLowerCase();
          if (!label || !label.includes(wanted)) continue;
          el.focus();
          el.value = value;
          el.dispatchEvent(new Event('input', {bubbles: true}));
          el.dispatchEvent(new Event('change', {bubbles: true}));
          return true;
        }
        return false;
      })())"});
  RunInIsolatedWorld(contents, script,
                     base::BindOnce(
                         [](DoneCallback callback, base::Value result) {
                           std::move(callback).Run(result.is_bool() && result.GetBool());
                         },
                         std::move(callback)));
}

// static
void PageTools::RunInIsolatedWorld(content::WebContents* contents,
                                   const std::string& script,
                                   base::OnceCallback<void(base::Value)> callback) {
  if (!contents || !contents->GetPrimaryMainFrame()) {
    std::move(callback).Run(base::Value());
    return;
  }
  contents->GetPrimaryMainFrame()->ExecuteJavaScriptInIsolatedWorld(
      base::UTF8ToUTF16(script), std::move(callback), kRedrobIsolatedWorldId);
}

}  // namespace redrob
