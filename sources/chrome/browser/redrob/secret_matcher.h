// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#ifndef CHROME_BROWSER_REDROB_SECRET_MATCHER_H_
#define CHROME_BROWSER_REDROB_SECRET_MATCHER_H_

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

#include "base/containers/flat_map.h"
#include "base/containers/flat_set.h"

namespace redrob {

// Finds, in a piece of text, the values the person saved in this browser: their saved passwords and
// their autofill details. Privacy Protection uses it so a saved password pasted into a chat, or read
// off a page, never reaches a model -- the browser can do this because it is the one that holds them.
//
// IT HOLDS NO VALUE. Each saved value is kept only as a keyed SHA-256 digest, the key random per
// process and never written anywhere, so neither this object's memory nor anything it returns can be
// turned back into the value, and nothing it computes outlives the browser. Scan() returns where a
// value occurs and what kind it is, never the value: the caller already has the text it passed in.
//
// HOW IT MATCHES WITHOUT THE VALUES. A saved value can only be found where it could begin and end, so
// the scan hashes candidate spans rather than every substring:
//   * passwords: each whitespace-delimited run, as written and with surrounding quotes or punctuation
//     trimmed -- a password is one token, and it is compared exactly, case and all;
//   * names, emails, addresses: runs of up to kMaxWords words, case-folded with whitespace collapsed,
//     because "Jiwon  KIM" is the saved "Jiwon Kim";
//   * phone and card numbers: runs of digits and the separators people type between them, compared
//     as digits only, so "010-1234-5678" is the saved "01012345678".
// Candidates are bounded by tokens, so a scan costs O(words * kMaxWords) hashes whatever is saved.
class SecretMatcher {
 public:
  enum class Kind { kPassword, kEmail, kPhone, kName, kAddress, kCard };

  struct Span {
    // UTF-16 offsets into the scanned text, end exclusive: what a JavaScript caller can slice with.
    size_t start;
    size_t end;
    Kind kind;
  };

  // Shorter saved values are skipped: a four-letter password or a two-digit "number" would mark half
  // of every page.
  static constexpr size_t kMinPasswordLength = 6;
  static constexpr size_t kMinTextLength = 3;
  static constexpr size_t kMinDigits = 7;
  static constexpr size_t kMaxWords = 8;

  SecretMatcher();
  SecretMatcher(const SecretMatcher&) = delete;
  SecretMatcher& operator=(const SecretMatcher&) = delete;
  ~SecretMatcher();

  // Forgets every value, and draws a new key, so digests from before a reset match nothing after it.
  void Reset();

  void AddPassword(std::u16string_view password);
  // `kind` must not be kPassword. Phone and card values are compared as digits; the rest as words.
  void AddValue(Kind kind, std::u16string_view value);

  size_t size() const { return digests_.size(); }

  // Non-overlapping spans in text order. Where two candidates overlap, the longer wins, so "Jiwon Kim"
  // is one name rather than a name inside a name.
  std::vector<Span> Scan(std::u16string_view text) const;

 private:
  using Digest = std::array<uint8_t, 16>;

  Digest DigestOf(char tag, std::u16string_view normalised) const;
  void Insert(char tag, std::u16string_view normalised, Kind kind);

  std::array<uint8_t, 32> key_;
  // Digest -> the kind it was saved as. A value saved as two kinds keeps the first.
  base::flat_map<Digest, Kind> digests_;
  // Word counts and digit counts that occur among saved values, so a scan only builds the candidate
  // lengths that could match.
  base::flat_set<size_t> word_counts_;
  base::flat_set<size_t> digit_counts_;
  bool has_passwords_ = false;
};

// The lowercase, collapsed form names and addresses are compared in. Exposed for the unit test.
std::u16string NormaliseWords(std::u16string_view text);
// Digits only. Exposed for the unit test.
std::u16string DigitsOnly(std::u16string_view text);

}  // namespace redrob

#endif  // CHROME_BROWSER_REDROB_SECRET_MATCHER_H_
