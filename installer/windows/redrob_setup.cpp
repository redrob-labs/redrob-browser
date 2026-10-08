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
// Flags:
//   --demo         run the whole UI sequence on a timer with NO payload.
//   --demo-error   show the error state immediately.
//   (no flag)      extract and run the embedded payload for real.

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
#include <string>
#include <algorithm>
#include <memory>

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

enum class Stage { Preparing, Installing, Opening, Error };

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
  SetupApp(bool demo, bool demoError) : demo_(demo), demoError_(demoError) {}

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

  void SetStage(Stage s);
  void RequestClose(bool force);

  HINSTANCE hinst_ = nullptr;
  HWND hwnd_ = nullptr;
  UINT dpi_ = 96;
  bool demo_ = false;
  bool demoError_ = false;

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
  bool payloadDone_ = false;
  DWORD payloadExit_ = 0;
  HANDLE payloadThread_ = nullptr;
  std::wstring errorMessage_;
  std::wstring extractedPayload_;
  bool closing_ = false;

  // hit-tested button rects (device px), recomputed each paint
  RECT rcMin_{}, rcClose_{}, rcRetry_{}, rcErrClose_{};
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
  }
  return L"";
}

// ---------------------------------------------------------------------------

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
  hwnd_ = CreateWindowExW(WS_EX_APPWINDOW, wc.lpszClassName, L"Redrob Browser Setup",
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
  if (demoError_) {
    errorMessage_ = L"The installer could not be started. Please try again.";
    SetStage(Stage::Error);
  } else {
    SetStage(Stage::Preparing);
    SetTimer(hwnd_, kTickTimer, kTickMs, nullptr);
    if (!demo_) {
      payloadThread_ = CreateThread(nullptr, 0, &SetupApp::PayloadThunk, this, 0, nullptr);
    }
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

    case kPayloadMsgDone: {
      payloadDone_ = true;
      payloadExit_ = (DWORD)wp;
      if (payloadExit_ == 0) {
        progressTarget_ = 1.0;
        SetStage(Stage::Opening);
      } else {
        errorMessage_ = L"Setup did not complete (code " + std::to_wstring(payloadExit_) +
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
      if (stage_ == Stage::Error && PtInRect(&rcRetry_, pt)) {
        // Retry: restart the sequence.
        errorMessage_.clear();
        progress_ = progressTarget_ = 0.0;
        startTick_ = GetTickCount64();
        payloadDone_ = false;
        SetStage(Stage::Preparing);
        SetTimer(hwnd_, kTickTimer, kTickMs, nullptr);
        if (!demo_) payloadThread_ = CreateThread(nullptr, 0, &SetupApp::PayloadThunk, this, 0, nullptr);
        InvalidateRect(hwnd_, nullptr, FALSE);
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
  bool installing = (stage_ == Stage::Installing || stage_ == Stage::Preparing) && !demo_ && !force;
  if (installing) {
    int r = MessageBoxW(hwnd_,
        L"Redrob Browser is still installing. Stop the installation and quit?",
        L"Redrob Browser Setup", MB_YESNO | MB_ICONWARNING | MB_DEFBUTTON2);
    if (r != IDYES) return;
  }
  DestroyWindow(hwnd_);
}

void SetupApp::SetStage(Stage s) {
  stage_ = s;
  g_statusOverride.clear();
  if (s == Stage::Opening) openedAt_ = GetTickCount64();
  if (s == Stage::Error) KillTimer(hwnd_, kTickTimer);
  if (hwnd_) InvalidateRect(hwnd_, nullptr, FALSE);
}

void SetupApp::OnTick() {
  ULONGLONG elapsed = GetTickCount64() - startTick_;

  if (demo_ && stage_ != Stage::Error) {
    // Scripted demo: Preparing (0-0.8s) -> Installing (0.8-5s, bar to ~0.9)
    //                -> Opening (5-6.5s, bar to 1.0) -> close.
    if (elapsed < 800) { if (stage_ != Stage::Preparing) SetStage(Stage::Preparing); progressTarget_ = 0.04; }
    else if (elapsed < 5000) { if (stage_ != Stage::Installing) SetStage(Stage::Installing);
      double t = (elapsed - 800) / 4200.0; progressTarget_ = 0.90 * (1 - (1 - t) * (1 - t)); }
    else if (elapsed < 6500) { if (stage_ != Stage::Opening) SetStage(Stage::Opening); progressTarget_ = 1.0; }
    else { DestroyWindow(hwnd_); return; }
  } else if (!demo_) {
    // Real run. Preparing until the worker reaches Installing; then a time-based
    // eased bar capped at 0.90 until the payload exits.
    if (stage_ == Stage::Preparing && elapsed > 600) SetStage(Stage::Installing);
    if (stage_ == Stage::Installing && !payloadDone_) {
      double t = std::min(1.0, (elapsed - 600) / 30000.0);  // approach over ~30s
      progressTarget_ = 0.90 * (1 - (1 - t) * (1 - t));
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

  if (stage_ != Stage::Error) {
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
    ComPtr<ID2D1SolidColorBrush> black;
    rt_->CreateSolidColorBrush(kRedrobBlack, &black);
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
    if (lstrcmpiW(pe.szExeFile, L"chrome.exe") != 0) continue;
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
  const std::wstring exe = appDir + L"chrome.exe";
  if (GetFileAttributesW(exe.c_str()) == INVALID_FILE_ATTRIBUTES) return;
  ShellExecuteW(nullptr, L"open", exe.c_str(), nullptr, appDir.c_str(), SW_SHOWNORMAL);
}

DWORD SetupApp::RunPayload() {
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
  if (exitCode == 0) EnsureBrowserLaunched();
  PostMessage(hwnd_, kPayloadMsgDone, (WPARAM)exitCode, 0);
  return exitCode;
}

}  // namespace

// ---- entry point -----------------------------------------------------------

int WINAPI wWinMain(HINSTANCE hinst, HINSTANCE, PWSTR, int) {
  bool demo = false, demoError = false;
  int argc = 0;
  LPWSTR* argv = CommandLineToArgvW(GetCommandLineW(), &argc);
  for (int i = 1; i < argc; ++i) {
    if (lstrcmpiW(argv[i], L"--demo") == 0) demo = true;
    else if (lstrcmpiW(argv[i], L"--demo-error") == 0) { demo = true; demoError = true; }
  }
  if (argv) LocalFree(argv);

  SetupApp app(demo, demoError);
  return app.Run(hinst);
}
