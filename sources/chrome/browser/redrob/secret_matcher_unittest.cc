// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

#include "chrome/browser/redrob/secret_matcher.h"

#include <string>
#include <vector>

#include "testing/gtest/include/gtest/gtest.h"

namespace redrob {
namespace {

using Kind = SecretMatcher::Kind;

// What a span covers, so a failure reads as text rather than offsets.
std::vector<std::u16string> Covered(const SecretMatcher& matcher,
                                    std::u16string_view text) {
  std::vector<std::u16string> out;
  for (const auto& span : matcher.Scan(text)) {
    out.emplace_back(text.substr(span.start, span.end - span.start));
  }
  return out;
}

TEST(SecretMatcherTest, FindsAPasswordAsOneTokenAndExactly) {
  SecretMatcher matcher;
  matcher.AddPassword(u"Tr0ub4dor&3");
  EXPECT_EQ(Covered(matcher, u"my password is \"Tr0ub4dor&3\", ok?"),
            std::vector<std::u16string>({u"Tr0ub4dor&3"}));
  // Case matters for a password, and a password inside a longer token is not that password.
  EXPECT_TRUE(Covered(matcher, u"tr0ub4dor&3").empty());
  EXPECT_TRUE(Covered(matcher, u"xTr0ub4dor&3x").empty());
}

TEST(SecretMatcherTest, SkipsShortPasswordsAndOnesWithSpaces) {
  SecretMatcher matcher;
  matcher.AddPassword(u"abc12");
  matcher.AddPassword(u"two words here");
  EXPECT_EQ(matcher.size(), 0u);
}

TEST(SecretMatcherTest, MatchesNamesAndAddressesFoldedAndCollapsed) {
  SecretMatcher matcher;
  matcher.AddValue(Kind::kName, u"Jiwon Kim");
  matcher.AddValue(Kind::kAddress, u"12 Teheran-ro,\n Gangnam-gu");
  matcher.AddValue(Kind::kName, u"김지원");
  const std::u16string text =
      u"Ship to JIWON  kim at 12 teheran-ro, gangnam-gu. 김지원 님.";
  const auto spans = matcher.Scan(text);
  ASSERT_EQ(spans.size(), 3u);
  EXPECT_EQ(spans[0].kind, Kind::kName);
  EXPECT_EQ(text.substr(spans[0].start, spans[0].end - spans[0].start),
            u"JIWON  kim");
  EXPECT_EQ(spans[1].kind, Kind::kAddress);
  EXPECT_EQ(spans[2].kind, Kind::kName);
}

TEST(SecretMatcherTest, MatchesNumbersAsDigitsOnGroupBoundaries) {
  SecretMatcher matcher;
  matcher.AddValue(Kind::kPhone, u"01012345678");
  matcher.AddValue(Kind::kCard, u"4111111111111111");
  EXPECT_EQ(Covered(matcher, u"call 010-1234-5678 or pay 4111 1111 1111 1111"),
            std::vector<std::u16string>(
                {u"010-1234-5678", u"4111 1111 1111 1111"}));
  // The same digits inside a longer number are not the saved number.
  EXPECT_TRUE(Covered(matcher, u"ref 9010123456789").empty());
}

TEST(SecretMatcherTest, LongerMatchWinsAnOverlap) {
  SecretMatcher matcher;
  matcher.AddValue(Kind::kName, u"Jiwon");
  matcher.AddValue(Kind::kName, u"Jiwon Kim");
  EXPECT_EQ(Covered(matcher, u"Dear Jiwon Kim,"),
            std::vector<std::u16string>({u"Jiwon Kim"}));
}

TEST(SecretMatcherTest, ResetForgetsEverything) {
  SecretMatcher matcher;
  matcher.AddPassword(u"correct-horse");
  matcher.Reset();
  EXPECT_TRUE(Covered(matcher, u"correct-horse").empty());
}

TEST(SecretMatcherTest, SpansAreUtf16Offsets) {
  SecretMatcher matcher;
  matcher.AddPassword(u"s3cr3t-value");
  const std::u16string text = u"😀 s3cr3t-value";
  const auto spans = matcher.Scan(text);
  ASSERT_EQ(spans.size(), 1u);
  // The emoji is two UTF-16 units and the space one.
  EXPECT_EQ(spans[0].start, 3u);
  EXPECT_EQ(spans[0].end, 15u);
}

}  // namespace
}  // namespace redrob
