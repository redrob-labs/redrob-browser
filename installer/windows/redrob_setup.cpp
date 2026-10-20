// redrob_setup -- a branded Windows setup window for Redrob Browser.
//
// What it is: a native Win32 app, no dependencies beyond the Windows SDK. It
// renders a small borderless, rounded, DWM-shadowed window with the Redrob
// Browser product lockup, a status line and a progress bar, then extracts and
// runs the embedded Chromium mini_installer.exe payload (RCDATA) and reports
// progress while it works.
//
// Design system (redrob-design-system), binding over the layout reference:
//   * Ground "deep" (20-color.md): field is Redrob Black #0A0B0C. type is gray-1
//     / gray-5; the call to action is a white pill with black type.
//   * "Blue acts" (20-color.md): the progress fill is action-primary, Redrob
//     Blue #2B52FF.
//   * Product color is "where you are, never what you read" (20-color.md): the
//     Browser mark #F14AA8 appears only in the lockup artwork, never as text.
//   * Foot light is `wash-edge` from the brand gradient (blue-6 -> accent-teal-3),
//     pre-rendered into the background PNG. NOT the reference's forbidden
//     multi-color-into-black glow.
//   * Type is the design-system system face, Pretendard (30-typography.md),
//     embedded in-memory (OFL, fonts/). Falls back to Segoe UI Variable.
//   * Motion: every transition under a third of a second (40-surfaces-and-motion.md).
//
// The payload reports no progress of its own, so the bar is a time-based eased
// ramp capped at ~90% until mini_installer.exe exits; exit 0 == success.
// mini_installer launches the browser only on a FIRST per-user install
// (chrome/installer/setup/setup_main.cc: FIRST_INSTALL_SUCCESS). A repair or an
// update exits 0 and launches nothing, so after a success this app waits briefly
// for the installer's own launch and starts the browser only if none appeared.
//
// Uninstall: the same binary, built without a payload, is the product's uninstaller. A successful install
// writes it to %LOCALAPPDATA%\Redrob\Uninstall and points the Settings > Apps "Uninstall" entry at it, so
// removal gets the same window: confirm (with "also delete browsing data"), progress, done. The removal
// itself is still Chromium's: setup.exe --uninstall --force-uninstall [--delete-profile].
//
// Redrob Code (opt-in): the first screen asks before anything is installed, with "Also install Redrob Code"
// OFF by default. When chosen, Redrob Code goes in FIRST, so the browser opens already able to find it:
// the latest release's redrob-code-x64-setup.exe is downloaded from GitHub, checked against that release's
// SHA256SUMS, and run silently per-user (Inno Setup: /VERYSILENT /CURRENTUSER /TASKS=addtopath). It lands
// in %LOCALAPPDATA%\Redrob\bin, the folder the browser's engine lookup reads directly. A Redrob Code
// failure never fails the browser install: the browser still installs, and the last screen says why Redrob
// Code did not. When Redrob Code is already installed the first screen says so instead of offering it.
//
// Flags:
//   --with-redrob-code   start with "Also install Redrob Code" ticked (still shown, still a choice).
//   --demo               run the whole install sequence on a timer with NO payload (and no download).
//   --demo-error         show the error state immediately.
//   --demo-code-error    --demo, ending on the "Redrob Code was not installed" screen.
//   --uninstall          remove Redrob Browser (what Settings > Apps runs).
//   --demo-uninstall     the uninstall sequence on a timer, removing nothing.
//   (no flag)            extract and run the embedded payload for real.

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
#include <wincodec.h>
#include <shellapi.h>
#include <shlobj.h>
#include <tlhelp32.h>
#include <wininet.h>
#include <urlmon.h>
#include <bcrypt.h>
#include <string>
#include <algorithm>
#include <cctype>
#include <memory>
#include <vector>

#include "resource.h"

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
#pragma comment(lib, "urlmon.lib")
#pragma comment(lib, "wininet.lib")
#pragma comment(lib, "bcrypt.lib")

namespace {

// ---- design-system colors (deep ground) -----------------------------------
constexpr D2D1_COLOR_F kRedrobBlack = {0x0A / 255.0f, 0x0B / 255.0f, 0x0C / 255.0f, 1.0f};
constexpr D2D1_COLOR_F kInkPrimary  = {0xF8 / 255.0f, 0xF9 / 255.0f, 0xFB / 255.0f, 1.0f}; // gray-1
constexpr D2D1_COLOR_F kInkMuted    = {0x83 / 255.0f, 0x8A / 255.0f, 0x97 / 255.0f, 1.0f}; // ink-muted dark
constexpr D2D1_COLOR_F kActionBlue  = {0x2B / 255.0f, 0x52 / 255.0f, 0xFF / 255.0f, 1.0f}; // action-primary
constexpr D2D1_COLOR_F kTrack       = {0xFF / 255.0f, 0xFF / 255.0f, 0xFF / 255.0f, 0.14f}; // border-subtle on dark
constexpr D2D1_COLOR_F kDanger      = {0xFF / 255.0f, 0x4B / 255.0f, 0x4B / 255.0f, 1.0f}; // accent-red-3 / status-danger
constexpr D2D1_COLOR_F kWhite       = {1.0f, 1.0f, 1.0f, 1.0f};

// ---- geometry (logical px at 96 DPI) ---------------------------------------
constexpr int   kBaseW   = 660;
constexpr int   kBaseH   = 400;
constexpr float kRadius  = 14.0f;   // rounded corners
constexpr float kCaption = 44.0f;   // top drag strip height

// window messages / timers
constexpr UINT_PTR kTickTimer = 1;
constexpr UINT     kTickMs     = 16;   // ~60fps for the eased bar / fades
constexpr UINT_PTR kPayloadMsgDone = (WM_APP + 1);
constexpr UINT_PTR kUninstallMsgDone = (WM_APP + 2);
constexpr UINT_PTR kStageMsg = (WM_APP + 3);  // the worker moved on: wParam is the Stage

// Redrob Code's release (public repo). `latest/download/<asset>` redirects to the newest release's asset.
constexpr wchar_t kCodeSetupUrl[] =
    L"https://github.com/redrob-labs/redrob-code/releases/latest/download/redrob-code-x64-setup.exe";
constexpr wchar_t kCodeSumsUrl[] =
    L"https://github.com/redrob-labs/redrob-code/releases/latest/download/SHA256SUMS";
constexpr char kCodeSetupAsset[] = "redrob-code-x64-setup.exe";
// Share of the bar the Redrob Code step owns when chosen; the browser fills the rest.
constexpr double kCodeShare = 0.35;

// Chromium setup.exe's uninstall results (chrome/installer/util/util_constants.h).
constexpr DWORD kChromeNotInstalled = 15;
constexpr DWORD kUninstallSuccessful = 19;
constexpr DWORD kUninstallRequiresReboot = 29;

enum class Stage { Preparing, Installing, Opening, Error, Confirm, Removing, Removed,
                   Welcome, InstallingCode, CodeFailed };
enum class Mode { Install, Uninstall };

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

std::wstring g_statusOverride;

// ---------------------------------------------------------------------------
// The app object. One window, Direct2D render target, DirectWrite text, WIC for
// the PNG resources, and a worker thread that runs the payload.
// ---------------------------------------------------------------------------
class SetupApp {
 public:
  SetupApp(bool demo, bool demoError, Mode mode, bool withCode, bool demoCodeError)
      : demo_(demo), demoError_(demoError), mode_(mode), installCode_(withCode), demoCodeError_(demoCodeError) {}

