// From @redrob-labs/ui 1.7.0, as redrob-launcher's `cargo xtask tokens` generates it (xtask/src/tokens.rs
// there). Do not edit by hand; copy it again from redrob-launcher when the design system changes.
// Include after Palette and Hex.
#pragma once

constexpr Palette kLight = {Hex(0xFFFFFF), Hex(0xEFF1F4), Hex(0x0A0B0C), Hex(0x576071), Hex(0xDFE2E8), Hex(0x7C8390), Hex(0x2B52FF), Hex(0x1733D5), Hex(0x2B52FF), Hex(0xA31310), Hex(0x1733D5), Hex(0xEEF4FF)};
constexpr Palette kDark = {Hex(0x0A0B0C), Hex(0x1C1F26), Hex(0xF8F9FB), Hex(0xAAB0BB), Hex(0x292E37), Hex(0x7C8390), Hex(0x2B52FF), Hex(0x507FFF), Hex(0x8AAFFF), Hex(0xFF4B4B), Hex(0x8AAFFF), Hex(0x030C34)};
constexpr D2D1_COLOR_F kWhite = Hex(0xFFFFFF);
// Fixed artwork colours preserve the installer's theme-independent brand gradient.
constexpr D2D1_COLOR_F kPanelCore = Hex(0x2E7EFF);
constexpr D2D1_COLOR_F kPanelEdge = Hex(0x2746EE);
constexpr D2D1_COLOR_F kPanelViolet = Hex(0x8B82FF);
constexpr D2D1_COLOR_F kPanelMid = Hex(0x2B52FF);
