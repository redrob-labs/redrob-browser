// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/redrob_fonts.h"

#include "base/files/file_path.h"
#include "base/files/file_util.h"
#include "base/logging.h"
#include "base/path_service.h"
#include "build/build_config.h"
#include "ui/gfx/font_list.h"

#if BUILDFLAG(IS_LINUX)
#include <fontconfig/fontconfig.h>
#endif

#if BUILDFLAG(IS_MAC)
#include <CoreText/CoreText.h>

#include "base/apple/foundation_util.h"
#include "base/apple/scoped_cftyperef.h"
#endif

namespace redrob {
namespace {

// The family name inside the font, which is also the name the WebUI's @font-face declares. They have to
// agree: the CSS asks for "Pretendard Variable" and so does this, so the two halves of the window resolve to
// the same face rather than to two things that merely look similar.
constexpr char kUiFontFamily[] = "Pretendard Variable";

// 13px, and the number is measured rather than inherited. Pretendard draws a smaller cap height than the
// platform default at the same nominal size: at 12px a section label came out with a cap of 8px against the
// reference's 9, and its "Bookmarks" was 54px wide against 67. 13px puts both within a pixel. Stated in one
// string with the family because that is what SetDefaultFontDescription takes, and its DCHECK requires the
// trailing "px".
constexpr char kUiFontDescription[] = "Pretendard Variable, 13px";

// Beside the executable rather than inside a resource pack. The platform font systems take a PATH -- a
// fontconfig file, a Windows font resource, a macOS font URL -- so a font that only exists as bytes in a .pak
// cannot be registered without standing up a font manager of our own, which is a great deal of machinery to
// avoid copying one file.
//
// "Beside the executable" means two different places, which is the blocker the registration code alone does not
// fix. On Linux DIR_MODULE is the output directory, where copy("ui_font") puts the file. On macOS DIR_MODULE is
// inside the framework -- Redrob Browser.app/Contents/Frameworks/Redrob Framework.framework/Versions/A -- and a
// file in the build root is simply not there. The bundle_data target in chrome/browser/redrob/BUILD.gn puts it
// under Resources/fonts of that framework, which is what this resolves to.
base::FilePath UiFontPath() {
  base::FilePath dir;
  if (!base::PathService::Get(base::DIR_MODULE, &dir)) {
    return base::FilePath();
  }
#if BUILDFLAG(IS_MAC)
  // Versions/A/Resources/fonts, reached from Versions/A. DIR_MODULE for the browser process is the versioned
  // framework directory, so this is one hop rather than a walk up the bundle.
  return dir.AppendASCII("Resources").AppendASCII("fonts").AppendASCII(
      "PretendardVariable.ttf");
#else
  return dir.AppendASCII("fonts").AppendASCII("PretendardVariable.ttf");
#endif
}

}  // namespace

void RegisterUiFont() {
  const base::FilePath path = UiFontPath();
  if (path.empty() || !base::PathExists(path)) {
    LOG(WARNING) << "Redrob UI font not found at " << path
                 << "; views will keep the platform default face";
    return;
  }

#if BUILDFLAG(IS_LINUX)
  // The CURRENT config, not a fresh one: fontconfig has already been initialised by the time the browser
  // gets here, and Skia's font manager holds that same config. Adding to a new config would succeed and be
  // invisible.
  if (!FcConfigAppFontAddFile(
          FcConfigGetCurrent(),
          reinterpret_cast<const FcChar8*>(path.value().c_str()))) {
    LOG(WARNING) << "fontconfig refused " << path
                 << "; views will keep the platform default face";
    return;
  }
#elif BUILDFLAG(IS_MAC)
  // NOT YET COMPILED ANYWHERE. This is written on a Linux host and no macOS build of this fork exists, so the
  // first CI run on a mac is its first compile -- treat a failure here as expected work rather than a surprise.
  // It is written now because the alternative was leaving a stub that made the platform look further away than
  // it is: the remaining blockers are the bundle path below, actool for the app icon, and a machine.
  //
  // kCTFontManagerScopeProcess, deliberately. Session scope would register the face for every application the
  // user is running until they log out, and a browser that changes the fonts available to unrelated programs is
  // doing something it was not asked to. Process scope also means no cleanup: it dies with us.
  base::apple::ScopedCFTypeRef<CFURLRef> url(
      base::apple::FilePathToCFURL(path));
  base::apple::ScopedCFTypeRef<CFErrorRef> error;
  if (!CTFontManagerRegisterFontsForURL(url.get(), kCTFontManagerScopeProcess,
                                        error.InitializeInto())) {
    LOG(WARNING) << "CoreText refused " << path
                 << "; views will keep the platform default face";
    return;
  }
#else
  // Not implemented, and named rather than implied. Windows wants AddFontResourceExW with
  // FR_PRIVATE, and it cannot be written blind on a Linux host -- an untested font registration that silently
  // fails is worse than one that says it is missing, because the fallback face looks deliberate.
  LOG(WARNING) << "Redrob UI font registration is not implemented on this platform; "
               << "views will keep the platform default face";
  return;
#endif

  // Only after the family is actually resolvable. Setting this first would leave views asking for a face
  // nothing can supply, and the fallback that follows is chosen by the platform rather than by us.
  gfx::FontList::SetDefaultFontDescription(kUiFontDescription);
  VLOG(1) << "Redrob UI font registered: " << kUiFontFamily;
}

}  // namespace redrob