  int Run(HINSTANCE hinst);

 private:
  static LRESULT CALLBACK WndProcThunk(HWND, UINT, WPARAM, LPARAM);
  LRESULT WndProc(UINT, WPARAM, LPARAM);

  void CreateDeviceResources();
  void DiscardDeviceResources();
  void OnPaint();
  void OnTick();
  void LayoutText();
  RECT ToDevice(float x, float y, float w, float h);
  void computeButtonRects(float minX, float closeX, float cy);

  ComPtr<ID2D1Bitmap> LoadPngResource(int resId, ComPtr<ID2D1HwndRenderTarget>& rt);

  // payload
  static DWORD WINAPI PayloadThunk(LPVOID self);
  DWORD RunPayload();
  void EnsureBrowserLaunched();
  bool ExtractPayload(std::wstring& outPath);
  void InstallUninstaller();

  // install (Redrob Code, opt-in)
  void StartInstall();
  std::wstring InstallRedrobCode();  // empty on success, else why not (shown to the user)

  // uninstall
  static DWORD WINAPI UninstallThunk(LPVOID self);
  DWORD RunUninstall();
  void StartUninstall();
  void ScheduleSelfCleanup();

  void SetStage(Stage s);
  void RequestClose(bool force);

  HINSTANCE hinst_ = nullptr;
  HWND hwnd_ = nullptr;
  UINT dpi_ = 96;
  bool demo_ = false;
  bool demoError_ = false;
  Mode mode_ = Mode::Install;
  bool deleteData_ = false;   // the confirm screen's "also delete browsing data"
  bool installCode_ = false;  // the welcome screen's "also install Redrob Code" -- opt-in, off by default
  bool demoCodeError_ = false;
  bool codePresent_ = false;  // Redrob Code is already installed: the welcome screen says so, offers nothing
  bool codeDone_ = false;     // installed by this run; a Retry does not install it twice
  std::wstring codeError_;    // set by the worker before it posts kPayloadMsgDone

  // Direct2D / DirectWrite / WIC
  ComPtr<ID2D1Factory>        d2dFactory_;
  ComPtr<IDWriteFactory>      dwFactory_;
  ComPtr<IWICImagingFactory>  wicFactory_;
  ComPtr<ID2D1HwndRenderTarget> rt_;
  ComPtr<ID2D1Bitmap>         bgBitmap_;
  ComPtr<ID2D1Bitmap>         lockupBitmap_;
  ComPtr<IDWriteTextFormat>   fmtStatus_;
  ComPtr<IDWriteTextFormat>   fmtButton_;
  ComPtr<IDWriteFontCollection> fontColl_;
  std::wstring                fontFamily_ = L"Segoe UI Variable Display";

  // state
  Stage  stage_ = Stage::Preparing;
  double progress_ = 0.0;      // 0..1 displayed
  double progressTarget_ = 0.0;
  ULONGLONG startTick_ = 0;
  ULONGLONG openedAt_ = 0;
  ULONGLONG stageTick_ = 0;    // when the current stage began; each install step ramps from here
  bool payloadDone_ = false;
  DWORD payloadExit_ = 0;
  HANDLE payloadThread_ = nullptr;
  std::wstring errorMessage_;
  std::wstring extractedPayload_;
  bool closing_ = false;

  // hit-tested button rects (device px), recomputed each paint
  RECT rcMin_{}, rcClose_{}, rcRetry_{}, rcErrClose_{}, rcCheck_{};
  bool confirmingQuit_ = false;
};

SetupApp* g_app = nullptr;

std::wstring StatusText(Stage s) {
  if (!g_statusOverride.empty()) return g_statusOverride;
  switch (s) {
    case Stage::Preparing:  return L"Preparing\u2026";
    case Stage::Installing: return L"Installing\u2026";
    case Stage::Opening:    return L"Opening Redrob Browser\u2026";
    case Stage::Error:      return L"Something went wrong";
    case Stage::Confirm:    return L"Uninstall Redrob Browser?";
    case Stage::Removing:   return L"Removing Redrob Browser\u2026";
    case Stage::Removed:    return L"Redrob Browser has been removed";
    case Stage::Welcome:    return L"Install Redrob Browser";
    case Stage::InstallingCode: return L"Installing Redrob Code\u2026";
    case Stage::CodeFailed: return L"Redrob Browser is installed";
  }
  return L"";
}

// ---------------------------------------------------------------------------

// Whether Redrob Code is already on this PC: its installer's folder (%LOCALAPPDATA%\Redrob\bin), the
// install.sh location (%USERPROFILE%\.redrob\bin), or anywhere on PATH. The same places the browser's
// engine lookup tries, so "already installed" here means the browser will find it.
static bool RedrobCodePresent() {
  auto exists = [](const std::wstring& p) { return GetFileAttributesW(p.c_str()) != INVALID_FILE_ATTRIBUTES; };
  wchar_t dir[MAX_PATH];
  if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, dir)) &&
      exists(std::wstring(dir) + L"\\Redrob\\bin\\redrob.exe"))
    return true;
  if (SUCCEEDED(SHGetFolderPathW(nullptr, CSIDL_PROFILE, nullptr, 0, dir)) &&
      exists(std::wstring(dir) + L"\\.redrob\\bin\\redrob.exe"))
    return true;
  wchar_t found[MAX_PATH];
  return SearchPathW(nullptr, L"redrob.exe", nullptr, MAX_PATH, found, nullptr) > 0;
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
  wc.lpszClassName = L"RedrobSetupWindow";
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
                          mode_ == Mode::Uninstall ? L"Uninstall Redrob Browser" : L"Redrob Browser Setup",
                          WS_POPUP, x, y, w, h, nullptr, nullptr, hinst, this);
  if (!hwnd_) return 2;

  // DWM: a real shadow on a borderless window + rounded corners (Win11).
  MARGINS m = {1, 1, 1, 1};
  DwmExtendFrameIntoClientArea(hwnd_, &m);
  DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  DwmSetWindowAttribute(hwnd_, DWMWA_WINDOW_CORNER_PREFERENCE, &corner, sizeof(corner));
  BOOL dark = TRUE;
  DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &dark, sizeof(dark));

  LayoutText();

  startTick_ = GetTickCount64();
  if (mode_ == Mode::Uninstall) {
    SetStage(Stage::Confirm);
  } else if (demoError_) {
    errorMessage_ = L"The installer could not be started. Please try again.";
    SetStage(Stage::Error);
  } else {
    // Nothing is installed until the person presses Install: the welcome screen is where Redrob Code is
    // offered, and an opt-in that has already started is not an opt-in.
    if (!demo_) codePresent_ = RedrobCodePresent();
    if (codePresent_) installCode_ = false;
    SetStage(Stage::Welcome);
  }

  ShowWindow(hwnd_, SW_SHOW);
  UpdateWindow(hwnd_);

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
  fmtStatus_.reset();
  fmtButton_.reset();
  fontColl_.reset();
  wicFactory_.reset();
  dwFactory_.reset();
  d2dFactory_.reset();
  CoUninitialize();
  return (int)msg.wParam;
}

