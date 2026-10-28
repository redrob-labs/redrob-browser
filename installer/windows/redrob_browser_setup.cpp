// SPDX-License-Identifier: MIT OR Apache-2.0
// redrob_browser_setup -- the branded Windows setup and uninstaller for Redrob Browser.
//
// Ported from the Redrob Launcher setup (redrob-labs/redrob-launcher, installer/windows/), itself from the
// Redrob Canvas setup; all our own code. The window, the language screen and the design-system rules are
// the launcher's. What differs: the payload is Redrob Browser's folder (the programs, the GStreamer runtime
// and the Visual C++ runtime), there is no URL scheme or App Paths entry, and an install over Redrob
// Browser 0.1.x removes that version's MSI first.
//
// What it is: a native Win32 app, no dependencies beyond the Windows SDK. It renders a small borderless,
// rounded, DWM-shadowed 720 x 440 window: a Redrob Blue brand panel on the left, and a left-aligned content
// column (step dots, a title, one line under it, the screen's controls, buttons at the bottom right).
//
// Design system (@redrob-labs/ui):
//   * Follows Windows' app theme (AppsUseLightTheme): light = surface-base #FFFFFF, ink #0A0B0C; dark =
//     #0A0B0C, ink #F8F9FB. Every colour is a semantic role (Palette, below).
//   * Brand panel: radial gradient #2E7EFF -> #2B52FF -> #2746EE with a white and a #8B82FF glint, drawn in
//     Direct2D, with the design system's white symbol (res/symbol-white-192.png) as is.
//   * "Blue acts": the primary button, the checked box and the progress bar are action-primary #2B52FF.
//   * Controls are the DS Button (radius 8, h40), Checkbox (18 px, radius 4), Progress (8 px pill) and a
//     small Stepper, with hover, pressed and keyboard focus (2 px focus ring) states.
//   * Type is Pretendard for Latin and Wanted Sans for Hangul, embedded as a private DirectWrite
//     collection. Production builds fail if deterministic subsets cannot be embedded or loaded.
//   * Motion: 140 ms hover and 220 ms screen fades, DS standard easing; none when Windows' client-area
//     animation is off.
//
// Language: the first screen is bilingual and offers English / 한국어. The choice is stored under
// HKCU\Software\Redrob\Redrob Browser\Language (en, ko); Redrob Browser starts in it until the person picks
// another in its menu (crates/redrob-shell/src/i18n.rs). The screen defaults to the value a previous
// install recorded, else Korean on a Korean Windows, else English; --lang en|ko overrides.
//
// Install (per user, no administrator rights):
//   1. The payload is the release's own zip of the signed program folder (redrob-browser-window.exe and
//      the rest at the top level), embedded as RCDATA. It is written to %TEMP% and unpacked with Windows'
//      own tar.exe (bsdtar, in System32 since Windows 10 1803, reads zip) into
//      %LOCALAPPDATA%\Programs\Redrob Browser.new.
//   2. Redrob Browser 0.1.0 and 0.1.1 were a per-user MSI in the same folder: that product is removed with
//      msiexec first, so Settings > Apps lists one Redrob Browser.
//   3. The old install, if any, is renamed aside and the new one renamed into place, so a failed update
//      never leaves half of two versions. A running browser keeps its files locked; the setup asks the
//      person to close it.
//   4. The uninstaller (this same app built without a payload) is written into the install folder; the
//      Start menu shortcut (with the AppUserModelID ai.redrob.browser) and, if chosen, the desktop shortcut
//      are made; the Settings > Apps entry and the browser's own key (InstallDir, Language,
//      DesktopShortcutChoice) are written under HKCU.
//   5. Redrob Browser is opened (not with --silent).
// The steps report no progress of their own, so the bar is a time-based eased ramp capped at ~90% until
// they finish.
//
// Uninstall (Settings > Apps, or the uninstaller directly): confirm, with "Also delete bookmarks, history
// and settings" off by default; remove the shortcuts, the registry entries and the install folder. The
// running uninstaller cannot delete itself, so a hidden PowerShell removes it and the folder once it exits.
//
// Flags:
//   --lang en|ko         start in that language (skips nothing: the language screen still shows, preselected).
//   --silent             install (or, with --uninstall, remove) with no window; the exit code is the result.
//   --delete-data        with --uninstall --silent: also delete the browser's profile (bookmarks, history,
//                        settings, logs).
//   --demo               run the whole install sequence on a timer with NO payload.
//   --demo-error         show the error state immediately.
//   --uninstall          remove Redrob Browser (what Settings > Apps runs).
//   --demo-uninstall     the uninstall sequence on a timer, removing nothing.
//   --render-stages DIR  draw each screen to a PNG in DIR, no window.
//   (no flag)            install the embedded payload for real.

#ifndef UNICODE
#define UNICODE
#endif
#ifndef NOMINMAX
#define NOMINMAX  // keep windows.h's min/max macros from breaking std::min/std::max
#endif

#include <windows.h>
#include <windowsx.h>
#include <dwmapi.h>
#include <d2d1.h>
#include <d2d1helper.h>
#include <dwrite.h>
#include <dwrite_3.h>  // IDWriteFactory5: the in-memory font collection
#include <wincodec.h>
#include <shellapi.h>
#include <shlobj.h>
#include <shobjidl.h>
#include <shlguid.h>
#include <propsys.h>
#include <propvarutil.h>
#include <initguid.h>   // so propkey.h DEFINES the PKEY_* keys in this one translation unit
#include <propkey.h>
#include <UIAutomation.h>  // real fragment providers expose the custom-painted UI to assistive technology
#include <tlhelp32.h>
#include <msi.h>  // MsiEnumRelatedProductsW: the 0.1.x MSI an install replaces
#include <string>
#include <algorithm>
#include <cctype>
#include <memory>
#include <new>
#include <vector>

#include "resource.h"
#include "build_defs.h"  // generated by build.py: version, resource paths

#pragma comment(lib, "dwmapi.lib")
#pragma comment(lib, "d2d1.lib")
#pragma comment(lib, "dwrite.lib")
#pragma comment(lib, "windowscodecs.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "gdi32.lib")
#pragma comment(lib, "advapi32.lib")
#pragma comment(lib, "propsys.lib")
#pragma comment(lib, "uiautomationcore.lib")
#pragma comment(lib, "oleaut32.lib")
#pragma comment(lib, "msi.lib")

namespace {

// ---- design-system colors (@redrob-labs/ui semantic roles) ------------------
constexpr D2D1_COLOR_F Hex(unsigned v, float a = 1.0f) {
  return {((v >> 16) & 0xFF) / 255.0f, ((v >> 8) & 0xFF) / 255.0f, (v & 0xFF) / 255.0f, a};
}

// One set per theme. The window follows Windows' app theme (light or dark), like the browser.
struct Palette {
  D2D1_COLOR_F base;         // surface-base: the content column's ground
  D2D1_COLOR_F sunken;       // surface-sunken: progress track, secondary button hover
  D2D1_COLOR_F ink;          // ink-primary: titles, labels
  D2D1_COLOR_F secondary;    // ink-secondary: body copy, caption glyphs
  D2D1_COLOR_F hairline;     // border-subtle: step connectors
  D2D1_COLOR_F strong;       // border-strong: control outlines (secondary button, checkbox)
  D2D1_COLOR_F blue;         // action-primary
  D2D1_COLOR_F blueHover;    // action-primary-hover (hover and pressed)
  D2D1_COLOR_F focus;        // focus-ring
  D2D1_COLOR_F danger;       // status-danger: close-button hover
  D2D1_COLOR_F inkBrand;     // ink-brand: the current step's number
  D2D1_COLOR_F brandSubtle;  // surface-brand-subtle: the current step's halo
};
// Generated semantic roles and fixed brand-art exceptions keep native colours in lockstep.
#include "generated_tokens.h"

bool g_dark = false;  // set from Windows' AppsUseLightTheme at start (or --theme)
int g_themeFlag = 0;  // --theme: 0 follow Windows, 1 light, 2 dark (a dev aid, mainly for --render-stages)
inline const Palette& Pal() { return g_dark ? kDark : kLight; }
// a -> b by t (0..1): hover and pressed states blend between two roles.
inline D2D1_COLOR_F Mix(const D2D1_COLOR_F& a, const D2D1_COLOR_F& b, float t) {
  return {a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t, a.a + (b.a - a.a) * t};
}

// Windows' app theme: HKCU\...\Themes\Personalize\AppsUseLightTheme (0 = dark). Read only. Light if unset.
static bool SystemPrefersDark() {
  if (g_themeFlag == 1) return false;
  if (g_themeFlag == 2) return true;
  DWORD value = 1, size = sizeof(value);
  if (RegGetValueW(HKEY_CURRENT_USER, L"Software\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize",
                   L"AppsUseLightTheme", RRF_RT_REG_DWORD, nullptr, &value, &size) != ERROR_SUCCESS)
    return false;
  return value == 0;
}

// ---- geometry (logical px at 96 DPI) ---------------------------------------
constexpr int   kBaseW   = 720;
constexpr int   kBaseH   = 440;
constexpr float kCaption = 40.0f;   // top drag strip height; the caption buttons are this tall
constexpr float kPanelW  = 240.0f;  // the brand panel on the left
constexpr float kPad     = 32.0f;   // the content column's padding
constexpr float kCapBtnW = 46.0f;   // each caption button

// window messages / timers
constexpr UINT_PTR kTickTimer = 1;
constexpr UINT     kTickMs     = 16;   // ~60fps for the eased bar / fades
constexpr UINT_PTR kAnimTimer = 2;     // hover and stage fades; runs only while something moves
constexpr float    kHoverMs = 140.0f;  // DS motion "fast", standard easing
constexpr float    kStageMs = 220.0f;  // DS motion "base": a new screen's content fades in
constexpr UINT_PTR kPayloadMsgDone = (WM_APP + 1);
constexpr UINT_PTR kUninstallMsgDone = (WM_APP + 2);
constexpr UINT_PTR kStageMsg = (WM_APP + 3);  // the worker moved on: wParam is the Stage
constexpr UINT_PTR kA11yInvokeMsg = (WM_APP + 4);  // UIA calls marshal actions onto the window thread
constexpr UINT_PTR kA11yFocusMsg = (WM_APP + 5);   // UIA focus uses the same state as keyboard focus

// Results the install and uninstall workers post. 0 is success; anything else is a Win32 error code, except
// these, which have their own sentences.
constexpr DWORD kResultAppRunning = 0xE0000001;   // Redrob Browser is open from the install folder
constexpr DWORD kResultUnpackFailed = 0xE0000002; // tar.exe could not unpack the payload
constexpr DWORD kResultNoExe = 0xE0000003;        // the unpacked payload has no redrob-browser-window.exe

// Where everything goes. Per user, like every other app that installs without administrator rights. The
// folder the 0.1.x MSI used, so an update over it lands in place.
constexpr wchar_t kInstallSubdir[] = L"\\Programs\\Redrob Browser";  // under %LOCALAPPDATA%
constexpr wchar_t kAppExeRel[] = L"\\redrob-browser-window.exe";      // the window; the zip's own layout
constexpr wchar_t kUninstallerName[] = L"\\Uninstall Redrob Browser.exe";
constexpr wchar_t kShortcutName[] = L"\\Redrob Browser.lnk";
constexpr wchar_t kAppUserModelId[] = L"ai.redrob.browser";
// Settings > Apps. Its own key.
constexpr wchar_t kArpKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\RedrobBrowser";
// The browser's own key: InstallDir, Language (i18n.rs), DesktopShortcutChoice.
constexpr wchar_t kAppKey[] = L"Software\\Redrob\\Redrob Browser";
// The UpgradeCode of the Redrob Browser 0.1.0 and 0.1.1 MSI (installer/windows/redrob-browser.wxs then).
constexpr wchar_t kMsiUpgradeCode[] = L"{3E1D3581-4920-4530-BD81-BA7B0926E403}";

enum class Stage { Preparing, Installing, Opening, Error, Confirm, Removing, Removed, Welcome, Language };
enum class Mode { Install, Uninstall };
enum class Lang { En, Ko };
enum class A11yId { Root, Brand, Stepper, Title, Body, Progress, Minimize, Close, Primary, Secondary, Checkbox };
class A11yProvider;

// The language every screen after the first draws in. Set by the language screen (or --lang, or the
// value a previous install recorded, or the Windows UI language), read by Tr() at every string.
Lang g_lang = Lang::En;
inline const wchar_t* Tr(const wchar_t* en, const wchar_t* ko) { return g_lang == Lang::Ko ? ko : en; }

// A tiny COM pointer so cleanup is not a maze of gotos. Move-only: a plain
// memberwise copy would double-Release (and a function returning one by value
// would hand back an already-freed interface).
template <class T> struct ComPtr {
  T* p = nullptr;
  ComPtr() = default;
  ComPtr(const ComPtr&) = delete;
  ComPtr& operator=(const ComPtr&) = delete;
  ComPtr(ComPtr&& o) noexcept : p(o.p) { o.p = nullptr; }
  ComPtr& operator=(ComPtr&& o) noexcept {
    if (std::addressof(o) != this) { if (p) p->Release(); p = o.p; o.p = nullptr; }
    return *this;
  }
  ~ComPtr() { if (p) p->Release(); }
  T** operator&() { return &p; }
  T* operator->() const { return p; }
  explicit operator bool() const { return p != nullptr; }
  void reset() { if (p) { p->Release(); p = nullptr; } }
};

// ---------------------------------------------------------------------------
// The app object. One window, Direct2D render target, DirectWrite text, WIC for
// the PNG resources, and a worker thread that runs the payload.
// ---------------------------------------------------------------------------
class SetupApp {
  friend class A11yProvider;
  friend void RaiseStructureChanged(SetupApp*);
  friend void RaiseToggleChanged(SetupApp*, bool, bool);
  friend void RaiseFocusChanged(SetupApp*, A11yId);
  friend void RaiseProgressChanged(SetupApp*, double, double);
 public:
  SetupApp(bool demo, bool demoError, Mode mode) : demo_(demo), demoError_(demoError), mode_(mode) {}

  int Run(HINSTANCE hinst);
  // --silent: the same work with no window, for scripted installs and the launcher.
  // The process exit code is the worker's result (0 = success). Never opens the browser afterwards.
  int RunSilent(HINSTANCE hinst, bool deleteData);

 private:
  static LRESULT CALLBACK WndProcThunk(HWND, UINT, WPARAM, LPARAM);
  LRESULT WndProc(UINT, WPARAM, LPARAM);

  void CreateDeviceResources();
  void DiscardDeviceResources();
  void OnPaint();
  void OnTick();
  void LayoutText();
  void ApplyHangulFont(IDWriteTextLayout* layout, const std::wstring& text);
  void DrawTextLine(const std::wstring& text, IDWriteTextFormat* format, const D2D1_RECT_F& rect, ID2D1Brush* brush);
  RECT ToDevice(float x, float y, float w, float h);

  ComPtr<ID2D1Bitmap> LoadPngResource(int resId, ID2D1RenderTarget* rt);
  HRESULT DrawScene();  // BeginDraw..EndDraw on rt_, whatever kind of target it is
 public:
  // --render-stages <dir>: draw each screen into a PNG with no window, so the layout can be checked
  // on a machine reached over ssh, where no window can be shown. Returns 0 when every file was written.
  int RenderStages(HINSTANCE hinst, const std::wstring& dir);
  bool Uninstalling() const { return mode_ == Mode::Uninstall; }
 private:

  // payload
  static DWORD WINAPI PayloadThunk(LPVOID self);
  DWORD RunPayload();
  DWORD InstallApp();
  bool ExtractPayload(std::wstring& outPath);
  bool InstallUninstaller(const std::wstring& dir);
  void RecordChoices(const std::wstring& dir);

  void StartInstall();

  // uninstall
  static DWORD WINAPI UninstallThunk(LPVOID self);
  DWORD RunUninstall();
  void StartUninstall();
  void ScheduleSelfCleanup();

  void SetStage(Stage s);
  void RequestClose(bool force);
  void ChooseLanguage(Lang l);

  HINSTANCE hinst_ = nullptr;
  HWND hwnd_ = nullptr;
  UINT dpi_ = 96;
  bool demo_ = false;
  bool demoError_ = false;
  Mode mode_ = Mode::Install;
  bool deleteData_ = false;       // the confirm screen's "also delete settings"
  bool silent_ = false;
  bool desktopShortcut_ = true;   // the welcome screen's "create a desktop shortcut"; a previous choice is kept

  // Direct2D / DirectWrite / WIC
  ComPtr<ID2D1Factory>        d2dFactory_;
  ComPtr<IDWriteFactory>      dwFactory_;
  ComPtr<IWICImagingFactory>  wicFactory_;
  ComPtr<ID2D1RenderTarget> rt_;
  ComPtr<ID2D1Bitmap>         symbolBitmap_;  // assets/brand/symbol-white-192.png, verbatim
  ComPtr<IDWriteTextFormat>   fmtTitle_;      // 21/600, the screen's one title
  ComPtr<IDWriteTextFormat>   fmtBody_;       // 14/22, ink-secondary, under the title
  ComPtr<IDWriteTextFormat>   fmtButton_;     // 14/600, centred in a button
  ComPtr<IDWriteTextFormat>   fmtLabel_;      // 14, a checkbox label
  ComPtr<IDWriteTextFormat>   fmtStep_;       // 12/600, the step labels and numbers
  ComPtr<IDWriteTextFormat>   fmtBrand_;      // 15/600, the product name on the brand panel
  ComPtr<IDWriteFontCollection> fontColl_;
  std::wstring                fontFamily_ = L"Segoe UI Variable Display";
  std::wstring                bodyFamily_ = L"Segoe UI Variable Text";
  std::wstring                hangulFamily_;
  bool                        bundledFontsReady_ = false;

