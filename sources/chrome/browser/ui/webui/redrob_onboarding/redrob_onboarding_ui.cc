// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/webui/redrob_onboarding/redrob_onboarding_ui.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/values.h"
#include "chrome/browser/browser_process.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/webui/redrob_onboarding/onboarding_host_impl.h"
#include "chrome/browser/redrob/resources/redrob_localized_strings.h"
#include "chrome/grit/redrob_onboarding_resources.h"
#include "chrome/grit/redrob_onboarding_resources_map.h"
#include "chrome/common/webui_url_constants.h"
#include "content/public/browser/navigation_controller.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "extensions/common/constants.h"
#include "extensions/common/extension.h"
#include "ui/base/page_transition_types.h"
#include "ui/webui/webui_util.h"
#include "url/gurl.h"

namespace redrob {

RedrobOnboardingUI::RedrobOnboardingUI(content::WebUI* web_ui)
    : ui::MojoWebUIController(web_ui, /*enable_chrome_send=*/false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), chrome::kChromeUIRedrobOnboardingHost);
  webui::SetupWebUIDataSource(source, kRedrobOnboardingResources,
                              IDR_REDROB_ONBOARDING_REDROB_ONBOARDING_HTML);
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

RedrobOnboardingUI::~RedrobOnboardingUI() = default;

void RedrobOnboardingUI::BindInterface(
    mojo::PendingReceiver<onboarding::mojom::PageHandlerFactory> receiver) {
  factory_receiver_.reset();
  factory_receiver_.Bind(std::move(receiver));
}

void RedrobOnboardingUI::CreateOnboardingHost(
    mojo::PendingReceiver<onboarding::mojom::OnboardingHost> host,
    mojo::PendingRemote<onboarding::mojom::Page> page) {
  onboarding_host_ = std::make_unique<OnboardingHostImpl>(
      std::move(host), std::move(page), Profile::FromWebUI(web_ui()),
      base::BindRepeating(&RedrobOnboardingUI::OnComplete, weak_factory_.GetWeakPtr()));
}

void RedrobOnboardingUI::SetCompleteCallback(base::RepeatingClosure callback) {
  complete_callback_ = std::move(callback);
}

void RedrobOnboardingUI::OnComplete() {
  if (complete_callback_) {
    complete_callback_.Run();
    return;
  }
  // No callback means this page was opened as an ORDINARY TAB -- from Settings' "Open the tour", or by typing
  // the host. There is no flow to finish and no window of ours to close, so this used to do nothing, which was
  // defensible only while the page was unreachable outside first run. It is reachable now, and a final button
  // that says it finishes something and then does nothing is the same dead control this shell is being
  // cleaned of. Leaving on the new tab is what finishing first run lands on, so the two paths agree.
  if (content::WebContents* contents = web_ui()->GetWebContents()) {
    const GURL newtab =
        extensions::Extension::GetBaseURLFromExtensionId(extension_misc::kRedrobExtensionId)
            .Resolve("newtab.html");
    contents->GetController().LoadURL(newtab,
                                      content::Referrer(),
                                      ui::PAGE_TRANSITION_AUTO_TOPLEVEL,
                                      /*extra_headers=*/std::string());
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RedrobOnboardingUI)

}  // namespace redrob