void SetupApp::LayoutText() {
  // Load Pretendard SemiBold from the embedded TTF into a private font
  // collection; fall back to Segoe UI Variable if the resource is absent.
  HRSRC res = FindResourceW(hinst_, MAKEINTRESOURCEW(IDR_FONT_SANS), RT_RCDATA);
  if (res) {
    HGLOBAL h = LoadResource(hinst_, res);
    void* data = LockResource(h);
    DWORD sz = SizeofResource(hinst_, res);
    if (data && sz) {
      DWORD nFonts = 0;
      HANDLE added = AddFontMemResourceEx(data, sz, nullptr, &nFonts);
      if (added) fontFamily_ = L"Pretendard SemiBold";
    }
  }
  dwFactory_->CreateTextFormat(fontFamily_.c_str(), nullptr, DWRITE_FONT_WEIGHT_SEMI_BOLD,
                               DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL,
                               17.0f, L"en-us", &fmtStatus_);
  if (fmtStatus_) {
    fmtStatus_->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    fmtStatus_->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
  }
  dwFactory_->CreateTextFormat(fontFamily_.c_str(), nullptr, DWRITE_FONT_WEIGHT_SEMI_BOLD,
                               DWRITE_FONT_STYLE_NORMAL, DWRITE_FONT_STRETCH_NORMAL,
                               13.0f, L"en-us", &fmtButton_);
  if (fmtButton_) {
    fmtButton_->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_CENTER);
    fmtButton_->SetParagraphAlignment(DWRITE_PARAGRAPH_ALIGNMENT_CENTER);
  }
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

    case WM_TIMER:
      if (wp == kTickTimer) OnTick();
      return 0;

    case kStageMsg:
      if (stage_ != Stage::Error) SetStage((Stage)wp);
      return 0;

    case kPayloadMsgDone: {
      payloadDone_ = true;
      payloadExit_ = (DWORD)wp;
      if (payloadExit_ == 0 && !codeError_.empty()) {
        // The browser is installed and open; only Redrob Code is missing. Say so and wait for Close,
        // rather than closing on a timer over a message the person has to read.
        progressTarget_ = progress_ = 1.0;
        SetStage(Stage::CodeFailed);
      } else if (payloadExit_ == 0) {
        progressTarget_ = 1.0;
        SetStage(Stage::Opening);
      } else {
        errorMessage_ = L"Setup did not complete (code " + std::to_wstring(payloadExit_) +
                        L"). Please try again.";
        SetStage(Stage::Error);
      }
      return 0;
    }

    case kUninstallMsgDone: {
      const DWORD code = (DWORD)wp;
      if (code == kUninstallSuccessful || code == kUninstallRequiresReboot || code == kChromeNotInstalled) {
        progressTarget_ = 1.0;
        progress_ = 1.0;
        SetStage(Stage::Removed);
        if (!demo_) ScheduleSelfCleanup();
      } else if (code == ERROR_FILE_NOT_FOUND) {
        errorMessage_ = L"Redrob Browser's uninstaller could not be found.";
        SetStage(Stage::Error);
      } else {
        errorMessage_ = L"Redrob Browser could not be removed (code " + std::to_wstring(code) +
                        L"). Please try again.";
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

    case WM_LBUTTONDOWN: {
      POINT pt{GET_X_LPARAM(lp), GET_Y_LPARAM(lp)};
      if (PtInRect(&rcClose_, pt)) { RequestClose(false); return 0; }
      if (PtInRect(&rcMin_, pt)) { ShowWindow(hwnd_, SW_MINIMIZE); return 0; }
      if (stage_ == Stage::Confirm) {
        if (PtInRect(&rcCheck_, pt)) { deleteData_ = !deleteData_; InvalidateRect(hwnd_, nullptr, FALSE); return 0; }
        if (PtInRect(&rcRetry_, pt)) { StartUninstall(); return 0; }       // "Uninstall"
        if (PtInRect(&rcErrClose_, pt)) { RequestClose(true); return 0; }  // "Cancel"
      }
      if (stage_ == Stage::Welcome) {
        if (!codePresent_ && PtInRect(&rcCheck_, pt)) {
          installCode_ = !installCode_;
          InvalidateRect(hwnd_, nullptr, FALSE);
          return 0;
        }
        if (PtInRect(&rcRetry_, pt)) { StartInstall(); return 0; }         // "Install"
        if (PtInRect(&rcErrClose_, pt)) { RequestClose(true); return 0; }  // "Cancel"
      }
      if (stage_ == Stage::CodeFailed && PtInRect(&rcRetry_, pt)) { RequestClose(true); return 0; }  // "Close"
      if (stage_ == Stage::Removed && PtInRect(&rcRetry_, pt)) { RequestClose(true); return 0; }  // "Close"
      if (stage_ == Stage::Error && mode_ == Mode::Uninstall && PtInRect(&rcRetry_, pt)) {
        errorMessage_.clear();
        SetStage(Stage::Confirm);  // back to the question, so a retry is still a choice
        return 0;
      }
      if (stage_ == Stage::Error && PtInRect(&rcRetry_, pt)) {
        // Retry: restart the sequence. A Redrob Code install that already succeeded is not repeated.
        errorMessage_.clear();
        StartInstall();
        return 0;
      }
      if (stage_ == Stage::Error && PtInRect(&rcErrClose_, pt)) { RequestClose(true); return 0; }
      // Anywhere else on the caption strip drags the window.
      if (pt.y < MulDiv((int)kCaption, dpi_, 96)) {
        ReleaseCapture();
        SendMessage(hwnd_, WM_NCLBUTTONDOWN, HTCAPTION, 0);
      }
      return 0;
    }

    case WM_KEYDOWN:
      if (wp == VK_ESCAPE) { RequestClose(false); return 0; }
      if (stage_ == Stage::Confirm && wp == VK_SPACE) {
        deleteData_ = !deleteData_;
        InvalidateRect(hwnd_, nullptr, FALSE);
        return 0;
      }
      if (stage_ == Stage::Confirm && wp == VK_RETURN) { StartUninstall(); return 0; }
      if (stage_ == Stage::Welcome && wp == VK_SPACE && !codePresent_) {
        installCode_ = !installCode_;
        InvalidateRect(hwnd_, nullptr, FALSE);
        return 0;
      }
      if (stage_ == Stage::Welcome && wp == VK_RETURN) { StartInstall(); return 0; }
      if (stage_ == Stage::CodeFailed && wp == VK_RETURN) { RequestClose(true); return 0; }
      return 0;

    case WM_SYSKEYDOWN:
      if (wp == VK_F4) { RequestClose(false); return 0; }  // Alt+F4
      return DefWindowProc(hwnd_, msg, wp, lp);

    case WM_CLOSE:
      RequestClose(false);
      return 0;

    case WM_DESTROY:
      KillTimer(hwnd_, kTickTimer);
      DiscardDeviceResources();
      PostQuitMessage(0);
      return 0;
  }
  return DefWindowProc(hwnd_, msg, wp, lp);
}