  // drawing helpers (DrawScene)
  float TextWidth(const std::wstring& s, IDWriteTextFormat* f);
  float DrawBlock(const std::wstring& s, IDWriteTextFormat* f, float x, float y, float w, ID2D1Brush* b);
  void DrawBrandPanel(float H);
  void DrawStepper(float x, float y);
  void ApplyWindowTheme();

  // state
  Stage  stage_ = Stage::Preparing;
  double progress_ = 0.0;      // 0..1 displayed
  double progressTarget_ = 0.0;
  ULONGLONG startTick_ = 0;
  ULONGLONG openedAt_ = 0;
  ULONGLONG stageTick_ = 0;    // when the current stage began; the install ramps from here
  bool payloadDone_ = false;
  DWORD payloadExit_ = 0;
  HANDLE payloadThread_ = nullptr;
  std::wstring errorMessage_;

  // Painting, hit testing, and UIA share these exact device-pixel bounds, avoiding proxy controls.
  RECT rcMin_{}, rcClose_{}, rcRetry_{}, rcErrClose_{}, rcCheck_{};
  RECT rcBrand_{}, rcStepper_{}, rcTitle_{}, rcBody_{}, rcProgress_{};

  // Pointer and keyboard state of the controls. Retry = the primary button (English on the language screen),
  // ErrClose = the secondary one (한국어 there), Check = the checkbox row.
  enum Ctl { kNone = 0, kMin, kClose, kRetry, kErrClose, kCheck, kCtlCount };
  int hover_ = kNone;          // under the pointer
  int pressed_ = kNone;        // mouse went down here; the action runs on release over it
  int focus_ = kNone;          // virtual logical focus, synchronized with UIA while the HWND is focused
  bool focusVisible_ = false;  // input modality: keyboard shows the ring; pointer input hides it
  bool trackingMouse_ = false;
  bool reducedMotion_ = false; // SPI_GETCLIENTAREAANIMATION off: no fades
  float hoverT_[kCtlCount] = {};  // 0..1 per control, eased toward hover/pressed
  ULONGLONG animLast_ = 0;
  int HitTest(POINT pt) const;
  void Activate(int ctl);
  void UpdateHover();
  void StartAnim();
  bool AnimStep();  // advance; true while anything still moves
  std::vector<int> Focusables() const;
  bool IsFocusable(int ctl) const;
  bool WindowHasKeyboardFocus() const;
  void SetLogicalFocus(int ctl, bool showRing);
  float Eased(int ctl) const;
  float StageFade() const;
};

SetupApp* g_app = nullptr;

std::wstring StatusText(Stage s) {
  switch (s) {
    case Stage::Language:   return L"Choose your language\n언어를 선택하세요";
    case Stage::Welcome:    return Tr(L"Install Redrob Browser", L"Redrob Browser 설치");
    case Stage::Preparing:  return Tr(L"Preparing to install", L"설치를 준비하고 있어요");
    case Stage::Installing: return Tr(L"Installing Redrob Browser", L"Redrob Browser를 설치하고 있어요");
    case Stage::Opening:    return Tr(L"Opening Redrob Browser", L"Redrob Browser를 열고 있어요");
    case Stage::Error:      return g_app && g_app->Uninstalling()
                                   ? Tr(L"Redrob Browser was not removed", L"Redrob Browser를 제거하지 못했어요")
                                   : Tr(L"Setup did not finish", L"설치를 마치지 못했어요");
    case Stage::Confirm:    return Tr(L"Uninstall Redrob Browser?", L"Redrob Browser를 제거할까요?");
    case Stage::Removing:   return Tr(L"Removing Redrob Browser", L"Redrob Browser를 제거하고 있어요");
    case Stage::Removed:    return Tr(L"Redrob Browser is removed", L"Redrob Browser를 제거했어요");
  }
  return L"";
}

// The line under each screen's title. The error screen's is the worker's result (ResultSentence).
std::wstring BodyText(Stage s, bool deleteData, const std::wstring& error) {
  switch (s) {
    case Stage::Language:
      return L"Setup and Redrob Browser use this language. You can change it later in Redrob Browser's menu.\n"
             L"설치 화면과 Redrob Browser에 이 언어가 적용돼요. 나중에 Redrob Browser 메뉴에서 바꿀 수 있어요.";
    case Stage::Welcome:
      return Tr(L"It installs for this Windows account only, so no administrator rights are needed. Redrob Browser opens when setup is done.",
                L"이 Windows 계정에만 설치해서 관리자 권한이 필요 없어요. 설치가 끝나면 Redrob Browser가 열려요.");
    case Stage::Preparing: case Stage::Installing:
      return Tr(L"Redrob Browser opens when it is done.", L"끝나면 Redrob Browser가 열려요.");
    case Stage::Opening:
      return Tr(L"Redrob Browser is installed. This window closes by itself.",
                L"Redrob Browser를 설치했어요. 이 창은 자동으로 닫혀요.");
    case Stage::Confirm:
      return Tr(L"This removes Redrob Browser from this PC. Your downloads and other files stay where they are.",
                L"이 PC에서 Redrob Browser를 제거해요. 다운로드한 파일과 내 파일은 그대로 남아요.");
    case Stage::Removing:
      return Tr(L"Your downloads and other files stay where they are.", L"다운로드한 파일과 내 파일은 그대로 남아요.");
    case Stage::Removed:
      return deleteData ? Tr(L"Its bookmarks, history and settings are deleted too. Your downloads stay where they are.",
                             L"북마크, 방문 기록과 설정도 삭제했어요. 다운로드한 파일은 그대로 남아요.")
                        : Tr(L"Its bookmarks, history and settings stay on this PC for a later install.",
                             L"북마크, 방문 기록과 설정은 다시 설치할 때 쓸 수 있도록 이 PC에 남겨 뒀어요.");
    case Stage::Error: return error;
    default: return L"";
  }
}

// What the error screen says for a worker's result.
std::wstring ResultSentence(DWORD code, bool uninstall) {
  if (code == kResultAppRunning)
    return uninstall ? Tr(L"Redrob Browser is open. Close all of its windows, then press Retry.",
                          L"Redrob Browser가 실행 중이에요. 창을 모두 닫은 뒤 다시 시도를 누르세요.")
                     : Tr(L"Redrob Browser is open. Close all of its windows, then press Retry to update it.",
                          L"Redrob Browser가 실행 중이에요. 창을 모두 닫은 뒤 다시 시도를 눌러 업데이트하세요.");
  if (code == kResultUnpackFailed)
    return Tr(L"The app files could not be unpacked. Press Retry to try again.", L"앱 파일의 압축을 풀지 못했어요. 다시 시도를 눌러 주세요.");
  if (code == kResultNoExe)
    return Tr(L"This setup file is damaged. Please download it again.", L"이 설치 파일이 손상됐어요. 다시 다운로드해 주세요.");
  if (code == ERROR_DISK_FULL || code == ERROR_HANDLE_DISK_FULL)
    return Tr(L"There is not enough free disk space. Free some space, then press Retry.",
              L"디스크 공간이 부족해요. 공간을 비운 뒤 다시 시도를 누르세요.");
  if (code == ERROR_ACCESS_DENIED || code == ERROR_SHARING_VIOLATION)
    return Tr(L"A file is in use. Close Redrob Browser and anything opened from its folder, then press Retry.",
              L"파일이 사용 중이에요. Redrob Browser와 그 폴더에서 연 파일을 모두 닫은 뒤 다시 시도를 누르세요.");
  const std::wstring n = std::to_wstring(code);
  return g_lang == Lang::Ko ? L"Windows 오류 코드 " + n + L". 다시 시도를 눌러 주세요."
                            : L"Windows error code " + n + L". Press Retry to try again.";
}

// ---------------------------------------------------------------------------
// A virtual UI Automation fragment is the maintainable native contract for this custom-painted window:
// its nodes use the same bounds and actions as painting, hit testing, keyboard focus, and stage state.
class A11yProvider final : public IRawElementProviderSimple, public IRawElementProviderFragment,
                           public IRawElementProviderFragmentRoot, public IInvokeProvider,
                           public IToggleProvider, public IRangeValueProvider {
 public:
  A11yProvider(SetupApp* app, A11yId id) : app_(app), id_(id) {}
  IFACEMETHODIMP QueryInterface(REFIID iid, void** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    if (iid == __uuidof(IUnknown) || iid == __uuidof(IRawElementProviderSimple)) *out = static_cast<IRawElementProviderSimple*>(this);
    else if (iid == __uuidof(IRawElementProviderFragment)) *out = static_cast<IRawElementProviderFragment*>(this);
    else if (iid == __uuidof(IRawElementProviderFragmentRoot) && id_ == A11yId::Root) *out = static_cast<IRawElementProviderFragmentRoot*>(this);
    else if (iid == __uuidof(IInvokeProvider) && IsButton()) *out = static_cast<IInvokeProvider*>(this);
    else if (iid == __uuidof(IToggleProvider) && id_ == A11yId::Checkbox) *out = static_cast<IToggleProvider*>(this);
    else if (iid == __uuidof(IRangeValueProvider) && id_ == A11yId::Progress) *out = static_cast<IRangeValueProvider*>(this);
    if (!*out) return E_NOINTERFACE;
    AddRef();
    return S_OK;
  }
  IFACEMETHODIMP_(ULONG) AddRef() override { return static_cast<ULONG>(InterlockedIncrement(&refs_)); }
  IFACEMETHODIMP_(ULONG) Release() override {
    const LONG refs = InterlockedDecrement(&refs_);
    if (!refs) delete this;
    return static_cast<ULONG>(refs);
  }
  IFACEMETHODIMP get_ProviderOptions(ProviderOptions* options) override {
    if (!options) return E_INVALIDARG;
    *options = ProviderOptions_ServerSideProvider;
    return S_OK;
  }
  IFACEMETHODIMP GetPatternProvider(PATTERNID pattern, IUnknown** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    if (pattern == UIA_InvokePatternId && IsButton()) return QueryInterface(__uuidof(IInvokeProvider), reinterpret_cast<void**>(out));
    if (pattern == UIA_TogglePatternId && id_ == A11yId::Checkbox) return QueryInterface(__uuidof(IToggleProvider), reinterpret_cast<void**>(out));
    if (pattern == UIA_RangeValuePatternId && id_ == A11yId::Progress) return QueryInterface(__uuidof(IRangeValueProvider), reinterpret_cast<void**>(out));
    return S_OK;
  }
  IFACEMETHODIMP GetPropertyValue(PROPERTYID property, VARIANT* value) override {
    if (!value) return E_INVALIDARG;
    VariantInit(value);
    if (!Available()) return UIA_E_ELEMENTNOTAVAILABLE;
    if (property == UIA_NamePropertyId) return SetString(value, Name());
    if (property == UIA_AutomationIdPropertyId) return SetString(value, AutomationId());
    if (property == UIA_FrameworkIdPropertyId) return SetString(value, L"Win32");
    if (property == UIA_ClassNamePropertyId) return SetString(value, L"RedrobBrowserSetup");
    if (property == UIA_ControlTypePropertyId) {
      value->vt = VT_I4; value->lVal = ControlType();
    } else if (property == UIA_IsControlElementPropertyId || property == UIA_IsContentElementPropertyId) {
      value->vt = VT_BOOL; value->boolVal = VARIANT_TRUE;
    } else if (property == UIA_IsEnabledPropertyId) {
      value->vt = VT_BOOL; value->boolVal = Enabled() ? VARIANT_TRUE : VARIANT_FALSE;
    } else if (property == UIA_IsKeyboardFocusablePropertyId) {
      value->vt = VT_BOOL; value->boolVal = KeyboardFocusable() ? VARIANT_TRUE : VARIANT_FALSE;
    } else if (property == UIA_HasKeyboardFocusPropertyId) {
      value->vt = VT_BOOL; value->boolVal = HasFocus() ? VARIANT_TRUE : VARIANT_FALSE;
    } else if (property == UIA_LiveSettingPropertyId &&
               (id_ == A11yId::Title || (id_ == A11yId::Body && app_->stage_ == Stage::Error))) {
      value->vt = VT_I4; value->lVal = Assertive;
    } else if (property == UIA_ItemStatusPropertyId && (id_ == A11yId::Primary || id_ == A11yId::Secondary) &&
               app_->stage_ == Stage::Language) {
      const bool selected = (id_ == A11yId::Primary) == (g_lang == Lang::En);
      if (selected) return SetString(value, Tr(L"Selected", L"선택됨"));
    }
    return S_OK;
  }
  IFACEMETHODIMP get_HostRawElementProvider(IRawElementProviderSimple** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    return id_ == A11yId::Root ? UiaHostProviderFromHwnd(app_->hwnd_, out) : S_OK;
  }
  IFACEMETHODIMP Navigate(NavigateDirection direction, IRawElementProviderFragment** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    if (!Available()) return UIA_E_ELEMENTNOTAVAILABLE;
    const auto children = Children();
    if (id_ == A11yId::Root) {
      if (children.empty()) return S_OK;
      if (direction == NavigateDirection_FirstChild) return New(children.front(), out);
      if (direction == NavigateDirection_LastChild) return New(children.back(), out);
      return S_OK;
    }
    if (direction == NavigateDirection_Parent) return New(A11yId::Root, out);
    const auto at = std::find(children.begin(), children.end(), id_);
    if (at == children.end()) return UIA_E_ELEMENTNOTAVAILABLE;
    if (direction == NavigateDirection_NextSibling && at + 1 != children.end()) return New(*(at + 1), out);
    if (direction == NavigateDirection_PreviousSibling && at != children.begin()) return New(*(at - 1), out);
    return S_OK;
  }
  IFACEMETHODIMP GetRuntimeId(SAFEARRAY** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    if (id_ == A11yId::Root) return S_OK;
    SAFEARRAY* ids = SafeArrayCreateVector(VT_I4, 0, 2);
    if (!ids) return E_OUTOFMEMORY;
    LONG index = 0; int value = UiaAppendRuntimeId;
    SafeArrayPutElement(ids, &index, &value);
    ++index; value = static_cast<int>(id_); SafeArrayPutElement(ids, &index, &value);
    *out = ids;
    return S_OK;
  }
  IFACEMETHODIMP get_BoundingRectangle(UiaRect* bounds) override {
    if (!bounds) return E_INVALIDARG;
    *bounds = {};
    if (!Available()) return UIA_E_ELEMENTNOTAVAILABLE;
    const RECT rect = RectFor(id_);
    POINT top{rect.left, rect.top}, bottom{rect.right, rect.bottom};
    if (id_ != A11yId::Root) { ClientToScreen(app_->hwnd_, &top); ClientToScreen(app_->hwnd_, &bottom); }
    bounds->left = top.x; bounds->top = top.y; bounds->width = bottom.x - top.x; bounds->height = bottom.y - top.y;
    return S_OK;
  }
  IFACEMETHODIMP GetEmbeddedFragmentRoots(SAFEARRAY** out) override { if (!out) return E_INVALIDARG; *out = nullptr; return S_OK; }
  IFACEMETHODIMP SetFocus() override {
    if (!Available() || !KeyboardFocusable()) return UIA_E_NOTSUPPORTED;
    PostMessageW(app_->hwnd_, kA11yFocusMsg, static_cast<WPARAM>(Control()), 0);
    return S_OK;
  }
  IFACEMETHODIMP get_FragmentRoot(IRawElementProviderFragmentRoot** out) override {
    if (!out) return E_INVALIDARG;
    *out = new (std::nothrow) A11yProvider(app_, A11yId::Root);
    return *out ? S_OK : E_OUTOFMEMORY;
  }
  IFACEMETHODIMP ElementProviderFromPoint(double x, double y, IRawElementProviderFragment** out) override {
    if (!out) return E_INVALIDARG;
    POINT point{static_cast<LONG>(x), static_cast<LONG>(y)};
    ScreenToClient(app_->hwnd_, &point);
    const auto children = Children();
    for (auto it = children.rbegin(); it != children.rend(); ++it) { RECT rect = RectFor(*it); if (PtInRect(&rect, point)) return New(*it, out); }
    return New(A11yId::Root, out);
  }
  IFACEMETHODIMP GetFocus(IRawElementProviderFragment** out) override {
    if (!out) return E_INVALIDARG;
    *out = nullptr;
    if (!Available()) return UIA_E_ELEMENTNOTAVAILABLE;
    // Virtual focus is meaningful only while this top-level HWND owns the thread's real keyboard focus.
    if (!app_->WindowHasKeyboardFocus()) return S_OK;
    return New(IdForControl(app_->focus_), out);
  }
  IFACEMETHODIMP Invoke() override {
    if (!Available()) return UIA_E_ELEMENTNOTAVAILABLE;
    if (!IsButton()) return UIA_E_NOTSUPPORTED;
    if (!Enabled()) return UIA_E_ELEMENTNOTENABLED;
    PostMessageW(app_->hwnd_, kA11yInvokeMsg, static_cast<WPARAM>(Control()), 0);
    return S_OK;
  }
  IFACEMETHODIMP Toggle() override {
    if (!Available() || id_ != A11yId::Checkbox) return UIA_E_ELEMENTNOTAVAILABLE;
    PostMessageW(app_->hwnd_, kA11yInvokeMsg, static_cast<WPARAM>(SetupApp::kCheck), 0);
    return S_OK;
  }
  IFACEMETHODIMP get_ToggleState(ToggleState* state) override {
    if (!state) return E_INVALIDARG;
    if (!Available() || id_ != A11yId::Checkbox) return UIA_E_ELEMENTNOTAVAILABLE;
    *state = (app_->stage_ == Stage::Welcome ? app_->desktopShortcut_ : app_->deleteData_) ? ToggleState_On : ToggleState_Off;
    return S_OK;
  }
  IFACEMETHODIMP SetValue(double) override { return UIA_E_NOTSUPPORTED; }
  IFACEMETHODIMP get_Value(double* value) override { if (!value) return E_INVALIDARG; *value = app_->progress_ * 100.0; return Available() ? S_OK : UIA_E_ELEMENTNOTAVAILABLE; }
  IFACEMETHODIMP get_IsReadOnly(BOOL* value) override { if (!value) return E_INVALIDARG; *value = TRUE; return S_OK; }
  IFACEMETHODIMP get_Maximum(double* value) override { if (!value) return E_INVALIDARG; *value = 100.0; return S_OK; }
  IFACEMETHODIMP get_Minimum(double* value) override { if (!value) return E_INVALIDARG; *value = 0.0; return S_OK; }
  IFACEMETHODIMP get_LargeChange(double* value) override { if (!value) return E_INVALIDARG; *value = 0.0; return S_OK; }
  IFACEMETHODIMP get_SmallChange(double* value) override { if (!value) return E_INVALIDARG; *value = 0.0; return S_OK; }

  static A11yId IdForControl(int control) {
    if (control == SetupApp::kMin) return A11yId::Minimize;
    if (control == SetupApp::kClose) return A11yId::Close;
    if (control == SetupApp::kRetry) return A11yId::Primary;
    if (control == SetupApp::kErrClose) return A11yId::Secondary;
    if (control == SetupApp::kCheck) return A11yId::Checkbox;
    return A11yId::Root;
  }
 private:
  bool Available() const {
    if (!app_ || !app_->hwnd_ || !IsWindow(app_->hwnd_)) return false;
    if (id_ == A11yId::Root) return true;
    const auto list = Children();
    return std::find(list.begin(), list.end(), id_) != list.end();
  }
  bool IsButton() const { return id_ == A11yId::Minimize || id_ == A11yId::Close || id_ == A11yId::Primary || id_ == A11yId::Secondary; }
  bool IsInteractive() const { return IsButton() || id_ == A11yId::Checkbox; }
  bool Enabled() const { return !(id_ == A11yId::Close && app_->stage_ == Stage::Removing); }
  bool KeyboardFocusable() const {
    if (!IsInteractive()) return false;
    const auto order = app_->Focusables();
    return std::find(order.begin(), order.end(), Control()) != order.end();
  }
  int Control() const {
    if (id_ == A11yId::Minimize) return SetupApp::kMin; if (id_ == A11yId::Close) return SetupApp::kClose;
    if (id_ == A11yId::Primary) return SetupApp::kRetry; if (id_ == A11yId::Secondary) return SetupApp::kErrClose;
    return id_ == A11yId::Checkbox ? SetupApp::kCheck : SetupApp::kNone;
  }
  bool HasFocus() const {
    return app_->WindowHasKeyboardFocus() && id_ == IdForControl(app_->focus_);
  }
  CONTROLTYPEID ControlType() const {
    if (id_ == A11yId::Root) return UIA_WindowControlTypeId; if (IsButton()) return UIA_ButtonControlTypeId;
    if (id_ == A11yId::Checkbox) return UIA_CheckBoxControlTypeId; if (id_ == A11yId::Progress) return UIA_ProgressBarControlTypeId;
    return UIA_TextControlTypeId;
  }
  std::wstring Name() const {
    if (id_ == A11yId::Root) { wchar_t title[128]{}; GetWindowTextW(app_->hwnd_, title, ARRAYSIZE(title)); return title; }
    if (id_ == A11yId::Brand) return L"Redrob Browser";
    if (id_ == A11yId::Title) return StatusText(app_->stage_);
    if (id_ == A11yId::Body) return BodyText(app_->stage_, app_->deleteData_, app_->errorMessage_);
    if (id_ == A11yId::Minimize) return Tr(L"Minimize", L"최소화"); if (id_ == A11yId::Close) return Tr(L"Close", L"닫기");
    if (id_ == A11yId::Progress) return app_->mode_ == Mode::Uninstall ? Tr(L"Removal progress", L"제거 진행률") : Tr(L"Installation progress", L"설치 진행률");
    if (id_ == A11yId::Checkbox) return app_->stage_ == Stage::Welcome ? Tr(L"Create a desktop shortcut", L"바탕 화면에 바로 가기 만들기") : Tr(L"Also delete bookmarks, history and settings", L"북마크, 방문 기록과 설정도 삭제");
    if (id_ == A11yId::Stepper) {
      int step = 1; const wchar_t* label = app_->mode_ == Mode::Uninstall ? Tr(L"Confirm", L"확인") : Tr(L"Language", L"언어");
      if (app_->stage_ == Stage::Removing || app_->stage_ == Stage::Error) { step = 2; label = app_->mode_ == Mode::Uninstall ? Tr(L"Remove", L"제거") : Tr(L"Install", L"설치"); }
      else if (app_->stage_ == Stage::Removed || app_->stage_ == Stage::Opening) { step = 3; label = app_->mode_ == Mode::Uninstall ? Tr(L"Done", L"완료") : Tr(L"Open", L"열기"); }
      else if (app_->mode_ == Mode::Install && app_->stage_ != Stage::Language) { step = 2; label = Tr(L"Install", L"설치"); }
      return g_lang == Lang::Ko ? L"3단계 중 " + std::to_wstring(step) + L"단계: " + label : L"Step " + std::to_wstring(step) + L" of 3: " + label;
    }
    if (id_ == A11yId::Primary) {
      if (app_->stage_ == Stage::Language) return L"English"; if (app_->stage_ == Stage::Welcome) return Tr(L"Install", L"설치");
      if (app_->stage_ == Stage::Confirm) return Tr(L"Uninstall", L"제거"); if (app_->stage_ == Stage::Removed) return Tr(L"Close", L"닫기");
      return Tr(L"Retry", L"다시 시도");
    }
    if (app_->stage_ == Stage::Language) return L"한국어"; if (app_->stage_ == Stage::Welcome) return Tr(L"Back", L"뒤로");
    if (app_->stage_ == Stage::Confirm) return Tr(L"Cancel", L"취소"); return Tr(L"Close", L"닫기");
  }
  std::wstring AutomationId() const {
    static const wchar_t* ids[] = {L"window",L"brand",L"stepper",L"status",L"description",L"progress",L"minimize",L"close",L"primary",L"secondary",L"option"};
    return ids[static_cast<size_t>(id_)];
  }
  RECT RectFor(A11yId id) const {
    if (id == A11yId::Root) { RECT r{}; GetWindowRect(app_->hwnd_, &r); return r; }
    if (id == A11yId::Brand) return app_->rcBrand_; if (id == A11yId::Stepper) return app_->rcStepper_;
    if (id == A11yId::Title) return app_->rcTitle_; if (id == A11yId::Body) return app_->rcBody_; if (id == A11yId::Progress) return app_->rcProgress_;
    if (id == A11yId::Minimize) return app_->rcMin_; if (id == A11yId::Close) return app_->rcClose_; if (id == A11yId::Primary) return app_->rcRetry_;
    return id == A11yId::Secondary ? app_->rcErrClose_ : app_->rcCheck_;
  }
  std::vector<A11yId> Children() const {
    std::vector<A11yId> result{A11yId::Brand,A11yId::Stepper,A11yId::Title,A11yId::Body};
    if (app_->stage_ == Stage::Language) { result.push_back(A11yId::Primary); result.push_back(A11yId::Secondary); }
    else if (app_->stage_ == Stage::Welcome || app_->stage_ == Stage::Confirm) { result.push_back(A11yId::Checkbox); result.push_back(A11yId::Secondary); result.push_back(A11yId::Primary); }
    else if (app_->stage_ == Stage::Error) { result.push_back(A11yId::Secondary); result.push_back(A11yId::Primary); }
    else if (app_->stage_ == Stage::Removed) result.push_back(A11yId::Primary); else result.push_back(A11yId::Progress);
    result.push_back(A11yId::Minimize); result.push_back(A11yId::Close); return result;
  }
  HRESULT New(A11yId id, IRawElementProviderFragment** out) const {
    if (!out) return E_INVALIDARG; *out = new (std::nothrow) A11yProvider(app_, id); return *out ? S_OK : E_OUTOFMEMORY;
  }
  static HRESULT SetString(VARIANT* value, const std::wstring& text) {
    value->vt = VT_BSTR; value->bstrVal = SysAllocStringLen(text.data(), static_cast<UINT>(text.size())); return value->bstrVal || text.empty() ? S_OK : E_OUTOFMEMORY;
  }
  LONG refs_ = 1; SetupApp* app_; A11yId id_;
};

void RaiseStructureChanged(SetupApp* app) {
  if (!app || !app->hwnd_ || !IsWindowVisible(app->hwnd_)) return;
  auto* root = new (std::nothrow) A11yProvider(app, A11yId::Root);
  if (root) { UiaRaiseStructureChangedEvent(root, StructureChangeType_ChildrenInvalidated, nullptr, 0); root->Release(); }

  // Error details are the actionable status. Announce them only after SetStage's synchronous paint,
  // when the worker-written text and the Body provider's Name expose the same current value.
  const A11yId liveId = app->stage_ == Stage::Error ? A11yId::Body : A11yId::Title;
  auto* live = new (std::nothrow) A11yProvider(app, liveId);
  if (!live) return;
  UiaRaiseAutomationEvent(live, UIA_LiveRegionChangedEventId);
  if (app->stage_ == Stage::Error && !app->errorMessage_.empty()) {
    BSTR display = SysAllocString(app->errorMessage_.c_str());
    BSTR activity = SysAllocString(L"redrob-browser-setup-error");
    if (display && activity)
      UiaRaiseNotificationEvent(live, NotificationKind_ActionAborted,
                                NotificationProcessing_ImportantMostRecent, display, activity);
    SysFreeString(activity);
    SysFreeString(display);
  }
  live->Release();
}
void RaiseToggleChanged(SetupApp* app, bool before, bool after) {
  if (!app || before == after || !IsWindowVisible(app->hwnd_)) return;
  auto* option = new (std::nothrow) A11yProvider(app, A11yId::Checkbox); if (!option) return;
  VARIANT oldValue{}, newValue{}; oldValue.vt = newValue.vt = VT_I4; oldValue.lVal = before ? ToggleState_On : ToggleState_Off; newValue.lVal = after ? ToggleState_On : ToggleState_Off;
  UiaRaiseAutomationPropertyChangedEvent(option, UIA_ToggleToggleStatePropertyId, oldValue, newValue); option->Release();
}
void RaiseFocusChanged(SetupApp* app, A11yId id) {
  if (!app || !IsWindowVisible(app->hwnd_)) return; auto* node = new (std::nothrow) A11yProvider(app, id);
  if (node) { UiaRaiseAutomationEvent(node, UIA_AutomationFocusChangedEventId); node->Release(); }
}
void RaiseProgressChanged(SetupApp* app, double before, double after) {
  const int oldPercent = static_cast<int>(before * 100.0), newPercent = static_cast<int>(after * 100.0);
  if (!app || oldPercent == newPercent || !IsWindowVisible(app->hwnd_)) return;
  auto* node = new (std::nothrow) A11yProvider(app, A11yId::Progress); if (!node) return;
  VARIANT oldValue{}, newValue{}; oldValue.vt = newValue.vt = VT_R8; oldValue.dblVal = oldPercent; newValue.dblVal = newPercent;
  UiaRaiseAutomationPropertyChangedEvent(node, UIA_RangeValueValuePropertyId, oldValue, newValue); node->Release();
}

// The language a previous install recorded (en, ko), or nothing.
static std::wstring RecordedLanguage() {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kAppKey, 0, KEY_READ, &key) != ERROR_SUCCESS) return L"";
  wchar_t buf[16] = {};
  DWORD size = sizeof(buf), type = 0;
  std::wstring out;
  if (RegQueryValueExW(key, L"Language", nullptr, &type, reinterpret_cast<BYTE*>(buf), &size) == ERROR_SUCCESS && type == REG_SZ)
    out = buf;
  RegCloseKey(key);
  return out;
}

