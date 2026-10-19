// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/ui/views/redrob/quick_window_service.h"

#include <utility>

#include "base/functional/bind.h"
#include "base/task/single_thread_task_runner.h"
#include "chrome/browser/extensions/chrome_extension_web_contents_observer.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/redrob/agent_entry.h"
#include "chrome/browser/redrob/redrob_prefs.h"
#include "chrome/browser/redrob/resources/grit/redrob_strings.h"
#include "chrome/browser/ui/views/redrob/quick_window_view.h"
#include "components/prefs/pref_service.h"
#include "content/public/browser/web_contents.h"
#include "extensions/browser/view_type_utils.h"
#include "extensions/common/mojom/view_type.mojom.h"
#include "ui/base/accelerators/command.h"
#include "ui/base/l10n/l10n_util.h"
#include "ui/base/ui_base_types.h"
#include "ui/events/event_constants.h"
#include "ui/events/keycodes/keyboard_codes.h"
#include "ui/gfx/geometry/size.h"
#include "ui/views/widget/widget.h"
#include "ui/views/widget/widget_delegate.h"

namespace redrob {
namespace {

// Wide enough for a sentence and a handful of recent conversations, small enough to read as a
// launcher rather than as a window someone has to manage.
constexpr gfx::Size kQuickWindowSize(600, 380);

// The command id offered to a desktop that registers shortcuts itself (the Linux portal), and the
// group it belongs to. Stable strings: the desktop stores the user's binding under them.
constexpr char kAcceleratorGroup[] = "redrob";
constexpr char kQuickWindowCommand[] = "quick_window";

}  // namespace

// static
std::optional<ui::Accelerator> QuickWindowService::AcceleratorForPreset(
    const std::string& preset) {
  // Ctrl on Windows and Linux, Command on macOS -- the spec's Ctrl/Cmd+Shift+Space on both.
  if (preset == prefs::kQuickWindowShortcutPrimaryShiftSpace) {
    return ui::Accelerator(ui::VKEY_SPACE, ui::EF_PLATFORM_ACCELERATOR | ui::EF_SHIFT_DOWN);
  }
  if (preset == prefs::kQuickWindowShortcutAltShiftSpace) {
    return ui::Accelerator(ui::VKEY_SPACE, ui::EF_ALT_DOWN | ui::EF_SHIFT_DOWN);
  }
  return std::nullopt;
}

QuickWindowService::QuickWindowService(Profile* profile) : profile_(profile) {
  pref_change_registrar_.Init(profile_->GetPrefs());
  pref_change_registrar_.Add(
      prefs::kQuickWindowShortcut,
      base::BindRepeating(&QuickWindowService::UpdateRegistration, base::Unretained(this)));
  UpdateRegistration();
}

QuickWindowService::~QuickWindowService() = default;

void QuickWindowService::Shutdown() {
  pref_change_registrar_.RemoveAll();
  Unregister();
  // Synchronously: the profile is going, and the WebContents in the window belongs to it.
  if (widget_) {
    widget_->RemoveObserver(this);
    ClearQuickWindowCloser();
    widget_.reset();
    widget_delegate_.reset();
  }
  weak_factory_.InvalidateWeakPtrs();
}

void QuickWindowService::UpdateRegistration() {
  Unregister();
  const std::optional<ui::Accelerator> accelerator = AcceleratorForPreset(
      profile_->GetPrefs()->GetString(prefs::kQuickWindowShortcut));
  if (!accelerator.has_value()) {
    return;
  }
  ui::GlobalAcceleratorListener* listener = ui::GlobalAcceleratorListener::GetInstance();
  if (!listener) {
    return;
  }

  if (listener->IsRegistrationHandledExternally()) {
    // The desktop owns shortcuts here (the XDG portal on Linux): the binding is OFFERED, with ours as
    // the suggestion, and the desktop asks the user. The callback is bound weakly so a binding the
    // desktop fires after this profile has gone does nothing.
    ui::Command command(kQuickWindowCommand,
                        l10n_util::GetStringUTF16(IDS_REDROB_ENTRY_QUICK_WINDOW_TITLE),
                        /*global=*/true);
    command.set_accelerator(*accelerator);
    ui::CommandMap commands;
    commands.emplace(kQuickWindowCommand, command);
    listener->OnCommandsChanged(
        kAcceleratorGroup, profile_->GetBaseName().AsUTF8Unsafe(), commands,
        gfx::kNullAcceleratedWidget,
        // A method bound to a WeakPtr, not a lambda holding one: only the former reports itself
        // cancelled, which is what PruneStaleCommands reads to withdraw the binding.
        base::BindRepeating(&QuickWindowService::ExecuteCommand,
                            portal_weak_factory_.GetWeakPtr()));
    registered_ = accelerator;
    registered_externally_ = true;
    return;
  }

  // Registration is refused while handling is suspended (a shortcut-editing UI has it paused), so
  // lift the suspension for the call and restore it -- the same dance upstream's own launcher does.
  const bool suspended = listener->IsShortcutHandlingSuspended();
  listener->SetShortcutHandlingSuspended(false);
  // False when another application or another profile already holds the combination. That is not
  // an error to show: the window stays reachable by choosing another shortcut in settings.
  if (listener->RegisterAccelerator(*accelerator, this)) {
    registered_ = accelerator;
    registered_externally_ = false;
  }
  listener->SetShortcutHandlingSuspended(suspended);
}

void QuickWindowService::Unregister() {
  if (!registered_.has_value()) {
    return;
  }
  ui::GlobalAcceleratorListener* listener = ui::GlobalAcceleratorListener::GetInstance();
  if (listener) {
    if (registered_externally_) {
      // Invalidating the callback is how a portal binding is withdrawn: PruneStaleCommands drops
      // entries whose callbacks are cancelled.
      portal_weak_factory_.InvalidateWeakPtrs();
      listener->PruneStaleCommands();
    } else {
      const bool suspended = listener->IsShortcutHandlingSuspended();
      listener->SetShortcutHandlingSuspended(false);
      listener->UnregisterAccelerator(*registered_, this);
      listener->SetShortcutHandlingSuspended(suspended);
    }
  }
  registered_.reset();
  registered_externally_ = false;
}

void QuickWindowService::OnKeyPressed(const ui::Accelerator& accelerator) {
  if (registered_.has_value() && accelerator == *registered_) {
    Toggle();
  }
}

void QuickWindowService::ExecuteCommand(const std::string& accelerator_group_id,
                                        const std::string& command_id) {
  if (accelerator_group_id == kAcceleratorGroup && command_id == kQuickWindowCommand) {
    Toggle();
  }
}

bool QuickWindowService::IsShowing() const {
  return widget_ && widget_->IsVisible();
}

void QuickWindowService::Toggle() {
  if (IsShowing()) {
    Close();
  } else {
    Show();
  }
}

void QuickWindowService::Show() {
  if (widget_) {
    // Already built: bring it back to the front, which is what a second press of the shortcut from
    // another app means when the window had merely lost focus.
    widget_->Show();
    widget_->Activate();
    return;
  }
  // One quick window in the process. Another profile's is closed rather than stacked: two launchers
  // on screen, each for a different person, is a way to send a request to the wrong profile.
  CloseQuickWindow();

  // The contents is made here, not by the WebView, so it can be told it hosts an extension page
  // before the page loads. Without the observer the extension's API bindings never reach the frame
  // and the page renders with no chrome.* to call.
  std::unique_ptr<content::WebContents> contents =
      content::WebContents::Create(content::WebContents::CreateParams(profile_));
  extensions::ChromeExtensionWebContentsObserver::CreateForWebContents(contents.get());
  extensions::SetViewType(contents.get(), extensions::mojom::ViewType::kComponent);

  auto view = std::make_unique<QuickWindowView>(
      profile_, base::BindRepeating(&QuickWindowService::Close, weak_factory_.GetWeakPtr()));
  view->SetOwnedWebContents(std::move(contents));
  QuickWindowView* view_ptr = view.get();

  widget_delegate_ = std::make_unique<views::WidgetDelegate>();
  widget_delegate_->SetCanActivate(true);
  widget_delegate_->SetAccessibleTitle(
      l10n_util::GetStringUTF16(IDS_REDROB_ENTRY_QUICK_WINDOW_TITLE));
  widget_delegate_->SetTitle(l10n_util::GetStringUTF16(IDS_REDROB_ENTRY_QUICK_WINDOW_TITLE));
  widget_delegate_->SetInitiallyFocusedView(view_ptr);
  widget_delegate_->SetContentsView(std::move(view));

  views::Widget::InitParams params(views::Widget::InitParams::CLIENT_OWNS_WIDGET,
                                   views::Widget::InitParams::TYPE_WINDOW);
  params.remove_standard_frame = true;
  params.activatable = views::Widget::InitParams::Activatable::kYes;
  // Above other apps' windows: the shortcut was pressed over one of them, and a launcher that opens
  // behind the window you are in has not opened.
  params.z_order = ui::ZOrderLevel::kFloatingWindow;
  params.delegate = widget_delegate_.get();
  params.name = "RedrobQuickWindow";

  widget_ = std::make_unique<views::Widget>();
  widget_->Init(std::move(params));
  widget_->AddObserver(this);
  widget_->CenterWindow(kQuickWindowSize);

  SetQuickWindowCloser(base::BindRepeating(&QuickWindowService::Close, weak_factory_.GetWeakPtr()));

  view_ptr->LoadInitialURL(QuickWindowUrl());
  widget_->Show();
  widget_->Activate();
  view_ptr->RequestFocus();
}

void QuickWindowService::Close() {
  if (!widget_) {
    return;
  }
  ClearQuickWindowCloser();
  widget_->RemoveObserver(this);
  // Hidden now, destroyed on the next turn of the loop: Close is reached from inside the WebView's
  // own delegate calls (ESC, window.close()) and from an extension function the page is waiting on,
  // and destroying the WebContents under any of them would free the caller mid-call. Ownership moves
  // into the posted deletes, so a Show() before they run builds a fresh window instead of reviving
  // one that is about to be freed.
  if (!widget_->IsClosed()) {
    widget_->Hide();
  }
  auto task_runner = base::SingleThreadTaskRunner::GetCurrentDefault();
  task_runner->DeleteSoon(FROM_HERE, std::move(widget_));
  task_runner->DeleteSoon(FROM_HERE, std::move(widget_delegate_));
}

void QuickWindowService::OnWidgetDestroying(views::Widget* widget) {
  // Closed from outside (the window manager, the OS). The Widget object is ours to free; free it the
  // same deferred way Close() does.
  if (widget == widget_.get()) {
    Close();
  }
}

// static
QuickWindowService* QuickWindowServiceFactory::GetForProfile(Profile* profile) {
  return static_cast<QuickWindowService*>(
      GetInstance()->GetServiceForBrowserContext(profile, /*create=*/true));
}

// static
QuickWindowServiceFactory* QuickWindowServiceFactory::GetInstance() {
  static base::NoDestructor<QuickWindowServiceFactory> instance;
  return instance.get();
}

QuickWindowServiceFactory::QuickWindowServiceFactory()
    : ProfileKeyedServiceFactory("RedrobQuickWindowService",
                                 ProfileSelections::BuildForRegularProfile()) {}

QuickWindowServiceFactory::~QuickWindowServiceFactory() = default;

std::unique_ptr<KeyedService> QuickWindowServiceFactory::BuildServiceInstanceForBrowserContext(
    content::BrowserContext* context) const {
  return std::make_unique<QuickWindowService>(Profile::FromBrowserContext(context));
}

bool QuickWindowServiceFactory::ServiceIsCreatedWithBrowserContext() const {
  return true;
}

}  // namespace redrob