void SetupApp::RequestClose(bool force) {
  // While installing, Esc / close ask for confirmation first (do not abandon an
  // install silently). In demo and error states, close immediately.
  bool installing = (stage_ == Stage::Installing || stage_ == Stage::Preparing ||
                     stage_ == Stage::InstallingCode) && !demo_ && !force && mode_ == Mode::Install;
  // A removal cannot be safely abandoned halfway; closing waits for it to finish.
  if (stage_ == Stage::Removing && !force) return;
  if (installing) {
    int r = MessageBoxW(hwnd_,
        L"Redrob Browser is still installing. Stop the installation and quit?",
        L"Redrob Browser Setup", MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2);
    if (r != IDYES) return;
  }
  DestroyWindow(hwnd_);
}

void SetupApp::SetStage(Stage s) {
  if (s != stage_) stageTick_ = GetTickCount64();
  stage_ = s;
  g_statusOverride.clear();
  if (s == Stage::Opening) openedAt_ = GetTickCount64();
  if (s == Stage::Error || s == Stage::Confirm || s == Stage::Removed || s == Stage::Welcome ||
      s == Stage::CodeFailed)
    KillTimer(hwnd_, kTickTimer);
  if (hwnd_) InvalidateRect(hwnd_, nullptr, FALSE);
}

// The Install button (and Retry). The worker installs Redrob Code first when it was chosen, then the browser.
void SetupApp::StartInstall() {
  progress_ = progressTarget_ = 0.0;
  startTick_ = GetTickCount64();
  payloadDone_ = false;
  codeError_.clear();
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
    // Removal reports no progress either: the same eased ramp, over ~12s, capped until setup.exe exits.
    if (stage_ == Stage::Removing) {
      double t = std::min(1.0, (GetTickCount64() - startTick_) / 12000.0);
      progressTarget_ = 0.90 * (1 - (1 - t) * (1 - t));
    }
  } else if (demo_ && stage_ != Stage::Error) {
    // Scripted demo, same shape as a real run. With Redrob Code chosen:
    //   Preparing (0-0.8s) -> Installing Redrob Code (0.8-4s, bar to ~kCodeShare)
    //   -> Installing (4-8s, bar to ~0.9) -> Opening (8-9.5s) -> close, or the "Redrob Code was not
    //   installed" screen with --demo-code-error. Without it, the Redrob Code step is skipped (as before).
    const ULONGLONG code = installCode_ ? 3200 : 0;
    if (elapsed < 800) { if (stage_ != Stage::Preparing) SetStage(Stage::Preparing); progressTarget_ = 0.04; }
    else if (elapsed < 800 + code) { if (stage_ != Stage::InstallingCode) SetStage(Stage::InstallingCode);
      progressTarget_ = kCodeShare * 0.95 * EaseOut((elapsed - 800) / (double)code); }
    else if (elapsed < 5000 + code) { if (stage_ != Stage::Installing) SetStage(Stage::Installing);
      const double base = installCode_ ? kCodeShare : 0.0;
      progressTarget_ = base + (0.90 - base) * EaseOut((elapsed - 800 - code) / 4200.0); }
    else if (demoCodeError_ && installCode_) {
      codeError_ = L"its download did not match the release checksum";
      progressTarget_ = progress_ = 1.0;
      SetStage(Stage::CodeFailed);
      return;
    }
    else if (elapsed < 6500 + code) { if (stage_ != Stage::Opening) SetStage(Stage::Opening); progressTarget_ = 1.0; }
    else { DestroyWindow(hwnd_); return; }
  } else if (!demo_) {
    // Real run. The worker posts each step as it starts it (kStageMsg); each step's bar is a time-based
    // eased ramp, capped until the step's process exits. Without Redrob Code, Preparing turns into
    // Installing after 0.6s as it always did.
    if (stage_ == Stage::Preparing && !installCode_ && elapsed > 600) SetStage(Stage::Installing);
    const double since = (double)(GetTickCount64() - stageTick_);
    if (stage_ == Stage::InstallingCode) {
      progressTarget_ = kCodeShare * 0.95 * EaseOut(std::min(1.0, since / 25000.0));  // ~35 MB download
    }
    if (stage_ == Stage::Installing && !payloadDone_) {
      const double base = (installCode_ && !codePresent_) ? kCodeShare : 0.0;
      progressTarget_ = base + (0.90 - base) * EaseOut(std::min(1.0, since / 30000.0));  // approach over ~30s
    }
    if (stage_ == Stage::Opening) {
      progressTarget_ = 1.0;
      // Close on a fixed delay after Opening began, regardless of the eased bar:
      // The browser has been launched (by mini_installer or EnsureBrowserLaunched),
      // so there is nothing left for this window to do but get out of the way. A fixed
      // wall-clock close guarantees the window never lingers on the user's screen.
      if (GetTickCount64() - openedAt_ > 1400) { DestroyWindow(hwnd_); return; }
    }
  }

  // Ease displayed progress toward the target (motion < 1/3 s per step).
  progress_ += (progressTarget_ - progress_) * 0.12;
  if (progress_ > 0.9999) progress_ = 1.0;
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
  HRESULT hr = d2dFactory_->CreateHwndRenderTarget(
      props, D2D1::HwndRenderTargetProperties(hwnd_, size, D2D1_PRESENT_OPTIONS_NONE), &rt_);
  (void)hr;
  if (!rt_) return;
  rt_->SetDpi((float)dpi_, (float)dpi_);
  bgBitmap_ = LoadPngResource(IDR_BACKGROUND_PNG, rt_);
  lockupBitmap_ = LoadPngResource(IDR_LOCKUP_PNG, rt_);
}

void SetupApp::DiscardDeviceResources() {
  bgBitmap_.reset();
  lockupBitmap_.reset();
  rt_.reset();
}