// The desktop-shortcut choice a previous install recorded: 1, 0, or -1 for none.
static int RecordedDesktopShortcut() {
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kAppKey, 0, KEY_READ, &key) != ERROR_SUCCESS) return -1;
  wchar_t buf[8] = {};
  DWORD size = sizeof(buf), type = 0;
  int out = -1;
  if (RegQueryValueExW(key, L"DesktopShortcutChoice", nullptr, &type, reinterpret_cast<BYTE*>(buf), &size) == ERROR_SUCCESS && type == REG_SZ)
    out = (buf[0] == L'1') ? 1 : 0;
  RegCloseKey(key);
  return out;
}

// The language to preselect: --lang, else the recorded one, else Korean on a Korean Windows, else English.
static Lang DefaultLanguage(const std::wstring& flag) {
  if (lstrcmpiW(flag.c_str(), L"ko") == 0) return Lang::Ko;
  if (lstrcmpiW(flag.c_str(), L"en") == 0) return Lang::En;
  const std::wstring recorded = RecordedLanguage();
  if (lstrcmpiW(recorded.c_str(), L"ko") == 0) return Lang::Ko;
  if (lstrcmpiW(recorded.c_str(), L"en") == 0) return Lang::En;
  return PRIMARYLANGID(GetUserDefaultUILanguage()) == LANG_KOREAN ? Lang::Ko : Lang::En;
}

int SetupApp::Run(HINSTANCE hinst) {
  hinst_ = hinst;
  g_app = this;

  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  (void)hr;

  D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &d2dFactory_);
  DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                      reinterpret_cast<IUnknown**>(&dwFactory_));
  CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER,
                   IID_PPV_ARGS(&wicFactory_));

  WNDCLASSEX wc = {sizeof(wc)};
  wc.style = CS_HREDRAW | CS_VREDRAW;
  wc.lpfnWndProc = &SetupApp::WndProcThunk;
  wc.hInstance = hinst;
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  wc.lpszClassName = L"RedrobBrowserSetupWindow";
  wc.hIcon = LoadIconW(hinst, MAKEINTRESOURCEW(IDI_APPICON));
  wc.hIconSm = wc.hIcon;
  RegisterClassEx(&wc);

  // Center on the primary monitor's work area.
  dpi_ = GetDpiForSystem();
  int w = MulDiv(kBaseW, dpi_, 96);
  int h = MulDiv(kBaseH, dpi_, 96);
  RECT wa{};
  SystemParametersInfo(SPI_GETWORKAREA, 0, &wa, 0);
  int x = wa.left + ((wa.right - wa.left) - w) / 2;
  int y = wa.top + ((wa.bottom - wa.top) - h) / 2;

  // Borderless (WS_POPUP). WS_THICKFRAME is kept out; a DWM shadow is attached
  // separately so a popup still casts one.
  hwnd_ = CreateWindowExW(WS_EX_APPWINDOW, wc.lpszClassName,
                          mode_ == Mode::Uninstall ? Tr(L"Uninstall Redrob Browser", L"Redrob Browser 제거")
                                                   : Tr(L"Redrob Browser Setup", L"Redrob Browser 설치"),
                          WS_POPUP, x, y, w, h, nullptr, nullptr, hinst, this);
  if (!hwnd_) return 2;

  // DWM: a real shadow on a borderless window + rounded corners (Win11).
  MARGINS m = {1, 1, 1, 1};
  DwmExtendFrameIntoClientArea(hwnd_, &m);
  DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  DwmSetWindowAttribute(hwnd_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
  g_dark = SystemPrefersDark();
  ApplyWindowTheme();
  BOOL animate = TRUE;
  if (SystemParametersInfoW(SPI_GETCLIENTAREAANIMATION, 0, &animate, 0)) reducedMotion_ = !animate;

  LayoutText();
#ifdef REDROB_REQUIRE_BUNDLED_FONTS
  if (!bundledFontsReady_) {
    // Production never silently substitutes fonts because that changes Korean shaping and metrics.
    MessageBoxW(hwnd_, Tr(L"Setup could not load its required fonts. Please download the setup again.",
                          L"설치에 필요한 글꼴을 불러오지 못했어요. 설치 파일을 다시 다운로드해 주세요."),
                Tr(L"Redrob Browser Setup", L"Redrob Browser 설치"), MB_OK | MB_ICONERROR);
    DestroyWindow(hwnd_);
    fontColl_.reset(); wicFactory_.reset(); dwFactory_.reset(); d2dFactory_.reset(); CoUninitialize();
    return ERROR_RESOURCE_DATA_NOT_FOUND;
  }
#endif

  startTick_ = GetTickCount64();
  if (mode_ == Mode::Uninstall) {
    SetStage(Stage::Confirm);
  } else if (demoError_) {
    errorMessage_ = ResultSentence(kResultUnpackFailed, false);
    SetStage(Stage::Error);
  } else {
    // Nothing is installed until the person presses Install. The language comes first: every screen
    // after it, and then the browser, follow the choice.
    const int previous = RecordedDesktopShortcut();
    if (previous >= 0) desktopShortcut_ = previous == 1;
    SetStage(Stage::Language);
  }

  ShowWindow(hwnd_, SW_SHOW);
  UpdateWindow(hwnd_);
  // Raise after first paint so provider bounds are ready when a client handles WindowOpened.
  auto* openedProvider = new (std::nothrow) A11yProvider(this, A11yId::Root);
  if (openedProvider) { UiaRaiseAutomationEvent(openedProvider, UIA_Window_WindowOpenedEventId); openedProvider->Release(); }

  MSG msg;
  while (GetMessage(&msg, nullptr, 0, 0) > 0) {
    TranslateMessage(&msg);
    DispatchMessage(&msg);
  }
  if (payloadThread_) {
    WaitForSingleObject(payloadThread_, 5000);
    CloseHandle(payloadThread_);
  }
  // Every COM object goes BEFORE CoUninitialize. Left to the destructor, the WIC factory was released after
  // COM was torn down, and the process died with an access violation on its way out of a successful install.
  DiscardDeviceResources();
  fmtTitle_.reset();
  fmtBody_.reset();
  fmtButton_.reset();
  fmtLabel_.reset();
  fmtStep_.reset();
  fmtBrand_.reset();
  fontColl_.reset();
  wicFactory_.reset();
  dwFactory_.reset();
  d2dFactory_.reset();
  CoUninitialize();
  return (int)msg.wParam;
}

