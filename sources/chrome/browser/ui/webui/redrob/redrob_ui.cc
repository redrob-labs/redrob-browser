// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob/redrob_ui.h"

#include <utility>

#include "chrome/browser/ui/webui/redrob/task_host_impl.h"
#include "chrome/grit/redrob_resources.h"
#include "chrome/grit/redrob_resources_map.h"
#include "content/public/browser/browser_context.h"
#include "content/public/browser/storage_partition.h"
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
}

RedrobUI::~RedrobUI() = default;

void RedrobUI::BindInterface(mojo::PendingReceiver<mojom::PageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void RedrobUI::CreateTaskHost(mojo::PendingRemote<mojom::Page> page,
                              mojo::PendingReceiver<mojom::TaskHost> host) {
  // One host per document. A reload replaces it, which also drops the sidecar handle the old one held.
  // The loader factory comes from the browser context rather than the page: the health probe is the
  // browser's request, not the renderer's, and must not inherit anything the page could influence.
  content::BrowserContext* context = web_ui()->GetWebContents()->GetBrowserContext();
  task_host_ = std::make_unique<TaskHostImpl>(
      std::move(host), std::move(page),
      context->GetDefaultStoragePartition()->GetURLLoaderFactoryForBrowserProcess());
}

WEB_UI_CONTROLLER_TYPE_IMPL(RedrobUI)

}  // namespace redrob