ComPtr<ID2D1Bitmap> SetupApp::LoadPngResource(int resId, ComPtr<ID2D1HwndRenderTarget>& rt) {
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

  rt_->BeginDraw();
  rt_->Clear(kRedrobBlack);

  const float W = (float)kBaseW, H = (float)kBaseH;

  // Background art (deep ground + wash-edge), drawn to fill the window.
  if (bgBitmap_) {
    rt_->DrawBitmap(bgBitmap_.p, D2D1::RectF(0, 0, W, H), 1.0f,
                    D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
  }

  ComPtr<ID2D1SolidColorBrush> ink, muted, blue, track, danger, white;
  rt_->CreateSolidColorBrush(kInkPrimary, &ink);
  rt_->CreateSolidColorBrush(kInkMuted, &muted);
  rt_->CreateSolidColorBrush(kActionBlue, &blue);
  rt_->CreateSolidColorBrush(kTrack, &track);
  rt_->CreateSolidColorBrush(kDanger, &danger);
  rt_->CreateSolidColorBrush(kWhite, &white);

  // ---- caption glyphs (min / close), top-right -----------------------------
  const float gl = 14.0f;              // glyph half-size
  const float cy = kCaption / 2.0f;
  const float closeX = W - 28.0f;
  const float minX   = W - 64.0f;
  computeButtonRects(minX, closeX, cy);
  // close (x)
  rt_->DrawLine(D2D1::Point2F(closeX - gl / 2, cy - gl / 2),
                D2D1::Point2F(closeX + gl / 2, cy + gl / 2), ink.p, 1.6f);
  rt_->DrawLine(D2D1::Point2F(closeX + gl / 2, cy - gl / 2),
                D2D1::Point2F(closeX - gl / 2, cy + gl / 2), ink.p, 1.6f);
  // minimize (-)
  rt_->DrawLine(D2D1::Point2F(minX - gl / 2, cy),
                D2D1::Point2F(minX + gl / 2, cy), ink.p, 1.6f);

  // ---- lockup (product mark + name), centered upper third ------------------
  if (lockupBitmap_) {
    D2D1_SIZE_F ls = lockupBitmap_->GetSize();
    float lh = 34.0f;                       // >= 18px min screen (10-logo.md)
    float lw = ls.width * (lh / ls.height);
    float lx = (W - lw) / 2.0f;
    float ly = H * 0.30f;
    rt_->DrawBitmap(lockupBitmap_.p, D2D1::RectF(lx, ly, lx + lw, ly + lh), 1.0f,
                    D2D1_BITMAP_INTERPOLATION_MODE_LINEAR);
  }

  // ---- status line, centered ------------------------------------------------
  std::wstring status = StatusText(stage_);
  D2D1_RECT_F statusRc = D2D1::RectF(40, H * 0.46f, W - 40, H * 0.46f + 30);
  if (fmtStatus_) rt_->DrawTextW(status.c_str(), (UINT32)status.size(), fmtStatus_.p, statusRc,
                                 (stage_ == Stage::Error ? danger.p : ink.p));

  ComPtr<ID2D1SolidColorBrush> black;
  rt_->CreateSolidColorBrush(kRedrobBlack, &black);
  // A white pill (the one prominent action, black type) and an outline pill, as the error state draws them.
  auto pill = [&](float x, float y, float w, float h, const wchar_t* label, bool primary) {
    D2D1_ROUNDED_RECT rr = {D2D1::RectF(x, y, x + w, y + h), h / 2, h / 2};
    if (primary) rt_->FillRoundedRectangle(rr, white.p);
    else rt_->DrawRoundedRectangle(rr, track.p, 1.4f);
    if (fmtButton_) rt_->DrawTextW(label, (UINT32)wcslen(label), fmtButton_.p,
                                   D2D1::RectF(x, y, x + w, y + h), primary ? black.p : ink.p);
  };
  const float pw = 120.0f, ph = 38.0f, py = H * 0.72f;

  // A 16px box and its label, centred together as one row. The whole row is the hit target, not just the box.
  auto checkRow = [&](const wchar_t* label, bool checked) {
    float labelW = 200.0f;
    ComPtr<IDWriteTextLayout> layout;
    if (fmtButton_ && SUCCEEDED(dwFactory_->CreateTextLayout(label, (UINT32)wcslen(label), fmtButton_.p,
                                                             W, 24.0f, &layout))) {
      layout->SetTextAlignment(DWRITE_TEXT_ALIGNMENT_LEADING);
      DWRITE_TEXT_METRICS tm{};
      if (SUCCEEDED(layout->GetMetrics(&tm))) labelW = tm.widthIncludingTrailingWhitespace;
    }
    const float box = 16.0f, gap = 10.0f, rowY = H * 0.615f;
    const float rowX = (W - (box + gap + labelW)) / 2.0f;
    D2D1_ROUNDED_RECT boxRR = {D2D1::RectF(rowX, rowY, rowX + box, rowY + box), 4.0f, 4.0f};
    if (checked) {
      rt_->FillRoundedRectangle(boxRR, blue.p);
      rt_->DrawLine(D2D1::Point2F(rowX + 4.0f, rowY + 8.5f), D2D1::Point2F(rowX + 7.0f, rowY + 11.5f), white.p, 1.8f);
      rt_->DrawLine(D2D1::Point2F(rowX + 7.0f, rowY + 11.5f), D2D1::Point2F(rowX + 12.5f, rowY + 5.0f), white.p, 1.8f);
    } else {
      rt_->DrawRoundedRectangle(boxRR, muted.p, 1.4f);
    }
    if (layout) rt_->DrawTextLayout(D2D1::Point2F(rowX + box + gap, rowY + box / 2 - 12.0f), layout.p, ink.p);
    rcCheck_ = ToDevice(rowX - 6.0f, rowY - 6.0f, box + gap + labelW + 12.0f, box + 12.0f);
  };
  auto bodyLine = [&](const wchar_t* body) {
    if (fmtButton_) rt_->DrawTextW(body, (UINT32)wcslen(body), fmtButton_.p,
                                   D2D1::RectF(60, H * 0.53f, W - 60, H * 0.59f), muted.p);
  };
  auto twoPills = [&](const wchar_t* primary, const wchar_t* secondary) {
    const float ux = W / 2.0f - pw - 8.0f, cx = W / 2.0f + 8.0f;
    rcRetry_ = ToDevice(ux, py, pw, ph);
    rcErrClose_ = ToDevice(cx, py, pw, ph);
    pill(ux, py, pw, ph, primary, true);
    pill(cx, py, pw, ph, secondary, false);
  };

  if (stage_ == Stage::Welcome) {
    bodyLine(L"Installs for this Windows account. No administrator rights needed.");
    if (codePresent_) {
      // Nothing to offer: say what is there instead of a box that would do nothing.
      const wchar_t* have = L"Redrob Code is already installed on this PC.";
      if (fmtButton_) rt_->DrawTextW(have, (UINT32)wcslen(have), fmtButton_.p,
                                     D2D1::RectF(60, H * 0.605f, W - 60, H * 0.665f), muted.p);
      rcCheck_ = RECT{};
    } else {
      checkRow(L"Also install Redrob Code, the coding agent", installCode_);
    }
    twoPills(L"Install", L"Cancel");
  } else if (stage_ == Stage::CodeFailed) {
    const std::wstring msg = L"Redrob Code was not installed: " + codeError_ +
                             L". Get it later from github.com/redrob-labs/redrob-code.";
    if (fmtButton_) rt_->DrawTextW(msg.c_str(), (UINT32)msg.size(), fmtButton_.p,
                                   D2D1::RectF(60, H * 0.53f, W - 60, H * 0.66f), muted.p);
    const float x = (W - pw) / 2.0f;
    rcRetry_ = ToDevice(x, py, pw, ph);  // Close
    rcErrClose_ = RECT{};
    pill(x, py, pw, ph, L"Close", true);
  } else if (stage_ == Stage::Confirm) {
    bodyLine(L"Redrob Browser will close and be removed from this PC.");
    checkRow(L"Also delete your browsing data", deleteData_);
    twoPills(L"Uninstall", L"Cancel");
  } else if (stage_ == Stage::Removed) {
    const wchar_t* body = deleteData_ ? L"Your browsing data was deleted too."
                                      : L"Your browsing data stays on this PC.";
    if (fmtButton_) rt_->DrawTextW(body, (UINT32)wcslen(body), fmtButton_.p,
                                   D2D1::RectF(60, H * 0.53f, W - 60, H * 0.59f), muted.p);
    const float x = (W - pw) / 2.0f;
    rcRetry_ = ToDevice(x, py, pw, ph);  // Close
    rcErrClose_ = RECT{};
    pill(x, py, pw, ph, L"Close", true);
  } else if (stage_ != Stage::Error) {
    // ---- progress bar: thin, rounded, blue fill on a faint track -----------
    const float barW = W * 0.76f, barH = 6.0f;
    const float barX = (W - barW) / 2.0f, barY = H * 0.60f;
    D2D1_ROUNDED_RECT trackRR = {D2D1::RectF(barX, barY, barX + barW, barY + barH), barH / 2, barH / 2};
    rt_->FillRoundedRectangle(trackRR, track.p);
    float fillW = (float)(barW * progress_);
    if (fillW > barH) {
      D2D1_ROUNDED_RECT fillRR = {D2D1::RectF(barX, barY, barX + fillW, barY + barH), barH / 2, barH / 2};
      rt_->FillRoundedRectangle(fillRR, blue.p);
    }
  } else {
    // ---- error state: message + Retry (white pill, black type) / Close -----
    D2D1_RECT_F msgRc = D2D1::RectF(60, H * 0.54f, W - 60, H * 0.66f);
    if (fmtButton_) rt_->DrawTextW(errorMessage_.c_str(), (UINT32)errorMessage_.size(),
                                   fmtButton_.p, msgRc, muted.p);
    // Retry pill (white fill, black type) -- the single prominent CTA.
    const float pw = 120.0f, ph = 38.0f, py = H * 0.72f;
    const float rx = W / 2.0f - pw - 8.0f, cx = W / 2.0f + 8.0f;
    rcRetry_ = ToDevice(rx, py, pw, ph);
    rcErrClose_ = ToDevice(cx, py, pw, ph);
    D2D1_ROUNDED_RECT pill = {D2D1::RectF(rx, py, rx + pw, py + ph), ph / 2, ph / 2};
    rt_->FillRoundedRectangle(pill, white.p);
    D2D1_RECT_F rtxt = D2D1::RectF(rx, py, rx + pw, py + ph);
    if (fmtButton_) rt_->DrawTextW(L"Retry", 5, fmtButton_.p, rtxt, black.p);
    // Close (outline)
    D2D1_ROUNDED_RECT closeRR = {D2D1::RectF(cx, py, cx + pw, py + ph), ph / 2, ph / 2};
    rt_->DrawRoundedRectangle(closeRR, track.p, 1.4f);
    D2D1_RECT_F ctxt = D2D1::RectF(cx, py, cx + pw, py + ph);
    if (fmtButton_) rt_->DrawTextW(L"Close", 5, fmtButton_.p, ctxt, ink.p);
  }

  HRESULT hr = rt_->EndDraw();
  if (hr == D2DERR_RECREATE_TARGET) DiscardDeviceResources();
  EndPaint(hwnd_, &ps);
}

// device-pixel rect from logical (dip) coordinates
RECT SetupApp::ToDevice(float x, float y, float w, float h) {
  float s = dpi_ / 96.0f;
  RECT r;
  r.left = (LONG)(x * s); r.top = (LONG)(y * s);
  r.right = (LONG)((x + w) * s); r.bottom = (LONG)((y + h) * s);
  return r;
}

void SetupApp::computeButtonRects(float minX, float closeX, float cy) {
  float s = dpi_ / 96.0f;
  auto box = [&](float cx) {
    RECT r; r.left = (LONG)((cx - 16) * s); r.top = (LONG)((cy - 16) * s);
    r.right = (LONG)((cx + 16) * s); r.bottom = (LONG)((cy + 16) * s); return r;
  };
  rcMin_ = box(minX);
  rcClose_ = box(closeX);
}

// ---- payload ---------------------------------------------------------------

DWORD WINAPI SetupApp::PayloadThunk(LPVOID self) {
  return reinterpret_cast<SetupApp*>(self)->RunPayload();
}

bool SetupApp::ExtractPayload(std::wstring& outPath) {
  HRSRC res = FindResourceW(hinst_, MAKEINTRESOURCEW(IDR_PAYLOAD), RT_RCDATA);
  if (!res) return false;
  HGLOBAL h = LoadResource(hinst_, res);
  void* data = LockResource(h);
  DWORD sz = SizeofResource(hinst_, res);
  if (!data || !sz) return false;

  wchar_t tmp[MAX_PATH];
  GetTempPathW(MAX_PATH, tmp);
  wchar_t name[MAX_PATH];
  GetTempFileNameW(tmp, L"rbs", 0, name);
  std::wstring exe = std::wstring(name) + L".exe";
  HANDLE f = CreateFileW(exe.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                         FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return false;
  DWORD written = 0;
  WriteFile(f, data, sz, &written, nullptr);
  CloseHandle(f);
  DeleteFileW(name);  // the 0-byte temp GetTempFileName created
  if (written != sz) return false;
  outPath = exe;
  return true;
}

// Whether a browser process is running from the per-user install directory.
static bool BrowserRunning(const std::wstring& appDir) {
  HANDLE snap = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
  if (snap == INVALID_HANDLE_VALUE) return false;
  bool found = false;
  PROCESSENTRY32W pe = {sizeof(pe)};
  for (BOOL ok = Process32FirstW(snap, &pe); ok && !found; ok = Process32NextW(snap, &pe)) {
    // Redrob: redrob-browser.exe since 0.5; chrome.exe is an install from before the rename.
    if (lstrcmpiW(pe.szExeFile, L"redrob-browser.exe") != 0 &&
        lstrcmpiW(pe.szExeFile, L"chrome.exe") != 0) continue;
    HANDLE h = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pe.th32ProcessID);
    if (!h) continue;
    wchar_t path[MAX_PATH];
    DWORD len = MAX_PATH;
    if (QueryFullProcessImageNameW(h, 0, path, &len) &&
        _wcsnicmp(path, appDir.c_str(), appDir.size()) == 0) {
      found = true;
    }
    CloseHandle(h);
  }
  CloseHandle(snap);
  return found;
}

// mini_installer launches the browser only on a FIRST install (setup_main.cc: FIRST_INSTALL_SUCCESS). A
// repair or an update over an existing install exits 0 and launches nothing, so this window would promise
// "Opening Redrob Browser" and then open nothing. Give a first install's own launch a few seconds to appear,
// and start the browser ourselves only if it has not -- never a second window on a first install.
void SetupApp::EnsureBrowserLaunched() {
  wchar_t local[MAX_PATH];
  if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) return;
  const std::wstring appDir = std::wstring(local) + L"\\Redrob\\Application\\";
  for (int i = 0; i < 16; ++i) {
    if (BrowserRunning(appDir)) return;
    Sleep(250);
  }
  const std::wstring exe = appDir + L"redrob-browser.exe";
  if (GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) return;
  ShellExecuteW(nullptr, L"open", exe.c_str(), nullptr, appDir.c_str(), SW_SHOWNORMAL);
}