// The DWM frame follows the theme too (immersive dark mode only for the dark theme).
void SetupApp::ApplyWindowTheme() {
  if (!hwnd_) return;
  BOOL dark = g_dark ? TRUE : FALSE;
  DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));
}

void SetupApp::LayoutText() {
  // One private collection keeps deterministic Pretendard and Wanted Sans resources together.
  ComPtr<IDWriteFactory5> f5;
  if (SUCCEEDED(dwFactory_->QueryInterface(__uuidof(IDWriteFactory5), reinterpret_cast<void**>(&f5)))) {
    ComPtr<IDWriteInMemoryFontFileLoader> loader;
    ComPtr<IDWriteFontSetBuilder1> builder;
    if (SUCCEEDED(f5->CreateInMemoryFontFileLoader(&loader)) && SUCCEEDED(f5->RegisterFontFileLoader(loader.p)) &&
        SUCCEEDED(f5->CreateFontSetBuilder(&builder))) {
      int added = 0;
      for (int id : {IDR_FONT_SEMIBOLD, IDR_FONT_REGULAR, IDR_FONT_HANGUL}) {
        HRSRC resource = FindResourceW(hinst_, MAKEINTRESOURCEW(id), RT_RCDATA);
        if (!resource) continue;
        HGLOBAL loaded = LoadResource(hinst_, resource);
        const void* data = loaded ? LockResource(loaded) : nullptr;
        const DWORD size = SizeofResource(hinst_, resource);
        ComPtr<IDWriteFontFile> file;
        if (data && size && SUCCEEDED(loader->CreateInMemoryFontFileReference(f5.p, data, size, nullptr, &file)) &&
            SUCCEEDED(builder->AddFontFile(file.p))) ++added;
      }
      ComPtr<IDWriteFontSet> set;
      ComPtr<IDWriteFontCollection1> collection;
      if (added == 3 && SUCCEEDED(builder->CreateFontSet(&set)) &&
          SUCCEEDED(f5->CreateFontCollectionFromFontSet(set.p, &collection))) {
        fontColl_.p = collection.p;
        collection.p = nullptr;
      }
    }
  }
  if (fontColl_) {
    // Family identity is independent of file order; both Pretendard weights normally share one family.
    for (UINT32 i = 0; i < fontColl_->GetFontFamilyCount(); ++i) {
      ComPtr<IDWriteFontFamily> family; ComPtr<IDWriteLocalizedStrings> names;
      if (FAILED(fontColl_->GetFontFamily(i, &family)) || FAILED(family->GetFamilyNames(&names)) || !names->GetCount()) continue;
      UINT32 index = 0; BOOL found = FALSE;
      if (FAILED(names->FindLocaleName(L"en-us", &index, &found)) || !found) index = 0;
      UINT32 length = 0; if (FAILED(names->GetStringLength(index, &length))) continue;
      std::wstring name(length + 1, L'\0'); if (FAILED(names->GetString(index, &name[0], length + 1))) continue; name.resize(length);
      if (name.find(L"Pretendard") != std::wstring::npos) fontFamily_ = bodyFamily_ = name;
      else if (name.find(L"Wanted") != std::wstring::npos) hangulFamily_ = name;
    }
    bundledFontsReady_ = fontFamily_.find(L"Pretendard") != std::wstring::npos && !hangulFamily_.empty();
    if (!bundledFontsReady_) fontColl_.reset();
  }
  auto make = [&](ComPtr<IDWriteTextFormat>& out, const std::wstring& family, DWRITE_FONT_WEIGHT weight, float size,
                  float lineHeight, DWRITE_TEXT_ALIGNMENT align, DWRITE_PARAGRAPH_ALIGNMENT para) {
    out.reset();
    if (FAILED(dwFactory_->CreateTextFormat(family.c_str(), fontColl_.p, weight, DWRITE_FONT_STYLE_NORMAL,
        DWRITE_FONT_STRETCH_NORMAL, size, L"en-us", &out)) || !out) return;
    out->SetTextAlignment(align); out->SetParagraphAlignment(para); out->SetWordWrapping(DWRITE_WORD_WRAPPING_WRAP);
    if (lineHeight > 0) out->SetLineSpacing(DWRITE_LINE_SPACING_METHOD_UNIFORM, lineHeight, lineHeight * 0.78f);
  };
  const auto leading = DWRITE_TEXT_ALIGNMENT_LEADING, center = DWRITE_TEXT_ALIGNMENT_CENTER;
  // `near` is a <windows.h> macro (minwindef.h), so the paragraph alignments use other names.
  const auto top = DWRITE_PARAGRAPH_ALIGNMENT_NEAR, middle = DWRITE_PARAGRAPH_ALIGNMENT_CENTER;
  make(fmtTitle_, fontFamily_, DWRITE_FONT_WEIGHT_SEMI_BOLD, 21.0f, 28.0f, leading, top);
  make(fmtBody_, bodyFamily_, DWRITE_FONT_WEIGHT_REGULAR, 14.0f, 22.0f, leading, top);
  make(fmtButton_, fontFamily_, DWRITE_FONT_WEIGHT_SEMI_BOLD, 14.0f, 0.0f, center, middle);
  make(fmtLabel_, bodyFamily_, DWRITE_FONT_WEIGHT_REGULAR, 14.0f, 20.0f, leading, middle);
  make(fmtStep_, fontFamily_, DWRITE_FONT_WEIGHT_SEMI_BOLD, 12.0f, 0.0f, leading, middle);
  make(fmtBrand_, fontFamily_, DWRITE_FONT_WEIGHT_SEMI_BOLD, 15.0f, 20.0f, leading, top);
  // Production readiness includes format creation, not merely finding three resource blobs.
  bundledFontsReady_ = bundledFontsReady_ && fmtTitle_ && fmtBody_ && fmtButton_ && fmtLabel_ && fmtStep_ && fmtBrand_;
}

void SetupApp::ApplyHangulFont(IDWriteTextLayout* layout, const std::wstring& text) {
  if (!layout || hangulFamily_.empty()) return;
  auto isHangul = [](wchar_t c) { return (c >= 0x1100 && c <= 0x11FF) || (c >= 0x3130 && c <= 0x318F) || (c >= 0xAC00 && c <= 0xD7A3); };
  for (UINT32 start = 0; start < text.size();) {
    if (!isHangul(text[start])) { ++start; continue; }
    UINT32 end = start + 1; while (end < text.size() && isHangul(text[end])) ++end;
    // Range-level assignment preserves Pretendard for Latin product names embedded in Korean copy.
    layout->SetFontFamilyName(hangulFamily_.c_str(), DWRITE_TEXT_RANGE{start, end - start});
    layout->SetFontWeight(DWRITE_FONT_WEIGHT_REGULAR, DWRITE_TEXT_RANGE{start, end - start});
    start = end;
  }
}

void SetupApp::DrawTextLine(const std::wstring& text, IDWriteTextFormat* format,
                            const D2D1_RECT_F& rect, ID2D1Brush* brush) {
  if (!format || text.empty()) return;
  ComPtr<IDWriteTextLayout> layout;
  if (FAILED(dwFactory_->CreateTextLayout(text.c_str(), static_cast<UINT32>(text.size()), format,
      rect.right - rect.left, rect.bottom - rect.top, &layout))) return;
  ApplyHangulFont(layout.p, text);
  rt_->DrawTextLayout(D2D1::Point2F(rect.left, rect.top), layout.p, brush);
}

LRESULT CALLBACK SetupApp::WndProcThunk(HWND hwnd, UINT msg, WPARAM wp, LPARAM lp) {
  if (msg == WM_NCCREATE) {
    auto* cs = reinterpret_cast<CREATESTRUCT*>(lp);
    SetWindowLongPtr(hwnd, GWLP_USERDATA, (LONG_PTR)cs->lpCreateParams);
  }
  auto* self = reinterpret_cast<SetupApp*>(GetWindowLongPtr(hwnd, GWLP_USERDATA));
  if (self) { self->hwnd_ = hwnd; return self->WndProc(msg, wp, lp); }
  return DefWindowProc(hwnd, msg, wp, lp);
}

LRESULT SetupApp::WndProc(UINT msg, WPARAM wp, LPARAM lp) {
  switch (msg) {
    case WM_PAINT: OnPaint(); return 0;
    case WM_ERASEBKGND: return 1;
    case WM_GETOBJECT:
      if (static_cast<LONG>(lp) == UiaRootObjectId) {
        auto* provider = new (std::nothrow) A11yProvider(this, A11yId::Root);
        if (!provider) return 0;
        const LRESULT result = UiaReturnRawElementProvider(hwnd_, wp, lp, provider);
        provider->Release();
        return result;
      }
      return DefWindowProc(hwnd_, msg, wp, lp);
    case kA11yInvokeMsg: Activate(static_cast<int>(wp)); return 0;
    case kA11yFocusMsg: {
      const int target = static_cast<int>(wp);
      if (!IsFocusable(target)) return 0;  // the provider can become stale while this message is queued
      // Set the virtual target first: a synchronous WM_SETFOCUS then announces the right fragment.
      SetLogicalFocus(target, true);
      SetFocus(hwnd_);
      return 0;
    }
    case WM_SETFOCUS:
      InvalidateRect(hwnd_, nullptr, FALSE);
      RaiseFocusChanged(this, A11yProvider::IdForControl(focus_));
      return 0;
    case WM_KILLFOCUS:
      // Retain logical focus for activation restoration, but painting/properties are gated by real HWND focus.
      InvalidateRect(hwnd_, nullptr, FALSE);
      return 0;

    case WM_TIMER:
      if (wp == kTickTimer) OnTick();
      if (wp == kAnimTimer) {
        if (!AnimStep()) KillTimer(hwnd_, kAnimTimer);
        InvalidateRect(hwnd_, nullptr, FALSE);
      }
      return 0;

    case kStageMsg:
      if (stage_ != Stage::Error) SetStage((Stage)wp);
      return 0;

    case kPayloadMsgDone: {
      payloadDone_ = true;
      payloadExit_ = (DWORD)wp;
      if (payloadExit_ == 0) {
        progressTarget_ = 1.0;
        SetStage(Stage::Opening);
      } else {
        errorMessage_ = ResultSentence(payloadExit_, false);
        SetStage(Stage::Error);
      }
      return 0;
    }

    case kUninstallMsgDone: {
      const DWORD code = (DWORD)wp;
      if (code == 0) {
        progressTarget_ = 1.0;
        progress_ = 1.0;
        SetStage(Stage::Removed);
        if (!demo_) ScheduleSelfCleanup();
      } else {
        errorMessage_ = ResultSentence(code, true);
        SetStage(Stage::Error);
      }
      return 0;
    }

    case WM_GETDPISCALEDSIZE: return TRUE;
    case WM_DPICHANGED: {
      dpi_ = HIWORD(wp);
      RECT* r = reinterpret_cast<RECT*>(lp);
      SetWindowPos(hwnd_, nullptr, r->left, r->top, r->right - r->left, r->bottom - r->top,
                   SWP_NOZORDER | SWP_NOACTIVATE);
      DiscardDeviceResources();
      InvalidateRect(hwnd_, nullptr, FALSE);
      return 0;
    }

    case WM_SIZE: DiscardDeviceResources(); return 0;

    case WM_SETTINGCHANGE:
      // Windows switched between light and dark: follow it.
      if (lp && lstrcmpiW(reinterpret_cast<LPCWSTR>(lp), L"ImmersiveColorSet") == 0) {
        g_dark = SystemPrefersDark();
        ApplyWindowTheme();
        InvalidateRect(hwnd_, nullptr, FALSE);
      }
      return 0;

    case WM_MOUSEMOVE:
      if (!trackingMouse_) {
        TRACKMOUSEEVENT tme = {sizeof(tme), TME_LEAVE, hwnd_, 0};
        trackingMouse_ = TrackMouseEvent(&tme) != FALSE;
      }
      UpdateHover();
      return 0;

    case WM_MOUSELEAVE:
      trackingMouse_ = false;
      if (hover_ != kNone) { hover_ = kNone; StartAnim(); }
      return 0;

    case WM_SETCURSOR:
      if (LOWORD(lp) == HTCLIENT) {
        POINT pt; GetCursorPos(&pt); ScreenToClient(hwnd_, &pt);
        SetCursor(LoadCursor(nullptr, HitTest(pt) != kNone ? IDC_HAND : IDC_ARROW));
        return TRUE;
      }
      return DefWindowProc(hwnd_, msg, wp, lp);

    case WM_LBUTTONDOWN: {
      POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      focusVisible_ = false;  // input modality controls the ring independently of logical focus
      const int hit = HitTest(pt);
      if (hit != kNone) {
        if (IsFocusable(hit)) {
          // Publish the pointer's virtual target before SetFocus can synchronously send WM_SETFOCUS.
          SetLogicalFocus(hit, false);
          SetFocus(hwnd_);
        }
        pressed_ = hit;
        SetCapture(hwnd_);
        StartAnim();
        return 0;
      }
      // Anywhere else on the caption strip or the brand panel drags the window.
      if (pt.y < MulDiv((int)kCaption, dpi_, 96) || pt.x < MulDiv((int)kPanelW, dpi_, 96)) {
        ReleaseCapture();
        SendMessage(hwnd_, WM_NCLBUTTONDOWN, HTCAPTION, 0);
      }
      InvalidateRect(hwnd_, nullptr, FALSE);
      return 0;
    }

    case WM_LBUTTONUP: {
      POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      const int was = pressed_;
      pressed_ = kNone;
      if (GetCapture() == hwnd_) ReleaseCapture();
      StartAnim();
      // The action runs on release over the control it went down on, like a native button.
      if (was != kNone && HitTest(pt) == was) Activate(was);
      return 0;
    }

    case WM_KEYDOWN: {
      if (wp == VK_ESCAPE) { RequestClose(false); return 0; }
      if (wp == VK_TAB) {
        const std::vector<int> order = Focusables();
        if (order.empty()) return 0;
        const bool back = (GetKeyState(VK_SHIFT) & 0x8000) != 0;
        auto at = std::find(order.begin(), order.end(), focus_);
        int i = at == order.end() ? (back ? (int)order.size() - 1 : 0)
                                  : ((int)(at - order.begin()) + (back ? -1 : 1) + (int)order.size()) % (int)order.size();
        SetLogicalFocus(order[i], true);
        return 0;
      }
      // Logical focus drives activation; keyboard modality only decides whether its ring is painted.
      if (focus_ != kNone && (wp == VK_RETURN || wp == VK_SPACE)) {
        const std::vector<int> order = Focusables();
        if (std::find(order.begin(), order.end(), focus_) != order.end()) {
          focusVisible_ = true;
          InvalidateRect(hwnd_, nullptr, FALSE);
          Activate(focus_);
          return 0;
        }
      }
      if (stage_ == Stage::Language) {
        // Left/Right or E/K pick; Enter keeps the preselected language.
        if (wp == VK_LEFT || wp == 'E') { ChooseLanguage(Lang::En); return 0; }
        if (wp == VK_RIGHT || wp == 'K') { ChooseLanguage(Lang::Ko); return 0; }
        if (wp == VK_RETURN) { ChooseLanguage(g_lang); return 0; }
        return 0;
      }
      if (stage_ == Stage::Confirm && wp == VK_SPACE) { Activate(kCheck); return 0; }
      if (stage_ == Stage::Confirm && wp == VK_RETURN) { StartUninstall(); return 0; }
      if (stage_ == Stage::Welcome && wp == VK_SPACE) { Activate(kCheck); return 0; }
      if (stage_ == Stage::Welcome && wp == VK_RETURN) { StartInstall(); return 0; }
      if (stage_ == Stage::Welcome && wp == VK_BACK) { SetStage(Stage::Language); return 0; }
      if (stage_ == Stage::Removed && wp == VK_RETURN) { RequestClose(true); return 0; }
      return 0;
    }

    case WM_SYSKEYDOWN:
      if (wp == VK_F4) { RequestClose(false); return 0; }  // Alt+F4
      return DefWindowProc(hwnd_, msg, wp, lp);

    case WM_CLOSE:
      RequestClose(false);
      return 0;

    case WM_DESTROY: {
      auto* closedProvider = new (std::nothrow) A11yProvider(this, A11yId::Root);
      if (closedProvider) { UiaRaiseAutomationEvent(closedProvider, UIA_Window_WindowClosedEventId); closedProvider->Release(); }
      KillTimer(hwnd_, kTickTimer); DiscardDeviceResources(); PostQuitMessage(0); return 0;
    }
  }
  return DefWindowProc(hwnd_, msg, wp, lp);
}

