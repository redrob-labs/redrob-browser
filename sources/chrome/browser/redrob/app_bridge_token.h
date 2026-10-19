// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_APP_BRIDGE_TOKEN_H_
#define CHROME_BROWSER_REDROB_APP_BRIDGE_TOKEN_H_

#include <string>
#include <string_view>

#include "base/no_destructor.h"
#include "base/unguessable_token.h"

namespace redrob {

// The environment variable the browser sets for the agent server it launches, and nobody else.
inline constexpr char kAppBridgeTokenEnv[] = "REDROB_APP_BRIDGE_TOKEN";

// A secret made once per browser run. Only the agent server the browser starts gets it, in that
// child's environment (never on its command line, where `ps` would show it). Browser.redrobLogin
// refuses a caller that cannot present it, so another local program on the debugging port cannot
// ask the agent to sign in.
inline const std::string& AppBridgeToken() {
  static const base::NoDestructor<std::string> token(
      base::UnguessableToken::Create().ToString());
  return *token;
}

// Constant-time, so the answer time says nothing about how much of a guess was right.
inline bool IsAppBridgeToken(std::string_view candidate) {
  const std::string& token = AppBridgeToken();
  if (candidate.size() != token.size()) {
    return false;
  }
  unsigned char diff = 0;
  for (size_t i = 0; i < token.size(); ++i) {
    diff |= static_cast<unsigned char>(candidate[i] ^ token[i]);
  }
  return diff == 0;
}

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_APP_BRIDGE_TOKEN_H_