// %LOCALAPPDATA%, or empty.
static std::wstring LocalAppData() {
  wchar_t local[MAX_PATH];
  if (FAILED(SHGetFolderPathW(nullptr, CSIDL_LOCAL_APPDATA, nullptr, 0, local))) return L"";
  return local;
}

// The Settings > Apps entry Chromium's setup writes (install_static::GetUninstallRegistryPath()).
constexpr wchar_t kArpKey[] = L"Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Redrob";
// Where we keep Chromium's own uninstall command once our window replaces it.
constexpr wchar_t kSavedUninstallValue[] = L"RedrobChromiumUninstallString";

static std::wstring ReadArpString(const wchar_t* value) {
  wchar_t buf[2048];
  DWORD size = sizeof(buf);
  if (RegGetValueW(HKEY_CURRENT_USER, kArpKey, value, RRF_RT_REG_SZ, nullptr, buf, &size) != ERROR_SUCCESS)
    return L"";
  return buf;
}

static bool WriteArpString(const wchar_t* value, const std::wstring& data) {
  return RegSetKeyValueW(HKEY_CURRENT_USER, kArpKey, value, REG_SZ, data.c_str(),
                         (DWORD)((data.size() + 1) * sizeof(wchar_t))) == ERROR_SUCCESS;
}

