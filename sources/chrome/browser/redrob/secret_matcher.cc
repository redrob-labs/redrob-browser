// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/secret_matcher.h"

#include <algorithm>
#include <cstring>
#include <tuple>

#include "base/check.h"
#include "base/containers/span.h"
#include "base/i18n/case_conversion.h"
#include "base/strings/string_util.h"
#include "crypto/hmac.h"
#include "crypto/random.h"

namespace redrob {

namespace {

constexpr char kPasswordTag = 'p';
constexpr char kWordsTag = 'w';
constexpr char kDigitsTag = 'd';

bool IsSpace(char16_t c) {
  return base::IsUnicodeWhitespace(c);
}

bool IsDigit(char16_t c) {
  return c >= u'0' && c <= u'9';
}

// What people put between the digits of a phone or card number.
bool IsDigitSeparator(char16_t c) {
  return c == u' ' || c == u'-' || c == u'.' || c == u'(' || c == u')' ||
         c == u'+' || c == u'/' || c == 0x00A0;
}

// Quotes and sentence punctuation that surround a value in prose without being part of it.
bool IsWrapping(char16_t c) {
  static constexpr std::u16string_view kWrapping =
      u"\"'`()[]{}<>,.;:!?\u201C\u201D\u2018\u2019\u300C\u300D";
  return kWrapping.find(c) != std::u16string_view::npos;
}

// [start, end) of `text` with wrapping punctuation removed from both ends.
std::pair<size_t, size_t> Trim(std::u16string_view text,
                               size_t start,
                               size_t end) {
  while (start < end && IsWrapping(text[start])) {
    ++start;
  }
  while (end > start && IsWrapping(text[end - 1])) {
    --end;
  }
  return {start, end};
}

size_t CountWords(std::u16string_view normalised) {
  if (normalised.empty()) {
    return 0;
  }
  return 1 + static_cast<size_t>(
                 std::count(normalised.begin(), normalised.end(), u' '));
}

struct Candidate {
  size_t start;
  size_t end;
  SecretMatcher::Kind kind;
};

}  // namespace

std::u16string NormaliseWords(std::u16string_view text) {
  std::u16string collapsed;
  collapsed.reserve(text.size());
  bool pending_space = false;
  for (char16_t c : text) {
    if (IsSpace(c)) {
      pending_space = !collapsed.empty();
      continue;
    }
    if (pending_space) {
      collapsed.push_back(u' ');
      pending_space = false;
    }
    collapsed.push_back(c);
  }
  return base::i18n::ToLower(collapsed);
}

std::u16string DigitsOnly(std::u16string_view text) {
  std::u16string digits;
  for (char16_t c : text) {
    if (IsDigit(c)) {
      digits.push_back(c);
    }
  }
  return digits;
}

SecretMatcher::SecretMatcher() {
  Reset();
}

SecretMatcher::~SecretMatcher() {
  // The key is the only thing here that would let a digest be tested against a guess.
  std::fill(key_.begin(), key_.end(), 0);
}

void SecretMatcher::Reset() {
  crypto::RandBytes(key_);
  digests_.clear();
  word_counts_.clear();
  digit_counts_.clear();
  has_passwords_ = false;
}

SecretMatcher::Digest SecretMatcher::DigestOf(
    char tag,
    std::u16string_view normalised) const {
  std::vector<uint8_t> data(1 + normalised.size() * sizeof(char16_t));
  data[0] = static_cast<uint8_t>(tag);
  if (!normalised.empty()) {
    std::memcpy(data.data() + 1, normalised.data(),
                normalised.size() * sizeof(char16_t));
  }
  const auto mac = crypto::hmac::SignSha256(key_, data);
  Digest digest;
  std::copy_n(mac.begin(), digest.size(), digest.begin());
  // The buffer held the value in the clear for the length of this call.
  std::fill(data.begin(), data.end(), 0);
  return digest;
}

void SecretMatcher::Insert(char tag,
                           std::u16string_view normalised,
                           Kind kind) {
  digests_.emplace(DigestOf(tag, normalised), kind);
}

void SecretMatcher::AddPassword(std::u16string_view password) {
  // A password with a space in it never appears as one token, so it cannot be matched this way.
  if (password.size() < kMinPasswordLength ||
      std::any_of(password.begin(), password.end(), IsSpace)) {
    return;
  }
  Insert(kPasswordTag, password, Kind::kPassword);
  has_passwords_ = true;
}

void SecretMatcher::AddValue(Kind kind, std::u16string_view value) {
  DCHECK_NE(kind, Kind::kPassword);
  if (kind == Kind::kPhone || kind == Kind::kCard) {
    const std::u16string digits = DigitsOnly(value);
    if (digits.size() < kMinDigits) {
      return;
    }
    Insert(kDigitsTag, digits, kind);
    digit_counts_.insert(digits.size());
    return;
  }
  const std::u16string normalised = NormaliseWords(value);
  const size_t words = CountWords(normalised);
  if (normalised.size() < kMinTextLength || words == 0 || words > kMaxWords) {
    return;
  }
  Insert(kWordsTag, normalised, kind);
  word_counts_.insert(words);
}

std::vector<SecretMatcher::Span> SecretMatcher::Scan(
    std::u16string_view text) const {
  std::vector<Candidate> found;
  if (digests_.empty() || text.empty()) {
    return {};
  }
  auto check = [&](char tag, std::u16string_view normalised, size_t start,
                   size_t end) {
    auto it = digests_.find(DigestOf(tag, normalised));
    if (it != digests_.end()) {
      found.push_back({start, end, it->second});
    }
  };

  // Tokens: maximal runs of non-whitespace.
  std::vector<std::pair<size_t, size_t>> tokens;
  for (size_t i = 0; i < text.size();) {
    while (i < text.size() && IsSpace(text[i])) {
      ++i;
    }
    const size_t start = i;
    while (i < text.size() && !IsSpace(text[i])) {
      ++i;
    }
    if (i > start) {
      tokens.emplace_back(start, i);
    }
  }

  if (has_passwords_) {
    for (const auto& [start, end] : tokens) {
      std::u16string_view token = text.substr(start, end - start);
      if (token.size() >= kMinPasswordLength) {
        check(kPasswordTag, token, start, end);
      }
      const auto [trimmed_start, trimmed_end] = Trim(text, start, end);
      if ((trimmed_start != start || trimmed_end != end) &&
          trimmed_end - trimmed_start >= kMinPasswordLength) {
        check(kPasswordTag,
              text.substr(trimmed_start, trimmed_end - trimmed_start),
              trimmed_start, trimmed_end);
      }
    }
  }

  for (size_t words : word_counts_) {
    for (size_t first = 0; first + words <= tokens.size(); ++first) {
      const auto [start, end] =
          Trim(text, tokens[first].first, tokens[first + words - 1].second);
      if (end - start < kMinTextLength) {
        continue;
      }
      check(kWordsTag, NormaliseWords(text.substr(start, end - start)), start,
            end);
    }
  }

  if (!digit_counts_.empty()) {
    // Runs of digits and separators that begin and end with a digit. Within one, a candidate starts
    // where a digit group starts and ends where one ends, so "010-1234-5678" is not read as "1234".
    for (size_t i = 0; i < text.size();) {
      if (!IsDigit(text[i])) {
        ++i;
        continue;
      }
      std::vector<size_t> digit_at;  // offset of each digit in the run
      std::vector<bool> group_start;
      std::vector<bool> group_end;
      size_t j = i;
      size_t last_digit = i;
      while (j < text.size() && (IsDigit(text[j]) || IsDigitSeparator(text[j]))) {
        if (IsDigit(text[j])) {
          const bool starts = digit_at.empty() || last_digit + 1 != j;
          if (!group_end.empty() && starts) {
            group_end.back() = true;
          }
          digit_at.push_back(j);
          group_start.push_back(starts);
          group_end.push_back(false);
          last_digit = j;
        }
        ++j;
      }
      if (!group_end.empty()) {
        group_end.back() = true;
      }
      for (size_t a = 0; a < digit_at.size(); ++a) {
        if (!group_start[a]) {
          continue;
        }
        for (size_t length : digit_counts_) {
          const size_t b = a + length - 1;
          if (b >= digit_at.size() || !group_end[b]) {
            continue;
          }
          std::u16string digits;
          digits.reserve(length);
          for (size_t k = a; k <= b; ++k) {
            digits.push_back(text[digit_at[k]]);
          }
          check(kDigitsTag, digits, digit_at[a], digit_at[b] + 1);
        }
      }
      i = last_digit + 1;
    }
  }

  // Longest first, then earliest; keep each that overlaps nothing kept.
  std::sort(found.begin(), found.end(), [](const auto& x, const auto& y) {
    return std::make_tuple(y.end - y.start, x.start) <
           std::make_tuple(x.end - x.start, y.start);
  });
  std::vector<Span> spans;
  for (const Candidate& c : found) {
    const bool overlaps = std::any_of(spans.begin(), spans.end(), [&](const Span& s) {
      return c.start < s.end && s.start < c.end;
    });
    if (!overlaps) {
      spans.push_back({c.start, c.end, c.kind});
    }
  }
  std::sort(spans.begin(), spans.end(),
            [](const Span& x, const Span& y) { return x.start < y.start; });
  return spans;
}

}  // namespace redrob