void SetupApp::RequestClose(bool force) {
  // While installing, Esc / close ask for confirmation first (do not abandon an
  // install silently). In demo and error states, close immediately.
  bool installing = (stage_ == Stage::Installing || stage_ == Stage::Preparing) && !demo_ && !force &&
                    mode_ == Mode::Install;
  // A removal cannot be safely abandoned halfway; closing waits for it to finish.
  if (stage_ == Stage::Removing && !force) return;
  if (installing) {
    int r = MessageBoxW(hwnd_,
        Tr(L"Redrob Browser is still installing. Stop the installation and quit?",
           L"Redrob Browser를 아직 설치하고 있어요. 설치를 중단하고 닫을까요?"),
        Tr(L"Redrob Browser Setup", L"Redrob Browser 설치"), MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2);
    if (r != IDYES) return;
  }
  DestroyWindow(hwnd_);
}

// What a click (on release) or a focused Enter/Space does. The same actions the screens always had.
void SetupApp::Activate(int ctl) {
  if (ctl == kClose) { RequestClose(false); return; }
  if (ctl == kMin) { ShowWindow(hwnd_, SW_MINIMIZE); return; }
  if (stage_ == Stage::Language) {
    // The two buttons ARE the choice: picking one moves on, in that language.
    if (ctl == kRetry) { ChooseLanguage(Lang::En); return; }
    if (ctl == kErrClose) { ChooseLanguage(Lang::Ko); return; }
  }
  if (stage_ == Stage::Confirm) {
    if (ctl == kCheck) {
      const bool before = deleteData_;
      deleteData_ = !deleteData_;
      InvalidateRect(hwnd_, nullptr, FALSE);
      RaiseToggleChanged(this, before, deleteData_);
      return;
    }
    if (ctl == kRetry) { StartUninstall(); return; }       // "Uninstall"
    if (ctl == kErrClose) { RequestClose(true); return; }  // "Cancel"
  }
  if (stage_ == Stage::Welcome) {
    if (ctl == kCheck) {
      const bool before = desktopShortcut_;
      desktopShortcut_ = !desktopShortcut_;
      InvalidateRect(hwnd_, nullptr, FALSE);
      RaiseToggleChanged(this, before, desktopShortcut_);
      return;
    }
    if (ctl == kRetry) { StartInstall(); return; }               // "Install"
    if (ctl == kErrClose) { SetStage(Stage::Language); return; } // "Back"
  }
  if (stage_ == Stage::Removed && ctl == kRetry) { RequestClose(true); return; }  // "Close"
  if (stage_ == Stage::Error && mode_ == Mode::Uninstall && ctl == kRetry) {
    errorMessage_.clear();
    SetStage(Stage::Confirm);  // back to the question, so a retry is still a choice
    return;
  }
  if (stage_ == Stage::Error && ctl == kRetry) { errorMessage_.clear(); StartInstall(); return; }
  if (stage_ == Stage::Error && ctl == kErrClose) { RequestClose(true); return; }
}

// The control under `pt` (device px). Only the controls the current screen drew have a rect.
int SetupApp::HitTest(POINT pt) const {
  if (PtInRect(&rcClose_, pt)) return kClose;
  if (PtInRect(&rcMin_, pt)) return kMin;
  if (PtInRect(&rcRetry_, pt)) return kRetry;
  if (PtInRect(&rcErrClose_, pt)) return kErrClose;
  if (PtInRect(&rcCheck_, pt)) return kCheck;
  return kNone;
}

void SetupApp::UpdateHover() {
  if (!hwnd_) return;
  POINT pt;
  GetCursorPos(&pt);
  ScreenToClient(hwnd_, &pt);
  RECT rc;
  GetClientRect(hwnd_, &rc);
  const int hit = PtInRect(&rc, pt) ? HitTest(pt) : kNone;
  if (hit != hover_) { hover_ = hit; StartAnim(); }
}

// Tab order, left to right as drawn: the checkbox, then the secondary button, then the primary.
std::vector<int> SetupApp::Focusables() const {
  switch (stage_) {
    case Stage::Language: return {kRetry, kErrClose};  // English, 한국어
    case Stage::Welcome: case Stage::Confirm: return {kCheck, kErrClose, kRetry};
    case Stage::Error: return {kErrClose, kRetry};
    case Stage::Removed: return {kRetry};
    default: return {};
  }
}

bool SetupApp::IsFocusable(int ctl) const {
  const std::vector<int> order = Focusables();
  return std::find(order.begin(), order.end(), ctl) != order.end();
}

bool SetupApp::WindowHasKeyboardFocus() const { return hwnd_ && ::GetFocus() == hwnd_; }

void SetupApp::SetLogicalFocus(int ctl, bool showRing) {
  if (ctl != kNone && !IsFocusable(ctl)) return;
  const bool changed = focus_ != ctl;
  focus_ = ctl;
  focusVisible_ = ctl != kNone && showRing;
  if (hwnd_) InvalidateRect(hwnd_, nullptr, FALSE);
  if (changed && WindowHasKeyboardFocus())
    RaiseFocusChanged(this, A11yProvider::IdForControl(focus_));
}

void SetupApp::StartAnim() {
  if (!hwnd_) return;
  if (reducedMotion_) {
    for (int i = 0; i < kCtlCount; ++i) hoverT_[i] = (i == hover_ || i == pressed_) ? 1.0f : 0.0f;
    InvalidateRect(hwnd_, nullptr, FALSE);
    return;
  }
  animLast_ = GetTickCount64();
  SetTimer(hwnd_, kAnimTimer, kTickMs, nullptr);
  InvalidateRect(hwnd_, nullptr, FALSE);
}

bool SetupApp::AnimStep() {
  const ULONGLONG now = GetTickCount64();
  const float step = (float)(now - animLast_) / kHoverMs;
  animLast_ = now;
  bool moving = false;
  for (int i = 0; i < kCtlCount; ++i) {
    const float target = (i == hover_ || i == pressed_) ? 1.0f : 0.0f;
    if (hoverT_[i] < target) hoverT_[i] = std::min(target, hoverT_[i] + step);
    else if (hoverT_[i] > target) hoverT_[i] = std::max(target, hoverT_[i] - step);
    if (hoverT_[i] != target) moving = true;
  }
  return moving || StageFade() < 1.0f;
}

// DS standard easing, cubic-bezier(0.2, 0, 0, 1), solved for x by bisection.
static float StandardEase(float t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  auto bez = [](float a, float b, float u) { return 3 * a * u * (1 - u) * (1 - u) + 3 * b * u * u * (1 - u) + u * u * u; };
  float lo = 0, hi = 1, u = t;
  for (int i = 0; i < 20; ++i) { u = (lo + hi) / 2; if (bez(0.2f, 0.0f, u) < t) lo = u; else hi = u; }
  return bez(0.0f, 1.0f, u);
}

float SetupApp::Eased(int ctl) const { return StandardEase(hoverT_[ctl]); }

// The current screen's content opacity: 0 -> 1 over 220 ms after the screen changes; 1 under reduced motion.
float SetupApp::StageFade() const {
  if (reducedMotion_ || !hwnd_) return 1.0f;
  return StandardEase(std::min(1.0f, (float)(GetTickCount64() - stageTick_) / kStageMs));
}

void SetupApp::SetStage(Stage s) {
  if (s != stage_) stageTick_ = GetTickCount64();
  stage_ = s;
  if (s == Stage::Opening) openedAt_ = GetTickCount64();
  if (s == Stage::Error || s == Stage::Confirm || s == Stage::Removed || s == Stage::Welcome || s == Stage::Language)
    KillTimer(hwnd_, kTickTimer);
  // A new screen starts with no virtual child focused (Enter keeps its primary-action meaning).
  const bool movedFocusToRoot = focus_ != kNone && WindowHasKeyboardFocus();
  focus_ = kNone;
  focusVisible_ = false;
  pressed_ = kNone;
  if (hwnd_) { UpdateHover(); StartAnim(); }
  if (hwnd_) {
    InvalidateRect(hwnd_, nullptr, FALSE);
    // Paint synchronously so a stage-change event never exposes stale fragment bounds.
    UpdateWindow(hwnd_);
  }
  RaiseStructureChanged(this);
  // Structure comes first so clients cannot resolve the old child when focus moves to the fragment root.
  if (movedFocusToRoot) RaiseFocusChanged(this, A11yId::Root);
}

// The language screen's answer: from here on every string, including the window title, is in `l`.
void SetupApp::ChooseLanguage(Lang l) {
  g_lang = l;
  if (hwnd_) SetWindowTextW(hwnd_, mode_ == Mode::Uninstall ? Tr(L"Uninstall Redrob Browser", L"Redrob Browser 제거")
                                                            : Tr(L"Redrob Browser Setup", L"Redrob Browser 설치"));
  SetStage(Stage::Welcome);
}

// The Install button (and Retry).
void SetupApp::StartInstall() {
  progress_ = progressTarget_ = 0.0;
  startTick_ = GetTickCount64();
  payloadDone_ = false;
  SetStage(Stage::Preparing);
  SetTimer(hwnd_, kTickTimer, kTickMs, nullptr);
  if (!demo_) {
    if (payloadThread_) { WaitForSingleObject(payloadThread_, 5000); CloseHandle(payloadThread_); }
    payloadThread_ = CreateThread(nullptr, 0, &SetupApp::PayloadThunk, this, 0, nullptr);
  }
}

static double EaseOut(double t) { return 1 - (1 - t) * (1 - t); }

void SetupApp::OnTick() {
  ULONGLONG elapsed = GetTickCount64() - startTick_;

  if (mode_ == Mode::Uninstall) {
    // Removal reports no progress either: the same eased ramp, over ~12s, capped until it finishes.
    if (stage_ == Stage::Removing) {
      double t = std::min(1.0, (GetTickCount64() - startTick_) / 12000.0);
      progressTarget_ = 0.90 * (1 - (1 - t) * (1 - t));
    }
  } else if (demo_ && stage_ != Stage::Error) {
    // Scripted demo, same shape as a real run: Preparing (0-0.8s) -> Installing (0.8-5s, bar to ~0.9)
    // -> Opening (5-6.5s) -> close.
    if (elapsed < 800) { if (stage_ != Stage::Preparing) SetStage(Stage::Preparing); progressTarget_ = 0.04; }
    else if (elapsed < 5000) { if (stage_ != Stage::Installing) SetStage(Stage::Installing);
      progressTarget_ = 0.90 * EaseOut((elapsed - 800) / 4200.0); }
    else if (elapsed < 6500) { if (stage_ != Stage::Opening) SetStage(Stage::Opening); progressTarget_ = 1.0; }
    else { DestroyWindow(hwnd_); return; }
  } else if (!demo_) {
    // Real run. Preparing turns into Installing after 0.6s; the bar is a time-based eased ramp, capped
    // until the worker finishes.
    if (stage_ == Stage::Preparing && elapsed > 600) SetStage(Stage::Installing);
    const double since = (double)(GetTickCount64() - stageTick_);
    if (stage_ == Stage::Installing && !payloadDone_) {
      progressTarget_ = 0.90 * EaseOut(std::min(1.0, since / 30000.0));  // approach over ~30s
    }
    if (stage_ == Stage::Opening) {
      progressTarget_ = 1.0;
      // Close on a fixed delay after Opening began: the browser has been started (InstallApp), so
      // there is nothing left for this window to do but get out of the way.
      if (GetTickCount64() - openedAt_ > 1400) { DestroyWindow(hwnd_); return; }
    }
  }

  // Ease displayed progress toward the target (motion < 1/3 s per step).
  const double previousProgress = progress_;
  progress_ += (progressTarget_ - progress_) * 0.12;
  if (progress_ > 0.9999) progress_ = 1.0;
  RaiseProgressChanged(this, previousProgress, progress_);
  InvalidateRect(hwnd_, nullptr, FALSE);
}

// ---- rendering -------------------------------------------------------------

void SetupApp::CreateDeviceResources() {
  if (rt_) return;
  RECT rc; GetClientRect(hwnd_, &rc);
  D2D1_SIZE_U size = D2D1::SizeU(rc.right - rc.left, rc.bottom - rc.top);
  D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(
      D2D1_RENDER_TARGET_TYPE_DEFAULT,
      D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED));
  ComPtr<ID2D1HwndRenderTarget> hwndRt;
  HRESULT hr = d2dFactory_->CreateHwndRenderTarget(
      props, D2D1::HwndRenderTargetProperties(hwnd_, size, D2D1_PRESENT_OPTIONS_NONE), &hwndRt);
  (void)hr;
  if (!hwndRt) return;
  rt_.p = hwndRt.p;  // ID2D1HwndRenderTarget is an ID2D1RenderTarget; rt_ takes the reference
  hwndRt.p = nullptr;
  rt_->SetDpi((float)dpi_, (float)dpi_);
  symbolBitmap_ = LoadPngResource(IDR_SYMBOL_PNG, rt_.p);
}

void SetupApp::DiscardDeviceResources() {
  symbolBitmap_.reset();
  rt_.reset();
}

ComPtr<ID2D1Bitmap> SetupApp::LoadPngResource(int resId, ID2D1RenderTarget* rt) {
  ComPtr<ID2D1Bitmap> out;
  HRSRC res = FindResourceW(hinst_, MAKEINTRESOURCEW(resId), RT_RCDATA);
  if (!res) return out;
  HGLOBAL h = LoadResource(hinst_, res);
  void* data = LockResource(h);
  DWORD sz = SizeofResource(hinst_, res);
  if (!data || !sz) return out;

  ComPtr<IWICStream> stream;
  wicFactory_->CreateStream(&stream);
  stream->InitializeFromMemory((BYTE*)data, sz);
  ComPtr<IWICBitmapDecoder> dec;
  if (FAILED(wicFactory_->CreateDecoderFromStream(stream.p, nullptr,
          WICDecodeMetadataCacheOnLoad, &dec))) return out;
  ComPtr<IWICBitmapFrameDecode> frame;
  dec->GetFrame(0, &frame);
  ComPtr<IWICFormatConverter> conv;
  wicFactory_->CreateFormatConverter(&conv);
  conv->Initialize(frame.p, GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone,
                   nullptr, 0.0, WICBitmapPaletteTypeMedianCut);
  rt->CreateBitmapFromWicBitmap(conv.p, nullptr, &out);
  return out;
}

void SetupApp::OnPaint() {
  CreateDeviceResources();
  PAINTSTRUCT ps; BeginPaint(hwnd_, &ps);
  if (!rt_) { EndPaint(hwnd_, &ps); return; }
  if (DrawScene() == D2DERR_RECREATE_TARGET) DiscardDeviceResources();
  EndPaint(hwnd_, &ps);
}

// Where a screen sits among the three steps the stepper shows.
struct StepState { int current; bool allDone; };
static StepState StepOf(Stage s, Mode m) {
  if (m == Mode::Uninstall) {
    switch (s) {
      case Stage::Removing: case Stage::Error: return {1, false};
      case Stage::Removed: return {2, true};
      default: return {0, false};
    }
  }
  switch (s) {
    case Stage::Language: return {0, false};
    case Stage::Opening: return {2, false};
    default: return {1, false};  // Welcome, Preparing, Installing, Error
  }
}

// Korean breaks between words, never inside one (DS 35-korean: keep-all). DirectWrite allows a break
// between any two Hangul syllables, so a word joiner (U+2060, zero width) is put inside each word.
static std::wstring KeepAll(const std::wstring& s) {
  auto hangul = [](wchar_t c) { return (c >= 0xAC00 && c <= 0xD7A3) || (c >= 0x3130 && c <= 0x318F); };
  std::wstring out;
  out.reserve(s.size() * 2);
  for (size_t i = 0; i < s.size(); ++i) {
    out += s[i];
    if (i + 1 < s.size() && (hangul(s[i]) || hangul(s[i + 1])) && !iswspace(s[i]) && !iswspace(s[i + 1]))
      out += L'\u2060';
  }
  return out;
}

float SetupApp::TextWidth(const std::wstring& s, IDWriteTextFormat* f) {
  ComPtr<IDWriteTextLayout> layout;
  if (!f || FAILED(dwFactory_->CreateTextLayout(s.c_str(), (UINT32)s.size(), f, 4096.0f, 64.0f, &layout))) return 0;
  ApplyHangulFont(layout.p, s);
  DWRITE_TEXT_METRICS tm{};
  return SUCCEEDED(layout->GetMetrics(&tm)) ? tm.widthIncludingTrailingWhitespace : 0;
}

// Left-aligned, wrapped text at (x, y), `w` wide. Returns the height it took.
float SetupApp::DrawBlock(const std::wstring& s, IDWriteTextFormat* f, float x, float y, float w, ID2D1Brush* b) {
  if (!f || s.empty()) return 0;
  const std::wstring text = KeepAll(s);
  ComPtr<IDWriteTextLayout> layout;
  if (FAILED(dwFactory_->CreateTextLayout(text.c_str(), (UINT32)text.size(), f, w, 400.0f, &layout))) return 0;
  ApplyHangulFont(layout.p, text);
  layout->SetLocaleName(g_lang == Lang::Ko ? L"ko-kr" : L"en-us", DWRITE_TEXT_RANGE{0, (UINT32)text.size()});
  rt_->DrawTextLayout(D2D1::Point2F(x, y), layout.p, b);
  DWRITE_TEXT_METRICS tm{};
  return SUCCEEDED(layout->GetMetrics(&tm)) ? tm.height : 0;
}