// After a successful install: put the payload-less build of this app (embedded as IDR_UNINSTALLER) at
// %LOCALAPPDATA%\Redrob\Uninstall and point Settings > Apps at it. Chromium's own command is kept beside it,
// so the uninstaller knows which setup.exe does the removal. Best effort: if any step fails the entry keeps
// Chromium's plain dialog, which still works.
void SetupApp::InstallUninstaller() {
  HRSRC res = FindResourceW(hinst_, MAKEINTRESOURCEW(IDR_UNINSTALLER), RT_RCDATA);
  if (!res) return;
  HGLOBAL h = LoadResource(hinst_, res);
  void* data = LockResource(h);
  DWORD sz = SizeofResource(hinst_, res);
  const std::wstring local = LocalAppData();
  if (!data || !sz || local.empty()) return;
  if (ReadArpString(L"UninstallString").empty()) return;  // Chromium wrote no entry; nothing to redirect

  const std::wstring dir = local + L"\\Redrob\\Uninstall";
  CreateDirectoryW((local + L"\\Redrob").c_str(), nullptr);
  CreateDirectoryW(dir.c_str(), nullptr);
  const std::wstring exe = dir + L"\\redrob_uninstall.exe";
  HANDLE f = CreateFileW(exe.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
  if (f == INVALID_HANDLE_VALUE) return;
  DWORD written = 0;
  WriteFile(f, data, sz, &written, nullptr);
  CloseHandle(f);
  if (written != sz) { DeleteFileW(exe.c_str()); return; }

  // Every install rewrites UninstallString with Chromium's command; save that one, never our own.
  const std::wstring current = ReadArpString(L"UninstallString");
  if (current.find(L"redrob_uninstall.exe") == std::wstring::npos) WriteArpString(kSavedUninstallValue, current);
  WriteArpString(L"UninstallString", L"\"" + exe + L"\" --uninstall");
}

// Chromium's setup.exe for this install: the saved command's program, else the newest
// Application\<version>\Installer\setup.exe.
static std::wstring FindChromiumSetup() {
  std::wstring saved = ReadArpString(kSavedUninstallValue);
  if (saved.size() > 2 && saved[0] == L'"') {
    const size_t end = saved.find(L'"', 1);
    if (end != std::wstring::npos) {
      std::wstring prog = saved.substr(1, end - 1);
      if (GetFileAttributesW(prog.c_str()) != INVALID_FILE_ATTRIBUTES) return prog;
    }
  }
  const std::wstring app = LocalAppData() + L"\\Redrob\\Application\\";
  std::wstring best;
  WIN32_FIND_DATAW fd;
  HANDLE find = FindFirstFileW((app + L"*").c_str(), &fd);
  if (find == INVALID_HANDLE_VALUE) return L"";
  do {
    if (!(fd.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) || fd.cFileName[0] < L'0' || fd.cFileName[0] > L'9')
      continue;
    const std::wstring candidate = app + fd.cFileName + L"\\Installer\\setup.exe";
    if (GetFileAttributesW(candidate.c_str()) != INVALID_FILE_ATTRIBUTES && candidate > best) best = candidate;
  } while (FindNextFileW(find, &fd));
  FindClose(find);
  return best;
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

// The removal is Chromium's: --force-uninstall skips its own confirmation dialog (ours just asked) and
// closes running browser windows; --delete-profile removes the user data dir.
DWORD SetupApp::RunUninstall() {
  if (demo_) {
    Sleep(4500);
    PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)kUninstallSuccessful, 0);
    return 0;
  }
  const std::wstring setup = FindChromiumSetup();
  if (setup.empty()) {
    PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)ERROR_FILE_NOT_FOUND, 0);
    return 1;
  }
  std::wstring cmd = L"\"" + setup + L"\" --uninstall --force-uninstall";
  if (deleteData_) cmd += L" --delete-profile";
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  DWORD exitCode = ERROR_FILE_NOT_FOUND;
  if (CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
  PostMessage(hwnd_, kUninstallMsgDone, (WPARAM)exitCode, 0);
  return exitCode;
}

// Once removed, this exe is the last thing of ours left. A running exe cannot delete itself, so a hidden
// PowerShell waits for this process to exit and removes it, then the directory only if that left it empty.
// The folder is shared: Redrob Code's own uninstaller (Inno Setup, UninstallFilesDir
// %LOCALAPPDATA%\Redrob\uninstall) lives in the same place on a case-insensitive file system, and removing
// the whole folder would leave Redrob Code impossible to uninstall. Only when we run from
// %LOCALAPPDATA%\Redrob\Uninstall: a copy started anywhere else is never deleted.
void SetupApp::ScheduleSelfCleanup() {
  wchar_t self[MAX_PATH];
  if (!GetModuleFileNameW(nullptr, self, MAX_PATH)) return;
  const std::wstring dir = LocalAppData() + L"\\Redrob\\Uninstall";
  std::wstring me = self;
  if (dir.size() < 4 || _wcsnicmp(me.c_str(), (dir + L"\\").c_str(), dir.size() + 1) != 0) return;
  std::wstring cmd = L"powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -Command \"Wait-Process -Id " +
                     std::to_wstring(GetCurrentProcessId()) +
                     L" -ErrorAction SilentlyContinue; Remove-Item -LiteralPath '" + me +
                     L"' -Force -ErrorAction SilentlyContinue; if (-not (Get-ChildItem -LiteralPath '" + dir +
                     L"' -Force -ErrorAction SilentlyContinue)) { Remove-Item -LiteralPath '" + dir +
                     L"' -Force -ErrorAction SilentlyContinue }\"";
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  if (CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi)) {
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
}

// ---- Redrob Code (opt-in) --------------------------------------------------

