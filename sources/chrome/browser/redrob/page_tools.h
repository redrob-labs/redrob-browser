// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_PAGE_TOOLS_H_
#define CHROME_BROWSER_REDROB_PAGE_TOOLS_H_

#include <string>

#include "base/functional/callback.h"
#include "base/values.h"

namespace content {
class WebContents;
}  // namespace content

namespace redrob {

// Reading and driving a page on an agent's behalf.
//
// Everything here works on a REAL tab the user can see. There is no headless path and no hidden
// WebContents: if the agent typed something, the user can watch it appear.
class PageTools {
 public:
  using TextCallback = base::OnceCallback<void(std::string)>;
  using DoneCallback = base::OnceCallback<void(bool)>;

  // The page's visible text, taken from its accessibility tree. The tree rather than the DOM because
  // it is what the page exposes as its meaning -- headings, labels, link text -- and because reading
  // it needs no script in the page at all.
  static void ReadPageText(content::WebContents* contents, TextCallback callback);

  // Clicks the first element whose accessible name or visible text matches `target`.
  //
  // Matched by name rather than by selector on purpose. A model that writes CSS selectors is a model
  // guessing at markup it cannot see, and the guess breaks on every redesign; the accessible name is
  // the thing the user would have clicked.
  static void ClickByName(content::WebContents* contents,
                          const std::string& target,
                          DoneCallback callback);

  // Types `text` into the field whose label or placeholder matches `field`. Fills only -- it never
  // submits. Submitting is the step a person should take, and separating them is what makes "fill the
  // form but do not send it" a thing the browser can actually promise.
  static void TypeIntoField(content::WebContents* contents,
                            const std::string& field,
                            const std::string& text,
                            DoneCallback callback);

 private:
  // Runs `script` in an ISOLATED world.
  //
  // Two reasons, and the second is the important one. The browser process cannot run script in a
  // page's main world at all -- RenderFrameHost::ExecuteJavaScript CHECKs a gate that ordinary
  // http(s) pages do not pass. And an isolated world shares the DOM but not the page's JavaScript
  // globals, so the page cannot see what the agent runs, cannot redefine the functions it uses, and
  // cannot read what it found.
  static void RunInIsolatedWorld(content::WebContents* contents,
                                const std::string& script,
                                base::OnceCallback<void(base::Value)> callback);
};

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_PAGE_TOOLS_H_