// The brand panel: Redrob Blue radial gradient (#2E7EFF -> #2B52FF -> #2746EE), a soft white glint top-left
// and a violet one bottom-right, the white Redrob symbol near the top and the product name at the foot. The
// symbol is the design system's file, drawn as is: never tinted, shadowed or redrawn.
void SetupApp::DrawBrandPanel(float H) {
  const D2D1_RECT_F r = D2D1::RectF(0, 0, kPanelW, H);
  auto radial = [&](D2D1_POINT_2F c, float rx, float ry, const D2D1_GRADIENT_STOP* stops, UINT n) {
    ComPtr<ID2D1GradientStopCollection> coll;
    if (FAILED(rt_->CreateGradientStopCollection(stops, n, &coll))) return;
    ComPtr<ID2D1RadialGradientBrush> brush;
    if (FAILED(rt_->CreateRadialGradientBrush(
            D2D1::RadialGradientBrushProperties(c, D2D1::Point2F(0, 0), rx, ry), coll.p, &brush))) return;
    rt_->FillRectangle(r, brush.p);
  };
  const D2D1_GRADIENT_STOP bed[] = {{0.0f, kPanelCore}, {0.55f, kPanelMid}, {1.0f, kPanelEdge}};
  radial(D2D1::Point2F(kPanelW * 0.30f, H * 0.34f), kPanelW * 1.25f, H * 0.85f, bed, 3);
  const D2D1_COLOR_F w0 = {1, 1, 1, 0.30f}, w1 = {1, 1, 1, 0.0f};
  const D2D1_GRADIENT_STOP glint[] = {{0.0f, w0}, {1.0f, w1}};
  radial(D2D1::Point2F(kPanelW * 0.06f, H * 0.02f), 150.0f, 150.0f, glint, 2);
  D2D1_COLOR_F v0 = kPanelViolet, v1 = kPanelViolet, v2 = kPanelViolet;
  v0.a = 0.70f; v1.a = 0.22f; v2.a = 0.0f;
  const D2D1_GRADIENT_STOP violet[] = {{0.0f, v0}, {0.5f, v1}, {1.0f, v2}};
  radial(D2D1::Point2F(kPanelW, H), 230.0f, 230.0f, violet, 3);

  if (symbolBitmap_) {
    const float s = 40.0f;  // >= 18 px minimum (10-logo.md); drawn down from the 192 px file
    rt_->DrawBitmap(symbolBitmap_.p, D2D1::RectF(kPad, 44.0f, kPad + s, 44.0f + s), 1.0f,
                    D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
  }
  ComPtr<ID2D1SolidColorBrush> white;
  rt_->CreateSolidColorBrush(kWhite, &white);
  if (white) DrawBlock(L"Redrob Browser", fmtBrand_.p, kPad, H - kPad - 20.0f, kPanelW - 2 * kPad, white.p);
}

// The DS Stepper, small: three round markers (done = blue with a white tick, current = blue ring with a
// halo, next = outline), each with its label, joined by a hairline (blue once passed).
void SetupApp::DrawStepper(float x, float y) {
  const Palette& p = Pal();
  ComPtr<ID2D1SolidColorBrush> ink, secondary, blue, strong, hairline, base, halo, brand, white;
  rt_->CreateSolidColorBrush(p.ink, &ink);
  rt_->CreateSolidColorBrush(p.secondary, &secondary);
  rt_->CreateSolidColorBrush(p.blue, &blue);
  rt_->CreateSolidColorBrush(p.strong, &strong);
  rt_->CreateSolidColorBrush(p.hairline, &hairline);
  rt_->CreateSolidColorBrush(p.base, &base);
  rt_->CreateSolidColorBrush(p.brandSubtle, &halo);
  rt_->CreateSolidColorBrush(p.inkBrand, &brand);
  rt_->CreateSolidColorBrush(kWhite, &white);
  if (!ink || !white) return;
  const StepState st = StepOf(stage_, mode_);
  const wchar_t* labels[3];
  if (mode_ == Mode::Uninstall) {
    labels[0] = Tr(L"Confirm", L"확인"); labels[1] = Tr(L"Remove", L"제거"); labels[2] = Tr(L"Done", L"완료");
  } else {
    labels[0] = Tr(L"Language", L"언어"); labels[1] = Tr(L"Install", L"설치"); labels[2] = Tr(L"Open", L"열기");
  }
  const float d = 20.0f, rr = d / 2;
  float cx = x;
  for (int i = 0; i < 3; ++i) {
    const bool done = i < st.current || st.allDone;
    const bool cur = i == st.current && !st.allDone;
    const D2D1_POINT_2F c = D2D1::Point2F(cx + rr, y + rr);
    if (cur) {
      rt_->FillEllipse(D2D1::Ellipse(c, rr + 3, rr + 3), halo.p);
      rt_->FillEllipse(D2D1::Ellipse(c, rr, rr), base.p);
      rt_->DrawEllipse(D2D1::Ellipse(c, rr - 0.5f, rr - 0.5f), blue.p, 1.0f);
    } else if (done) {
      rt_->FillEllipse(D2D1::Ellipse(c, rr, rr), blue.p);
      rt_->DrawLine(D2D1::Point2F(c.x - 4.0f, c.y + 0.2f), D2D1::Point2F(c.x - 1.2f, c.y + 3.0f), white.p, 1.6f);
      rt_->DrawLine(D2D1::Point2F(c.x - 1.2f, c.y + 3.0f), D2D1::Point2F(c.x + 4.2f, c.y - 3.2f), white.p, 1.6f);
    } else {
      rt_->FillEllipse(D2D1::Ellipse(c, rr, rr), base.p);
      rt_->DrawEllipse(D2D1::Ellipse(c, rr - 0.5f, rr - 0.5f), strong.p, 1.0f);
    }
    if (!done && fmtStep_) {
      const wchar_t num[2] = {(wchar_t)(L'1' + i), 0};
      ComPtr<IDWriteTextLayout> layout;
      if (SUCCEEDED(dwFactory_->CreateTextLayout(num, 1, fmtStep_.p, d, d, &layout))) {
        layout->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
        rt_->DrawTextLayout(D2D1::Point2F(cx, y), layout.p, cur ? brand.p : secondary.p);
      }
    }
    const float lw = TextWidth(labels[i], fmtStep_.p);
    if (fmtStep_) {
      DrawTextLine(labels[i], fmtStep_.p, D2D1::RectF(cx + d + 8, y, cx + d + 8 + lw + 2, y + d),
                   (done || cur) ? ink.p : secondary.p);
    }
    cx += d + 8 + lw;
    if (i < 2) {
      rt_->DrawLine(D2D1::Point2F(cx + 10, y + rr), D2D1::Point2F(cx + 34, y + rr),
                    (i < st.current || st.allDone) ? blue.p : hairline.p, 1.0f);
      cx += 44;
    }
  }
}

HRESULT SetupApp::DrawScene() {
  const Palette& p = Pal();
  rt_->BeginDraw();
  rt_->Clear(p.base);

  const float W = (float)kBaseW, H = (float)kBaseH;
  rcBrand_ = ToDevice(0, 0, kPanelW, H);
  DrawBrandPanel(H);

  ComPtr<ID2D1SolidColorBrush> ink, secondary, blue, sunken, strong, base, white;
  rt_->CreateSolidColorBrush(p.ink, &ink);
  rt_->CreateSolidColorBrush(p.secondary, &secondary);
  rt_->CreateSolidColorBrush(p.blue, &blue);
  rt_->CreateSolidColorBrush(p.sunken, &sunken);
  rt_->CreateSolidColorBrush(p.strong, &strong);
  rt_->CreateSolidColorBrush(p.base, &base);
  rt_->CreateSolidColorBrush(kWhite, &white);
  if (!ink || !white) return rt_->EndDraw();

  // ---- caption buttons (minimise, close), 46 x 40 each, top-right ------------
  rcClose_ = ToDevice(W - kCapBtnW, 0, kCapBtnW, kCaption);
  rcMin_ = ToDevice(W - 2 * kCapBtnW, 0, kCapBtnW, kCaption);
  {
    const float cy = kCaption / 2, g = 5.0f;  // 10 dip glyphs
    const float closeX = W - kCapBtnW / 2, minX = W - kCapBtnW * 1.5f;
    // Hover: 8% ink behind minimise; status-danger behind close, with a white glyph.
    const float hm = Eased(kMin), hc = Eased(kClose);
    if (hm > 0) {
      ComPtr<ID2D1SolidColorBrush> fill;
      D2D1_COLOR_F c = p.ink; c.a = 0.08f * hm;
      rt_->CreateSolidColorBrush(c, &fill);
      if (fill) rt_->FillRectangle(D2D1::RectF(W - 2 * kCapBtnW, 0, W - kCapBtnW, kCaption), fill.p);
    }
    ComPtr<ID2D1SolidColorBrush> closeGlyph;
    rt_->CreateSolidColorBrush(Mix(p.secondary, kWhite, hc), &closeGlyph);
    if (hc > 0) {
      ComPtr<ID2D1SolidColorBrush> fill;
      D2D1_COLOR_F c = p.danger; c.a = hc;
      rt_->CreateSolidColorBrush(c, &fill);
      if (fill) rt_->FillRectangle(D2D1::RectF(W - kCapBtnW, 0, W, kCaption), fill.p);
    }
    rt_->DrawLine(D2D1::Point2F(closeX - g, cy - g), D2D1::Point2F(closeX + g, cy + g), closeGlyph.p, 1.0f);
    rt_->DrawLine(D2D1::Point2F(closeX + g, cy - g), D2D1::Point2F(closeX - g, cy + g), closeGlyph.p, 1.0f);
    rt_->DrawLine(D2D1::Point2F(minX - g, cy), D2D1::Point2F(minX + g, cy), secondary.p, 1.0f);
  }

  // The content column fades in with each new screen (not the progress bar, which carries on).
  const float fade = StageFade();
  ComPtr<ID2D1Layer> layer;
  if (fade < 1.0f && SUCCEEDED(rt_->CreateLayer(&layer)))
    rt_->PushLayer(D2D1::LayerParameters(D2D1::InfiniteRect(), nullptr, D2D1_ANTIALIAS_MODE_PER_PRIMITIVE,
                                         D2D1::IdentityMatrix(), fade), layer.p);

  // ---- content column: stepper, title, body, controls; left aligned -----------
  const float x = kPanelW + kPad, cw = W - x - kPad;
  rcStepper_ = ToDevice(x, 48.0f, cw, 28.0f);
  DrawStepper(x, 52.0f);
  float y = 104.0f;
  const float titleY = y;
  const float titleHeight = DrawBlock(StatusText(stage_), fmtTitle_.p, x, y, cw, ink.p);
  rcTitle_ = ToDevice(x, titleY, cw, titleHeight);
  y += titleHeight + 8.0f;
  const float bodyY = y;
  const float bodyHeight = DrawBlock(BodyText(stage_, deleteData_, errorMessage_), fmtBody_.p, x, y, cw, secondary.p);
  rcBody_ = ToDevice(x, bodyY, cw, bodyHeight);
  y += bodyHeight;

  // DS Button: radius 8, 40 tall, 20 side padding (min 96); primary Redrob Blue with white type, secondary a
  // 1 px border-strong outline on the ground. Laid out from the right edge; returns its left edge.
  const float bh = 40.0f, by = H - kPad - bh;
  // DS focus ring: 2 px focus-ring, 2 px outside the control, following its radius. Keyboard focus only.
  auto focusRing = [&](int ctl, D2D1_RECT_F r, float radius) {
    // Offline stage fixtures have no HWND; interactive rings additionally require real window focus.
    if (!focusVisible_ || (hwnd_ && !WindowHasKeyboardFocus()) || focus_ != ctl) return;
    ComPtr<ID2D1SolidColorBrush> ring;
    rt_->CreateSolidColorBrush(p.focus, &ring);
    if (ring) rt_->DrawRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(r.left - 3, r.top - 3, r.right + 3, r.bottom + 3),
                                                          radius + 3, radius + 3), ring.p, 2.0f);
  };
  // Pressed reads as full hover (DS: action-primary-hover is hover AND pressed).
  auto button = [&](RECT& rc, int ctl, float right, const wchar_t* label, bool primary) -> float {
    const float w = std::max(96.0f, TextWidth(label, fmtButton_.p) + 40.0f);
    const float l = right - w;
    const D2D1_RECT_F br = D2D1::RectF(l, by, right, by + bh);
    const float t = pressed_ == ctl ? 1.0f : Eased(ctl);
    ComPtr<ID2D1SolidColorBrush> fill;
    rt_->CreateSolidColorBrush(primary ? Mix(p.blue, p.blueHover, t) : Mix(p.base, p.sunken, t), &fill);
    if (fill) rt_->FillRoundedRectangle(D2D1::RoundedRect(br, 8, 8), fill.p);
    if (!primary)
      rt_->DrawRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(l + 0.5f, by + 0.5f, right - 0.5f, by + bh - 0.5f), 7.5f, 7.5f),
                                strong.p, 1.0f);
    focusRing(ctl, br, 8.0f);
    DrawTextLine(label, fmtButton_.p, br, primary ? white.p : ink.p);
    rc = ToDevice(l, by, w, bh);
    return l;
  };
  auto twoButtons = [&](const wchar_t* primary, const wchar_t* secondaryLabel) {
    const float l = button(rcRetry_, kRetry, W - kPad, primary, true);
    button(rcErrClose_, kErrClose, l - 8.0f, secondaryLabel, false);
  };
  // DS Checkbox: 18 px box, radius 4, 1 px border-strong; checked = blue with a white tick. The row (box and
  // label) is the hit target; hovering it fills an empty box with sunken, a checked one with the hover blue.
  auto checkRow = [&](float rowY, const std::wstring& label, bool checked) {
    const float box = 18.0f, bx = x, byy = rowY + 1.0f;
    const float t = pressed_ == kCheck ? 1.0f : Eased(kCheck);
    const D2D1_RECT_F boxR = D2D1::RectF(bx, byy, bx + box, byy + box);
    const D2D1_ROUNDED_RECT boxRR = D2D1::RoundedRect(boxR, 4.0f, 4.0f);
    ComPtr<ID2D1SolidColorBrush> fill;
    rt_->CreateSolidColorBrush(checked ? Mix(p.blue, p.blueHover, t) : Mix(p.base, p.sunken, t), &fill);
    if (fill) rt_->FillRoundedRectangle(boxRR, fill.p);
    if (checked) {
      rt_->DrawLine(D2D1::Point2F(bx + 4.5f, byy + 9.5f), D2D1::Point2F(bx + 7.75f, byy + 12.5f), white.p, 1.8f);
      rt_->DrawLine(D2D1::Point2F(bx + 7.75f, byy + 12.5f), D2D1::Point2F(bx + 13.5f, byy + 6.0f), white.p, 1.8f);
    } else {
      rt_->DrawRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(bx + 0.5f, byy + 0.5f, bx + box - 0.5f, byy + box - 0.5f),
                                                  3.5f, 3.5f), strong.p, 1.0f);
    }
    focusRing(kCheck, boxR, 4.0f);
    const float lw = TextWidth(label, fmtLabel_.p);
    DrawTextLine(label, fmtLabel_.p, D2D1::RectF(bx + box + 8, rowY, bx + box + 8 + lw + 2, rowY + 20), ink.p);
    rcCheck_ = ToDevice(bx - 4, rowY - 4, box + 8 + lw + 8, 28);
  };

  rcRetry_ = rcErrClose_ = rcCheck_ = rcProgress_ = RECT{};
  if (stage_ == Stage::Language) {
    // Bilingual by nature: it comes before the choice. The two buttons are the choice; the preselected
    // one (a previous install's answer, or the Windows UI language) is drawn as the primary.
    const float l = button(rcErrClose_, kErrClose, W - kPad, L"한국어", g_lang == Lang::Ko);
    button(rcRetry_, kRetry, l - 8.0f, L"English", g_lang == Lang::En);
  } else if (stage_ == Stage::Welcome) {
    checkRow(y + 20.0f, Tr(L"Create a desktop shortcut", L"바탕 화면에 바로 가기 만들기"), desktopShortcut_);
    twoButtons(Tr(L"Install", L"설치"), Tr(L"Back", L"뒤로"));
  } else if (stage_ == Stage::Confirm) {
    checkRow(y + 20.0f, Tr(L"Also delete bookmarks, history and settings", L"북마크, 방문 기록과 설정도 삭제"), deleteData_);
    twoButtons(Tr(L"Uninstall", L"제거"), Tr(L"Cancel", L"취소"));
  } else if (stage_ == Stage::Removed) {
    button(rcRetry_, kRetry, W - kPad, Tr(L"Close", L"닫기"), true);
  } else if (stage_ == Stage::Error) {
    twoButtons(Tr(L"Retry", L"다시 시도"), Tr(L"Close", L"닫기"));
  } else {
    if (layer) { rt_->PopLayer(); layer.reset(); }
    // ---- DS Progress: 8 px pill track (sunken), blue bar ------------------------
    const float barY = y + 24.0f, barH = 8.0f;
    rcProgress_ = ToDevice(x, barY, cw, barH);
    rt_->FillRoundedRectangle(D2D1::RoundedRect(D2D1::RectF(x, barY, x + cw, barY + barH), 4, 4), sunken.p);
    const float fillW = (float)(cw * progress_);
    if (fillW > 0.5f) {
      rt_->FillRoundedRectangle(
          D2D1::RoundedRect(D2D1::RectF(x, barY, x + std::max(fillW, barH), barY + barH), 4, 4), blue.p);
    }
  }
  if (layer) rt_->PopLayer();

  return rt_->EndDraw();
}