// Lower-case hex SHA-256 of a file, or empty.
static std::string Sha256File(const std::wstring& path) {
  std::string out;
  HANDLE f = CreateFileW(path.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return out;
  BCRYPT_ALG_HANDLE alg = nullptr;
  BCRYPT_HASH_HANDLE hash = nullptr;
  if (BCRYPT_SUCCESS(BCryptOpenAlgorithmProvider(&alg, BCRYPT_SHA256_ALGORITHM, nullptr, 0)) &&
      BCRYPT_SUCCESS(BCryptCreateHash(alg, &hash, nullptr, 0, nullptr, 0, 0))) {
    std::vector<unsigned char> buf(1 << 20);
    DWORD got = 0;
    bool ok = true;
    while (ReadFile(f, buf.data(), (DWORD)buf.size(), &got, nullptr) && got > 0) {
      if (!BCRYPT_SUCCESS(BCryptHashData(hash, buf.data(), got, 0))) { ok = false; break; }
    }
    unsigned char digest[32];
    if (ok && BCRYPT_SUCCESS(BCryptFinishHash(hash, digest, sizeof(digest), 0))) {
      static const char hex[] = "0123456789abcdef";
      for (unsigned char b : digest) { out += hex[b >> 4]; out += hex[b & 15]; }
    }
  }
  if (hash) BCryptDestroyHash(hash);
  if (alg) BCryptCloseAlgorithmProvider(alg, 0);
  CloseHandle(f);
  return out;
}

// The hash SHA256SUMS lists for `asset` ("<64 hex>  <name>" per line, as `sha256sum` writes), or empty.
static std::string ExpectedSha256(const std::wstring& sumsPath, const char* asset) {
  HANDLE f = CreateFileW(sumsPath.c_str(), GENERIC_READ, FILE_SHARE_READ, nullptr, OPEN_EXISTING, 0, nullptr);
  if (f == INVALID_HANDLE_VALUE) return "";
  std::string text(64 * 1024, '\0');
  DWORD got = 0;
  ReadFile(f, &text[0], (DWORD)text.size(), &got, nullptr);
  CloseHandle(f);
  text.resize(got);
  size_t start = 0;
  while (start < text.size()) {
    size_t end = text.find('\n', start);
    if (end == std::string::npos) end = text.size();
    std::string line = text.substr(start, end - start);
    if (!line.empty() && line.back() == '\r') line.pop_back();
    start = end + 1;
    // Exact name after the two-space separator (or "*" for binary mode), so a longer asset name that merely
    // ends the same way never matches.
    if (line.size() < 66 || (line.compare(64, 2, "  ") != 0 && line.compare(64, 2, " *") != 0)) continue;
    if (line.compare(66, std::string::npos, asset) != 0) continue;
    std::string h = line.substr(0, 64);
    std::transform(h.begin(), h.end(), h.begin(), [](char c) { return (char)tolower((unsigned char)c); });
    if (h.find_first_not_of("0123456789abcdef") != std::string::npos) return "";
    return h;
  }
  return "";
}

static bool Download(const wchar_t* url, const std::wstring& to) {
  DeleteUrlCacheEntryW(url);  // `latest` moves; never install a cached older redirect
  return SUCCEEDED(URLDownloadToFileW(nullptr, url, to.c_str(), 0, nullptr)) &&
         GetFileAttributesW(to.c_str()) != INVALID_FILE_ATTRIBUTES;
}

// Download the latest Redrob Code installer, refuse it unless it matches its release's SHA256SUMS, and run it
// silently for this user only. Inno Setup exits 0 on success.
std::wstring SetupApp::InstallRedrobCode() {
  wchar_t tmp[MAX_PATH];
  GetTempPathW(MAX_PATH, tmp);
  const std::wstring dir = std::wstring(tmp) + L"redrob-code-setup-" + std::to_wstring(GetCurrentProcessId());
  CreateDirectoryW(dir.c_str(), nullptr);
  const std::wstring sums = dir + L"\\SHA256SUMS";
  const std::wstring exe = dir + L"\\redrob-code-x64-setup.exe";
  auto cleanup = [&] {
    DeleteFileW(sums.c_str());
    DeleteFileW(exe.c_str());
    RemoveDirectoryW(dir.c_str());
  };

  if (!Download(kCodeSumsUrl, sums) || !Download(kCodeSetupUrl, exe)) {
    cleanup();
    return L"it could not be downloaded";
  }
  const std::string want = ExpectedSha256(sums, kCodeSetupAsset);
  const std::string got = Sha256File(exe);
  if (want.empty() || got != want) {
    cleanup();
    return L"its download did not match the release checksum";
  }

  std::wstring cmd = L"\"" + exe + L"\" /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CURRENTUSER /TASKS=addtopath";
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  DWORD exitCode = ERROR_FILE_NOT_FOUND;
  if (CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW, nullptr, dir.c_str(), &si, &pi)) {
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
  cleanup();
  if (exitCode != 0) return L"its installer stopped (code " + std::to_wstring(exitCode) + L")";
  return L"";
}

DWORD SetupApp::RunPayload() {
  // Redrob Code first, when chosen, so the browser opens already able to find it. Its failure is reported
  // at the end and never stops the browser install.
  if (installCode_ && !codeDone_) {
    PostMessage(hwnd_, kStageMsg, (WPARAM)Stage::InstallingCode, 0);
    codeError_ = InstallRedrobCode();
    codeDone_ = codeError_.empty();
  }
  PostMessage(hwnd_, kStageMsg, (WPARAM)Stage::Installing, 0);

  std::wstring exe;
  if (!ExtractPayload(exe)) {
    PostMessage(hwnd_, kPayloadMsgDone, (WPARAM)ERROR_RESOURCE_DATA_NOT_FOUND, 0);
    return 1;
  }
  extractedPayload_ = exe;

  // Run mini_installer hidden and wait. It installs per-user to %LOCALAPPDATA%;
  // see EnsureBrowserLaunched for who opens the browser afterwards.
  STARTUPINFOW si = {sizeof(si)};
  si.dwFlags = STARTF_USESHOWWINDOW;
  si.wShowWindow = SW_HIDE;
  PROCESS_INFORMATION pi = {};
  std::wstring cmd = L"\"" + exe + L"\"";
  DWORD exitCode = 1;
  if (CreateProcessW(nullptr, &cmd[0], nullptr, nullptr, FALSE, CREATE_NO_WINDOW,
                     nullptr, nullptr, &si, &pi)) {
    WaitForSingleObject(pi.hProcess, INFINITE);
    GetExitCodeProcess(pi.hProcess, &exitCode);
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
  }
  DeleteFileW(exe.c_str());  // tidy the temp payload
  if (exitCode == 0) {
    InstallUninstaller();
    EnsureBrowserLaunched();
  }
  PostMessage(hwnd_, kPayloadMsgDone, (WPARAM)exitCode, 0);
  return exitCode;
}

}  // namespace

// ---- entry point -----------------------------------------------------------

int WINAPI wWinMain(HINSTANCE hinst, HINSTANCE, PWSTR, int) {
  bool demo = false, demoError = false, withCode = false, demoCodeError = false;
  Mode mode = Mode::Install;
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  for (int i = 1; i < argc; ++i) {
    if (lstrcmpiW(argv[i], L"--demo") == 0) demo = true;
    else if (lstrcmpiW(argv[i], L"--demo-error") == 0) { demo = true; demoError = true; }
    else if (lstrcmpiW(argv[i], L"--demo-code-error") == 0) { demo = true; demoCodeError = true; }
    else if (lstrcmpiW(argv[i], L"--with-redrob-code") == 0) withCode = true;
    else if (lstrcmpiW(argv[i], L"--uninstall") == 0) mode = Mode::Uninstall;
    else if (lstrcmpiW(argv[i], L"--demo-uninstall") == 0) { demo = true; mode = Mode::Uninstall; }
  }
  if (argv) LocalFree(argv);

  SetupApp app(demo, demoError, mode, withCode, demoCodeError);
  return app.Run(hinst);
}
