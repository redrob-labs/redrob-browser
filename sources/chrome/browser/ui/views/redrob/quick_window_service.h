// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_SERVICE_H_
#define CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_SERVICE_H_

#include <memory>
#include <optional>
#include <string>

#include "base/memory/raw_ptr.h"
#include "base/memory/weak_ptr.h"
#include "base/no_destructor.h"
#include "chrome/browser/profiles/profile_keyed_service_factory.h"
#include "components/keyed_service/core/keyed_service.h"
#include "components/prefs/pref_change_registrar.h"
#include "ui/base/accelerators/accelerator.h"
#include "ui/base/accelerators/global_accelerator_listener/global_accelerator_listener.h"
#include "ui/views/widget/widget_observer.h"

class Profile;

namespace views {
class Widget;
class WidgetDelegate;
}  // namespace views

namespace redrob {

// The global quick window (CAP-5): a shortcut that works from any app, opening a small frameless
// window that asks the agent one thing.
//
// WHAT IT IS MADE OF. A frameless, always-on-top views::Widget holding one WebView, and in it the
// agent extension's own `#/quick` page (chrome://redrob/quick). The page is the extension's because
// the agent surface is the extension's: the input, the recent conversations and the way a request
// becomes a task are all already there, and a second, native copy of any of them would drift. What
// only native code can do -- a global shortcut, a window with no browser behind it -- is all this
// class does.
//
// ONE PER PROFILE, ONE SHORTCUT PER PROCESS. A global shortcut belongs to the OS, so the first
// profile to register it holds it and a second profile's registration fails quietly; that profile's
// window is still reachable by changing its shortcut. Created with the profile, because a hotkey
// nobody registered at startup is a hotkey that never works.
//
// THE SHORTCUT IS A PRESET, not free text. The pref holds one of a few ids (see
// redrob_prefs.h, kQuickWindowShortcut) and this class turns the id into an accelerator with the
// platform's primary modifier -- Ctrl on Windows and Linux, Command on macOS. A free-form string
// would let a renderer register any key on the machine, and capture an ordinary letter from every
// other application.
//
// ENTER opens the task in the last active browser window (redrob::OpenAgentChat, the address bar's
// path too), ESC closes, and pressing the shortcut again while the window is open closes it.
class QuickWindowService : public KeyedService,
                           public ui::GlobalAcceleratorListener::Observer,
                           public views::WidgetObserver {
 public:
  explicit QuickWindowService(Profile* profile);
  QuickWindowService(const QuickWindowService&) = delete;
  QuickWindowService& operator=(const QuickWindowService&) = delete;
  ~QuickWindowService() override;

  // The accelerator a preset id stands for on this platform, or nullopt for "off" and for an id this
  // build does not know.
  static std::optional<ui::Accelerator> AcceleratorForPreset(const std::string& preset);

  void Show();
  void Close();
  void Toggle();
  bool IsShowing() const;

  // KeyedService:
  void Shutdown() override;

  // ui::GlobalAcceleratorListener::Observer:
  void OnKeyPressed(const ui::Accelerator& accelerator) override;
  void ExecuteCommand(const std::string& accelerator_group_id,
                      const std::string& command_id) override;

  // views::WidgetObserver:
  void OnWidgetDestroying(views::Widget* widget) override;

 private:
  // Re-reads the pref and moves the registration to match it.
  void UpdateRegistration();
  void Unregister();

  raw_ptr<Profile> profile_;
  PrefChangeRegistrar pref_change_registrar_;

  // What is registered now, so a pref change can release exactly that.
  std::optional<ui::Accelerator> registered_;
  // True when the platform hands registration to the desktop (the Linux portal) and the shortcut was
  // offered through OnCommandsChanged rather than RegisterAccelerator.
  bool registered_externally_ = false;

  std::unique_ptr<views::WidgetDelegate> widget_delegate_;
  std::unique_ptr<views::Widget> widget_;

  // Separate from `weak_factory_` because invalidating it is how a portal binding is withdrawn, and
  // that must not also cancel the window's own close callbacks.
  base::WeakPtrFactory<QuickWindowService> portal_weak_factory_{this};
  base::WeakPtrFactory<QuickWindowService> weak_factory_{this};
};

class QuickWindowServiceFactory : public ProfileKeyedServiceFactory {
 public:
  static QuickWindowService* GetForProfile(Profile* profile);
  static QuickWindowServiceFactory* GetInstance();

 private:
  friend base::NoDestructor<QuickWindowServiceFactory>;
  QuickWindowServiceFactory();
  ~QuickWindowServiceFactory() override;

  std::unique_ptr<KeyedService> BuildServiceInstanceForBrowserContext(
      content::BrowserContext* context) const override;
  // Must exist from startup: the shortcut is the only way in, and nothing else would create it.
  bool ServiceIsCreatedWithBrowserContext() const override;
};

}  // namespace redrob

#endif  // CHROME_BROWSER_UI_VIEWS_REDROB_QUICK_WINDOW_SERVICE_H_