int SetupApp::RenderStages(HINSTANCE hinst, const std::wstring& dir) {
  hinst_ = hinst;
  g_app = this;
  // Render automation accepts a fresh nested destination rather than failing each encoder opaquely.
  const int directoryResult = SHCreateDirectoryExW(nullptr, dir.c_str(), nullptr);
  if (directoryResult != ERROR_SUCCESS && directoryResult != ERROR_ALREADY_EXISTS && directoryResult != ERROR_FILE_EXISTS) return 2;
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  D2D1CreateFactory(D2D1_FACTORY_TYPE_SINGLE_THREADED, &d2dFactory_);
  DWriteCreateFactory(DWRITE_FACTORY_TYPE_SHARED, __uuidof(IDWriteFactory),
                      reinterpret_cast<IUnknown**>(&dwFactory_));
  CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&wicFactory_));
  if (!d2dFactory_ || !dwFactory_ || !wicFactory_) return 2;
  LayoutText();
#ifdef REDROB_REQUIRE_BUNDLED_FONTS
  if (!bundledFontsReady_) {
    // Headless validation reports a font-resource failure distinctly and releases COM in-order.
    fmtTitle_.reset(); fmtBody_.reset(); fmtButton_.reset(); fmtLabel_.reset(); fmtStep_.reset(); fmtBrand_.reset();
    fontColl_.reset(); wicFactory_.reset(); dwFactory_.reset(); d2dFactory_.reset(); CoUninitialize();
    return 3;
  }
#endif
  g_dark = SystemPrefersDark();  // --theme light|dark picks one; otherwise Windows' own
  dpi_ = 192;  // 200%: the sharpest the art is drawn for
  const UINT pw = MulDiv(kBaseW, dpi_, 96), ph = MulDiv(kBaseH, dpi_, 96);
  int failures = 0;
  struct Shot { Stage stage; double progress; const wchar_t* name; Lang lang; bool flag; int states = 0; bool uninstall = false; };
  const Shot shots[] = {
    // states 1: pointer over Back, keyboard focus on Install; 2: pointer over close, focus on the checkbox.
    {Stage::Welcome, 0.0, L"8-states-buttons.png", Lang::En, true, 1},
    {Stage::Welcome, 0.0, L"8-states-checkbox.png", Lang::Ko, false, 2},
    {Stage::Language, 0.0, L"0-language.png", Lang::En, false},
    {Stage::Language, 0.0, L"0-language-ko.png", Lang::Ko, false},
    {Stage::Welcome, 0.0, L"1-welcome.png", Lang::En, true},
    {Stage::Welcome, 0.0, L"1-welcome-ko.png", Lang::Ko, true},
    {Stage::Welcome, 0.0, L"1-welcome-unchecked.png", Lang::En, false},
    {Stage::Preparing, 0.04, L"2-preparing.png", Lang::En, false},
    {Stage::Preparing, 0.04, L"2-preparing-ko.png", Lang::Ko, false},
    {Stage::Installing, 0.55, L"2-installing.png", Lang::En, false},
    {Stage::Installing, 0.55, L"2-installing-ko.png", Lang::Ko, false},
    {Stage::Opening, 1.0, L"3-opening.png", Lang::En, false},
    {Stage::Opening, 1.0, L"3-opening-ko.png", Lang::Ko, false},
    {Stage::Error, 0.0, L"4-error.png", Lang::En, false},
    {Stage::Error, 0.0, L"4-error-ko.png", Lang::Ko, false},
    {Stage::Error, 0.0, L"4-uninstall-error.png", Lang::En, false, 0, true},
    {Stage::Error, 0.0, L"4-uninstall-error-ko.png", Lang::Ko, false, 0, true},
    {Stage::Confirm, 0.0, L"5-uninstall-confirm.png", Lang::En, false},
    {Stage::Confirm, 0.0, L"5-uninstall-confirm-ko.png", Lang::Ko, false},
    {Stage::Removing, 0.4, L"6-removing.png", Lang::En, false},
    {Stage::Removing, 0.4, L"6-removing-ko.png", Lang::Ko, false},
    {Stage::Removed, 1.0, L"7-removed.png", Lang::En, false},
    {Stage::Removed, 1.0, L"7-removed-ko.png", Lang::Ko, false},
    {Stage::Removed, 1.0, L"7-removed-deleted-ko.png", Lang::Ko, true},
  };
  for (const Shot& s : shots) {
    ComPtr<IWICBitmap> bitmap;
    if (FAILED(wicFactory_->CreateBitmap(pw, ph, GUID_WICPixelFormat32bppPBGRA, WICBitmapCacheOnLoad, &bitmap))) {
      ++failures; continue;
    }
    D2D1_RENDER_TARGET_PROPERTIES props = D2D1::RenderTargetProperties(
        D2D1_RENDER_TARGET_TYPE_DEFAULT,
        D2D1::PixelFormat(DXGI_FORMAT_B8G8R8A8_UNORM, D2D1_ALPHA_MODE_PREMULTIPLIED), (float)dpi_, (float)dpi_);
    DiscardDeviceResources();
    if (FAILED(d2dFactory_->CreateWicBitmapRenderTarget(bitmap.p, props, &rt_))) { ++failures; continue; }
    symbolBitmap_ = LoadPngResource(IDR_SYMBOL_PNG, rt_.p);
    mode_ = s.uninstall || s.stage == Stage::Confirm || s.stage == Stage::Removing || s.stage == Stage::Removed
                ? Mode::Uninstall : Mode::Install;
    stage_ = s.stage;
    progress_ = s.progress;
    g_lang = s.lang;
    desktopShortcut_ = s.flag;  // Welcome: the box ticked or not
    deleteData_ = s.flag;       // Removed: settings deleted too, or kept
    for (float& t : hoverT_) t = 0.0f;
    hover_ = focus_ = kNone;
    focusVisible_ = s.states != 0;
    if (s.states == 1) { hover_ = kErrClose; hoverT_[kErrClose] = 1.0f; focus_ = kRetry; }
    if (s.states == 2) { hover_ = kClose; hoverT_[kClose] = 1.0f; focus_ = kCheck; }
    if (s.stage == Stage::Error) errorMessage_ = ResultSentence(kResultAppRunning, mode_ == Mode::Uninstall);
    if (FAILED(DrawScene())) { ++failures; continue; }

    const std::wstring path = dir + L"\\" + s.name;
    ComPtr<IWICStream> stream;
    ComPtr<IWICBitmapEncoder> encoder;
    ComPtr<IWICBitmapFrameEncode> frame;
    bool ok = SUCCEEDED(wicFactory_->CreateStream(&stream)) &&
              SUCCEEDED(stream->InitializeFromFilename(path.c_str(), GENERIC_WRITE)) &&
              SUCCEEDED(wicFactory_->CreateEncoder(GUID_ContainerFormatPng, nullptr, &encoder)) &&
              SUCCEEDED(encoder->Initialize(stream.p, WICBitmapEncoderNoCache)) &&
              SUCCEEDED(encoder->CreateNewFrame(&frame, nullptr)) &&
              SUCCEEDED(frame->Initialize(nullptr)) &&
              SUCCEEDED(frame->WriteSource(bitmap.p, nullptr)) &&
              SUCCEEDED(frame->Commit()) && SUCCEEDED(encoder->Commit());
    if (!ok) ++failures;
  }
  DiscardDeviceResources();
  fmtTitle_.reset();
  fmtBody_.reset();
  fmtButton_.reset();
  fmtLabel_.reset();
  fmtStep_.reset();
  fmtBrand_.reset();
  fontColl_.reset();
  wicFactory_.reset();
  dwFactory_.reset();
  d2dFactory_.reset();
  CoUninitialize();
  return failures;
}

// device-pixel rect from logical (dip) coordinates
RECT SetupApp::ToDevice(float x, float y, float w, float h) {
  float s = dpi_ / 96.0f;
  RECT r;
  r.left = (LONG)(x * s); r.top = (LONG)(y * s);
  r.right = (LONG)((x + w) * s); r.bottom = (LONG)((y + h) * s);
  return r;
}

// ---- payload ---------------------------------------------------------------

DWORD WINAPI SetupApp::PayloadThunk(LPVOID self) {
  return reinterpret_cast<SetupApp*>(self)->RunPayload();
}

// %LOCALAPPDATA%, or empty.
static std::wstring LocalAppData() {
  wchar_t local[MAX_PATH];
  if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) return L"";
  return local;
}

static std::wstring KnownFolder(REFKNOWNFOLDERID id) {
  PWSTR p = nullptr;
  std::wstring out;
  if (SUCCEEDED(SHGetKnownFolderPath(id, 0, nullptr, &p))) out = p;
  CoTaskMemFree(p);
  return out;
}

static std::wstring InstallDir() {
  const std::wstring local = LocalAppData();
  return local.empty() ? L"" : local + kInstallSubdir;
}

static bool Exists(const std::wstring& p) { return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES; }

// Moves every file under `from` into the same place under `to`, replacing what is there. Used when the
// install folder itself cannot be renamed: a process whose working directory is that folder holds the
// folder, not its files.
static DWORD MoveTreeInto(const std::wstring& from, const std::wstring& to) {
  CreateDirectoryW(to.c_str(), nullptr);
  WIN32_FIND_DATAW fd;
  HANDLE find = FindFirstFileW((from + L"\\*").c_str(), &fd);
  if (find == INVALID_HANDLE_VALUE) return GetLastError();
  DWORD result = 0;
  do {
    const std::wstring name = fd.cFileName;
    if (name == L"." || name == L"..") continue;
    const std::wstring src = from + L"\\" + name, dst = to + L"\\" + name;
    if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
      const DWORD r = MoveTreeInto(src, dst);
      if (r && !result) result = r;
      continue;
    }
    if (Exists(dst)) {
      // A file that cannot be replaced in place (still mapped) can still be renamed out of the way.
      const std::wstring old = dst + L".old";
      DeleteFileW(old.c_str());
      if (!MoveFileExW(dst.c_str(), old.c_str(), MOVEFILE_REPLACE_EXISTING)) DeleteFileW(dst.c_str());
      MoveFileExW(old.c_str(), nullptr, MOVEFILE_DELAY_UNTIL_REBOOT);
      DeleteFileW(old.c_str());
    }
    if (!MoveFileExW(src.c_str(), dst.c_str(), MOVEFILE_REPLACE_EXISTING | MOVEFILE_COPY_ALLOWED) && !result)
      result = GetLastError();
  } while (FindNextFileW(find, &fd));
  FindClose(find);
  return result;
}

// The one subfolder of `dir` that holds `rel` (a path starting with a backslash), or empty.
static std::wstring SingleSubfolderWith(const std::wstring& dir, const wchar_t* rel) {
  std::wstring found;
  WIN32_FIND_DATAW fd;
  HANDLE find = FindFirstFileW((dir + L"\\*").c_str(), &fd);
  if (find == INVALID_HANDLE_VALUE) return found;
  do {
    const std::wstring name = fd.cFileName;
    if (name == L"." || name == L".." || !(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) continue;
    const std::wstring sub = dir + L"\\" + name;
    if (Exists(sub + rel)) { found = sub; break; }
  } while (FindNextFileW(find, &fd));
  FindClose(find);
  return found;
}

// Write one RCDATA resource to `path`. False if the resource is missing or the write was short.
static bool WriteResource(HINSTANCE hinst, int id, const std::wstring& path) {
  HRSRC res = FindResourceW(hinst, MAKEINTRESOURCEW(id), RT_RCDATA);
  if (!res) return false;
  HGLOBAL h = LoadResource(hinst, res);
  const void* data = LockResource(h);
  const DWORD sz = SizeofResource(hinst, res);
  if (!data || !sz) return false;
  HANDLE f = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return false;
  DWORD written = 0;
  const BOOL ok = WriteFile(f, data, sz, &written, nullptr);
  CloseHandle(f);
  if (!ok || written != sz) { DeleteFileW(path.c_str()); return false; }
  return true;
}

bool SetupApp::ExtractPayload(std::wstring& outPath) {
  wchar_t tmp[MAX_PATH];
  GetTempPathW(MAX_PATH, tmp);
  wchar_t name[MAX_PATH];
  if (!GetTempFileNameW(tmp, L"rcs", 0, name)) return false;
  const std::wstring zip = std::wstring(name) + L".zip";
  DeleteFileW(name);  // the 0-byte file GetTempFileName created
  if (!WriteResource(hinst_, IDR_PAYLOAD, zip)) return false;
  outPath = zip;
  return true;
}

// Delete a directory tree. Paths are checked by the callers to be inside the install folder or our own
// data folders; this never runs on anything it was not given. `keep` (a full path) is left in place.
static DWORD DeleteTree(const std::wstring& dir, const std::wstring& keep = L"") {
  DWORD firstError = 0;
  WIN32_FIND_DATAW fd;
  HANDLE find = FindFirstFileW((dir + L"\\*").c_str(), &fd);
  if (find != INVALID_HANDLE_VALUE) {
    do {
      const std::wstring name = fd.cFileName;
      if (name == L"." || name == L"..") continue;
      const std::wstring path = dir + L"\\" + name;
      if (!keep.empty() && lstrcmpiW(path.c_str(), keep.c_str()) == 0) continue;
      DWORD err = 0;
      if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
        // A junction is removed as a link; its target is not followed.
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) err = RemoveDirectoryW(path.c_str()) ? 0 : GetLastError();
        else err = DeleteTree(path, keep);
      } else {
        if (fd.dwFileAttributes & FILE_ATTRIBUTE_READONLY)
          SetFileAttributesW(path.c_str(), fd.dwFileAttributes & ~FILE_ATTRIBUTE_READONLY);
        err = DeleteFileW(path.c_str()) ? 0 : GetLastError();
      }
      if (err && !firstError) firstError = err;
    } while (FindNextFileW(find, &fd));
    FindClose(find);
  }
  if (!RemoveDirectoryW(dir.c_str())) {
    const DWORD err = GetLastError();
    // The kept file, or a missing folder, is not a failure.
    if (err != ERROR_FILE_NOT_FOUND && err != ERROR_PATH_NOT_FOUND && err != ERROR_DIR_NOT_EMPTY && !firstError)
      firstError = err;
    if (err == ERROR_DIR_NOT_EMPTY && keep.empty() && !firstError) firstError = err;
  }
  return firstError;
}

// Whether a process is running from inside `dir` (the browser, its engine or its workers).
static bool AnythingRunningFrom(const std::wstring& dir) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return false;
  const std::wstring prefix = dir + L"\\";
  const DWORD self = GetCurrentProcessId();
  bool found = false;
  PROCESSENTRY32W pe = {sizeof(pe)};
  for (BOOL ok = Process32FirstW(snap, &pe); ok && !found; ok = Process32NextW(snap, &pe)) {
    if (pe.th32ProcessID == self) continue;
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pe.th32ProcessID);
    if (!h) continue;
    wchar_t path[MAX_PATH];
    DWORD len = MAX_PATH;
    if (QueryFullProcessImageNameW(h, 0, path, &len) && _wcsnicmp(path, prefix.c_str(), prefix.size()) == 0)
      found = true;
    CloseHandle(h);
  }
  CloseHandle(snap);
  return found;
}

// Ends every process whose image lives under `dir` (the copy being replaced). Silent update only.
static void EndProcessesFrom(const std::wstring& dir) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return;
  const std::wstring prefix = dir + L"\\";
  const DWORD self = GetCurrentProcessId();
  PROCESSENTRY32W pe = {sizeof(pe)};
  for (BOOL ok = Process32FirstW(snap, &pe); ok; ok = Process32NextW(snap, &pe)) {
    if (pe.th32ProcessID == self) continue;
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE, FALSE, pe.th32ProcessID);
    if (!h) continue;
    wchar_t path[MAX_PATH];
    DWORD len = MAX_PATH;
    if (QueryFullProcessImageNameW(h, 0, path, &len) && _wcsnicmp(path, prefix.c_str(), prefix.size()) == 0)
      TerminateProcess(h, 1);
    CloseHandle(h);
  }
  CloseHandle(snap);
}

// Run a command hidden and wait. Returns its exit code, or the CreateProcess error.
static DWORD RunHidden(std::wstring cmd, const wchar_t* cwd = nullptr) {
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  if (!CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, cwd, &si, &pi))
    return GetLastError();
  WaitForSingleObject(pi.hProcess, INFINITE);
  DWORD exitCode = 1;
  GetExitCodeProcess(pi.hProcess, &exitCode);
  CloseHandle(pi.hThread);
  CloseHandle(pi.hProcess);
  return exitCode;
}

// A shortcut to the browser window. It carries the AppUserModelID ai.redrob.browser: Windows uses it to
// group the taskbar button and to show notifications from an unpackaged app (set through IPropertyStore).
static bool MakeShortcut(const std::wstring& lnk, const std::wstring& target, const std::wstring& workDir) {
  ComPtr<IShellLinkW> link;
  if (FAILED(CoCreateInstance(CLSID_ShellLink, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&link)))) return false;
  link->SetPath(target.c_str());
  link->SetWorkingDirectory(workDir.c_str());
  link->SetIconLocation(target.c_str(), 0);
  link->SetDescription(Tr(L"Browse with AI that reads pages, fills in forms and finishes tasks for you",
                          L"페이지를 읽고 양식을 채우고 할 일을 끝내 주는 AI와 함께 웹을 둘러봐요"));
  ComPtr<IPropertyStore> store;
  if (SUCCEEDED(link->QueryInterface(IID_PPV_ARGS(&store)))) {
    PROPVARIANT pv;
    if (SUCCEEDED(InitPropVariantFromString(kAppUserModelId, &pv))) {
      store->SetValue(PKEY_AppUserModel_ID, pv);
      store->Commit();
      PropVariantClear(&pv);
    }
  }
  ComPtr<IPersistFile> file;
  if (FAILED(link->QueryInterface(IID_PPV_ARGS(&file)))) return false;
  return SUCCEEDED(file->Save(lnk.c_str(), TRUE));
}

