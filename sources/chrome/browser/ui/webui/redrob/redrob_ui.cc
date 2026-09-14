// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/redrob_ui.h"

#include <utility>

#include "base/values.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/task_store_factory.h"
#include "chrome/browser/ui/webui/redrob/task_host_impl.h"
#include "chrome/browser/redrob/resources/redrob_localized_strings.h"
#include "chrome/grit/redrob_resources.h"
#include "chrome/grit/redrob_resources_map.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "ui/webui/webui_util.h"

namespace redrob {

RedrobUI::RedrobUI(content::WebUI* web_ui)
    : ui::MojoWebUIController(web_ui, /*enable_chrome_send=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), chrome::kChromeUIRedrobHost);
  // The resource pack replaced the scaffold's string literals. It brings the TypeScript build and the
  // generated Mojo bindings with it, which is what the page needs to reach TaskHost at all.
  webui::SetupWebUIDataSource(source, kRedrobResources, IDR_REDROB_REDROB_HTML);
  // Localization, in two halves because the page needs both. AddLocalizedStrings makes every $i18n{key} in the
  // served HTML resolve, which text/html gets template replacement for free. UseStringsJs serves the same
  // dictionary as strings.m.js, which is how the strings built in TypeScript are read.
  //
  // NOT EnableReplaceI18nInJS: that substitutes only inside HTML template literals, so in a WebUI with no
  // template library it is a no-op that leaves $i18n{} visible on the page as literal text.
  source->AddLocalizedStrings(kRedrobLocalizedStrings);
  source->UseStringsJs();

  // language and textdirection, which are not ours but are not supplied either: without them the document
  // still says lang="en" in a Korean UI, and the font fallback and line breaking a browser picks from that
  // attribute are chosen for the wrong language.
  base::DictValue locale_defaults;
  webui::SetLoadTimeDataDefaults(g_browser_process->GetApplicationLocale(), &locale_defaults);
  source->AddLocalizedStrings(locale_defaults);
}

RedrobUI::~RedrobUI() = default;

void RedrobUI::BindInterface(mojo::PendingReceiver<mojom::PageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void RedrobUI::CreateTaskHost(mojo::PendingRemote<mojom::Page> page,
                              mojo::PendingReceiver<mojom::TaskHost> host) {
  // One handler per document, one store per profile. The split is what makes a task tab work: the
  // handler dies with the document, the tasks do not.
  task_host_ = std::make_unique<TaskHostImpl>(
      std::move(host), std::move(page),
      TaskStoreFactory::GetForProfile(Profile::FromWebUI(web_ui())),
      web_ui()->GetWebContents());
}

WEB_UI_CONTROLLER_TYPE_IMPL(RedrobUI)

}  // namespace redrob