static bool SetArpString(HKEY key, const wchar_t* name, const std::wstring& value) {
  return RegSetValueExW(key, name, 0, REG_SZ, reinterpret_cast<const BYTE*>(value.c_str()),
                        (DWORD)((value.size() + 1) * sizeof(wchar_t))) == ERROR_SUCCESS;
}

static ULONGLONG TreeSizeBytes(const std::wstring& dir) {
  ULONGLONG total = 0;
  WIN32_FIND_DATAW fd;
  HANDLE find = FindFirstFileW((dir + L"\\*").c_str(), &fd);
  if (find == INVALID_HANDLE_VALUE) return 0;
  do {
    const std::wstring name = fd.cFileName;
    if (name == L"." || name == L"..") continue;
    if (fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) {
      if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) total += TreeSizeBytes(dir + L"\\" + name);
    } else {
      total += ((ULONGLONG)fd.nFileSizeHigh << 32) | fd.nFileSizeLow;
    }
  } while (FindNextFileW(find, &fd));
  FindClose(find);
  return total;
}

// The Settings > Apps entry. Everything Windows shows there: name, version, publisher, icon, size.
static bool WriteArpEntry(const std::wstring& dir) {
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, kArpKey, 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr) != ERROR_SUCCESS)
    return false;
  const std::wstring exe = dir + kAppExeRel;
  const std::wstring uninstaller = dir + kUninstallerName;
  bool ok = SetArpString(key, L"DisplayName", L"Redrob Browser") &&
            SetArpString(key, L"DisplayVersion", REDROB_VER_WSTR) &&
            SetArpString(key, L"Publisher", L"Redrob") &&
            SetArpString(key, L"DisplayIcon", L"\"" + exe + L"\",0") &&
            SetArpString(key, L"InstallLocation", dir) &&
            SetArpString(key, L"URLInfoAbout", L"https://redrob.ai") &&
            SetArpString(key, L"HelpLink", L"https://github.com/redrob-labs/redrob-browser") &&
            SetArpString(key, L"URLUpdateInfo", L"https://github.com/redrob-labs/redrob-browser/releases") &&
            SetArpString(key, L"UninstallString", L"\"" + uninstaller + L"\" --uninstall");
  const DWORD one = 1;
  const DWORD sizeKb = (DWORD)std::min<ULONGLONG>(TreeSizeBytes(dir) / 1024, 0xFFFFFFFFull);
  RegSetValueExW(key, L"NoModify", 0, REG_DWORD, reinterpret_cast<const BYTE*>(&one), sizeof(one));
  RegSetValueExW(key, L"NoRepair", 0, REG_DWORD, reinterpret_cast<const BYTE*>(&one), sizeof(one));
  RegSetValueExW(key, L"EstimatedSize", 0, REG_DWORD, reinterpret_cast<const BYTE*>(&sizeKb), sizeof(sizeKb));
  RegCloseKey(key);
  return ok;
}

// The payload-less build of this app (IDR_UNINSTALLER) goes into the install folder; Settings > Apps runs it.
bool SetupApp::InstallUninstaller(const std::wstring& dir) {
  return WriteResource(hinst_, IDR_UNINSTALLER, dir + kUninstallerName);
}

static std::wstring StartMenuShortcut() {
  const std::wstring programs = KnownFolder(FOLDERID_Programs);
  return programs.empty() ? L"" : programs + kShortcutName;
}

static std::wstring DesktopShortcut() {
  const std::wstring desktop = KnownFolder(FOLDERID_Desktop);
  return desktop.empty() ? L"" : desktop + kShortcutName;
}

// What the browser reads back (the language, i18n.rs) and the next setup preselects: the install folder,
// the language, the desktop-shortcut choice.
void SetupApp::RecordChoices(const std::wstring& dir) {
  HKEY key = nullptr;
  if (RegCreateKeyExW(HKEY_CURRENT_USER, kAppKey, 0, nullptr, 0, KEY_WRITE, nullptr, &key, nullptr) == ERROR_SUCCESS) {
    SetArpString(key, L"InstallDir", dir);
    SetArpString(key, L"Language", g_lang == Lang::Ko ? L"ko" : L"en");
    SetArpString(key, L"DesktopShortcutChoice", desktopShortcut_ ? L"1" : L"0");
    RegCloseKey(key);
  }
}

// Redrob Browser 0.1.0 and 0.1.1 were a per-user MSI into this same folder. Remove that product before the
// new files go in, with Windows Installer itself (per user, so no administrator rights), so Settings > Apps
// lists one Redrob Browser and a later repair or removal of the MSI never touches the new files. Best effort:
// a failure here leaves the old entry in Settings > Apps, and the install goes on.
static void RemoveOldMsi() {
  std::vector<std::wstring> products;
  wchar_t code[39];
  for (DWORD i = 0; MsiEnumRelatedProductsW(kMsiUpgradeCode, 0, i, code) == ERROR_SUCCESS; ++i) products.push_back(code);
  wchar_t sys[MAX_PATH];
  GetSystemDirectoryW(sys, MAX_PATH);
  for (const std::wstring& product : products)
    RunHidden(L"\"" + std::wstring(sys) + L"\\msiexec.exe\" /x " + product + L" /qn /norestart");
}

// The install proper. Unpack beside the old install, then swap, so neither a failed unpack nor a locked
// file leaves a half-updated folder behind.
DWORD SetupApp::InstallApp() {
  const std::wstring dir = InstallDir();
  if (dir.empty()) return ERROR_PATH_NOT_FOUND;
  // --silent is a scripted update (the launcher runs it after asking the browser to quit): a copy that
  // is still shutting down (or hung) would make this refuse. Give it a little longer, then end it: the
  // user already chose to update.
  if (silent_) {
    for (int i = 0; i < 20 && AnythingRunningFrom(dir); ++i) Sleep(500);
    if (AnythingRunningFrom(dir)) {
      EndProcessesFrom(dir);
      for (int i = 0; i < 10 && AnythingRunningFrom(dir); ++i) Sleep(500);
    }
  }
  if (AnythingRunningFrom(dir)) return kResultAppRunning;

  std::wstring zip;
  if (!ExtractPayload(zip)) return ERROR_RESOURCE_DATA_NOT_FOUND;
  RemoveOldMsi();

  const std::wstring parent = LocalAppData() + L"\\Programs";
  CreateDirectoryW(parent.c_str(), nullptr);
  const std::wstring staging = dir + L".new";
  const std::wstring aside = dir + L".old";
  DeleteTree(staging);  // leftovers of an interrupted earlier run
  DeleteTree(aside);
  if (!CreateDirectoryW(staging.c_str(), nullptr)) { DeleteFileW(zip.c_str()); return GetLastError(); }

  // System32's tar is bsdtar, which reads zip. Its full path, so a tar.exe elsewhere on PATH is never used.
  wchar_t sys[MAX_PATH];
  GetSystemDirectoryW(sys, MAX_PATH);
  const DWORD tarExit = RunHidden(L"\"" + std::wstring(sys) + L"\\tar.exe\" -x -f \"" + zip + L"\" -C \"" +
                                  staging + L"\"");
  DeleteFileW(zip.c_str());
  if (tarExit != 0) { DeleteTree(staging); return kResultUnpackFailed; }
  // The release zip holds the files at the top level; one that wraps them in a folder is lifted up so
  // the exe sits in the install folder itself.
  if (!Exists(staging + kAppExeRel)) {
    const std::wstring inner = SingleSubfolderWith(staging, kAppExeRel);
    if (inner.empty()) { DeleteTree(staging); return kResultNoExe; }
    const std::wstring lifted = dir + L".lift";
    DeleteTree(lifted);
    if (!MoveFileExW(inner.c_str(), lifted.c_str(), 0)) { const DWORD err = GetLastError(); DeleteTree(staging); return err; }
    DeleteTree(staging);
    if (!MoveFileExW(lifted.c_str(), staging.c_str(), 0)) { const DWORD err = GetLastError(); DeleteTree(lifted); return err; }
  }

  // Swap. The rename fails, rather than half-copying, if anything still holds a file in the old folder.
  bool inPlace = false;
  if (Exists(dir)) {
    if (!MoveFileExW(dir.c_str(), aside.c_str(), 0)) {
      const DWORD err = GetLastError();
      const bool locked = err == ERROR_ACCESS_DENIED || err == ERROR_SHARING_VIOLATION;
      // Nothing runs from the folder any more (checked above), so what holds it is a working
      // directory -- a process started from it. Replace the files in place.
      if (locked && !AnythingRunningFrom(dir)) {
        const DWORD moved = MoveTreeInto(staging, dir);
        DeleteTree(staging);
        if (moved) return moved;
        inPlace = true;
      } else {
        DeleteTree(staging);
        return locked ? kResultAppRunning : err;
      }
    }
  }
  if (!inPlace) {
    if (!MoveFileExW(staging.c_str(), dir.c_str(), 0)) {
      const DWORD err = GetLastError();
      if (Exists(aside)) MoveFileExW(aside.c_str(), dir.c_str(), 0);  // put the old install back
      DeleteTree(staging);
      return err;
    }
    DeleteTree(aside);
  }

  // The rest is best effort: the browser is installed and runs without any of it.
  InstallUninstaller(dir);
  const std::wstring exe = dir + kAppExeRel;
  const std::wstring start = StartMenuShortcut();
  if (!start.empty()) MakeShortcut(start, exe, dir);
  const std::wstring desktop = DesktopShortcut();
  if (!desktop.empty()) {
    if (desktopShortcut_) MakeShortcut(desktop, exe, dir);
    else DeleteFileW(desktop.c_str());  // an update where the box was unticked removes the old one
  }
  RecordChoices(dir);
  WriteArpEntry(dir);
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);  // refresh shortcut icons

  if (!silent_) ShellExecuteW(nullptr, L"open", exe.c_str(), nullptr, dir.c_str(), SW_SHOWNORMAL);
  return 0;
}

DWORD WINAPI SetupApp::UninstallThunk(LPVOID self) {
  return reinterpret_cast<SetupApp*>(self)->RunUninstall();
}

void SetupApp::StartUninstall() {
  progress_ = progressTarget_ = 0.0;
  startTick_ = GetTickCount64();
  SetStage(Stage::Removing);
  SetTimer(hwnd_, kTickTimer, kTickMs, nullptr);
  if (payloadThread_) { WaitForSingleObject(payloadThread_, 5000); CloseHandle(payloadThread_); }
  payloadThread_ = CreateThread(nullptr, 0, &SetupApp::UninstallThunk, this, 0, nullptr);
}

// Remove what InstallApp made. The uninstaller itself is still running from the install folder, so it
// is kept here and removed by ScheduleSelfCleanup once this window closes.
DWORD SetupApp::RunUninstall() {
  if (demo_) {
    Sleep(3000);
    PostMessage(hwnd_, kUninstallMsgDone, 0, 0);
    return 0;
  }
  const std::wstring dir = InstallDir();
  if (dir.empty()) { PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)ERROR_PATH_NOT_FOUND, 0); return 1; }
  if (AnythingRunningFrom(dir)) { PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)kResultAppRunning, 0); return 1; }

  const std::wstring start = StartMenuShortcut();
  if (!start.empty()) DeleteFileW(start.c_str());
  const std::wstring desktop = DesktopShortcut();
  if (!desktop.empty()) DeleteFileW(desktop.c_str());
  RegDeleteTreeW(HKEY_CURRENT_USER, kArpKey);
  // The folder is gone, so the record of it goes too; the language and the shortcut choice stay so the
  // next install preselects them.
  HKEY key = nullptr;
  if (RegOpenKeyExW(HKEY_CURRENT_USER, kAppKey, 0, KEY_WRITE, &key) == ERROR_SUCCESS) {
    RegDeleteValueW(key, L"InstallDir");
    RegCloseKey(key);
  }

  wchar_t self[MAX_PATH];
  GetModuleFileNameW(nullptr, self, MAX_PATH);
  DWORD err = Exists(dir) ? DeleteTree(dir, self) : 0;

  if (deleteData_) {
    // Where the browser keeps its state on Windows: %LOCALAPPDATA%\redrob-browser (the profile:
    // bookmarks, history, settings, cookies, and the logs; crates/redrob-shell/src/profile.rs). Its
    // registry key goes too. Downloads are in the person's Downloads folder and stay.
    const std::wstring local = LocalAppData();
    if (!local.empty()) DeleteTree(local + L"\\redrob-browser");
    RegDeleteTreeW(HKEY_CURRENT_USER, kAppKey);
  }
  SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, nullptr, nullptr);
  PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)err, 0);
  return err;
}

// Once removed, this exe is the last thing left. A running exe cannot delete itself, so a hidden
// PowerShell waits for this process to exit, then removes it and the install folder. Only when this copy
// runs from the install folder: a copy started anywhere else is never deleted.
void SetupApp::ScheduleSelfCleanup() {
  wchar_t self[MAX_PATH];
  if (!GetModuleFileNameW(nullptr, self, MAX_PATH)) return;
  const std::wstring dir = InstallDir();
  const std::wstring me = self;
  if (dir.size() < 4 || _wcsnicmp(me.c_str(), (dir + L"\\").c_str(), dir.size() + 1) != 0) return;
  std::wstring cmd = L"powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \"Wait-Process -Id " +
                     std::to_wstring(GetCurrentProcessId()) +
                     L" -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '" + me +
                     L"' -Force -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '" + dir +
                     L"' -Recurse -Force -ErrorAction SilentlyContinue\"";
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  // From the parent folder: a process whose working directory is the install folder would hold it open.
  const std::wstring parent = LocalAppData() + L"\\Programs";
  if (CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, parent.c_str(), &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
}

int SetupApp::RunSilent(HINSTANCE hinst, bool deleteData) {
  hinst_ = hinst;
  silent_ = true;
  // A caller may start us with the install folder as the working directory; leave it so we do not hold
  // the folder we are about to replace.
  SetCurrentDirectoryW(LocalAppData().c_str());
  deleteData_ = deleteData;
  CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);  // the shortcut writer is COM
  DWORD result;
  if (mode_ == Mode::Uninstall) {
    result = RunUninstall();  // hwnd_ is null: its PostMessage lands on this thread's queue, unread
    if (result == 0) ScheduleSelfCleanup();
  } else {
    // Silent updates preserve the interactive choice instead of recreating a declined desktop shortcut.
    const int previous = RecordedDesktopShortcut();
    if (previous >= 0) desktopShortcut_ = previous == 1;
    result = InstallApp();
  }
  CoUninitialize();
  return (int)result;
}

DWORD SetupApp::RunPayload() {
  // This is a worker thread: COM is per thread, and without it the shortcut writer's CoCreateInstance
  // fails, so the install would finish with no Start menu entry.
  const HRESULT com = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
  PostMessage(hwnd_, kStageMsg, (WPARAM)Stage::Installing, 0);
  const DWORD result = InstallApp();
  if (SUCCEEDED(com)) CoUninitialize();
  PostMessage(hwnd_, kPayloadMsgDone, (WPARAM)result, 0);
  return result;
}

}  // namespace

// ---- entry point -----------------------------------------------------------

int WINAPI wWinMain(HINSTANCE hinst, HINSTANCE, PWSTR, int) {
  bool demo = false, demoError = false;
  bool silent = false, deleteData = false, explicitInstall = false;
  std::wstring renderDir, lang;
  Mode mode = Mode::Install;
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  for (int i = 1; i < argc; ++i) {
    if (lstrcmpiW(argv[i], L"--demo") == 0) { demo = true; explicitInstall = true; }
    else if (lstrcmpiW(argv[i], L"--demo-error") == 0) { demo = true; demoError = true; explicitInstall = true; }
    else if (lstrcmpiW(argv[i], L"--uninstall") == 0) mode = Mode::Uninstall;
    else if (lstrcmpiW(argv[i], L"--demo-uninstall") == 0) { demo = true; mode = Mode::Uninstall; }
    else if (lstrcmpiW(argv[i], L"--silent") == 0) silent = true;
    else if (lstrcmpiW(argv[i], L"--delete-data") == 0) deleteData = true;
    else if (lstrcmpiW(argv[i], L"--lang") == 0 && i + 1 < argc) lang = argv[++i];
    else if (lstrcmpiW(argv[i], L"--render-stages") == 0 && i + 1 < argc) renderDir = argv[++i];
    else if (lstrcmpiW(argv[i], L"--theme") == 0 && i + 1 < argc) {
      ++i;
      g_themeFlag = lstrcmpiW(argv[i], L"light") == 0 ? 1 : lstrcmpiW(argv[i], L"dark") == 0 ? 2 : 0;
    }
  }
  if (argv) LocalFree(argv);
  g_lang = DefaultLanguage(lang);

#ifdef REDROB_NO_PAYLOAD
  // The uninstaller carries nothing to install, so opened by a double-click it offers removal, not an
  // Install button that could only fail.
  if (!explicitInstall) mode = Mode::Uninstall;
#endif

  SetupApp app(demo, demoError, mode);
  if (!renderDir.empty()) return app.RenderStages(hinst, renderDir);
  if (silent && !demo) return app.RunSilent(hinst, deleteData);
  return app.Run(hinst);
}
