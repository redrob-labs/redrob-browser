// Copyright 2026 Redrob. Portions copyright The Chromium Authors.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

/**
 * Tells the design system which theme to draw.
 *
 * The vendored sheet switches on `[data-theme="dark"]` and contains ZERO `prefers-color-scheme` rules --
 * checked, not assumed. Linking it without this module gives a page that is permanently light no matter
 * what the OS or the browser is set to. The alternative was to restate all 25 themed values behind a
 * media query in our own sheet, which is 25 chances to update one theme and forget the other, and is the
 * duplication the token pin exists to prevent.
 *
 * Import this for its side effect, FIRST, before anything that can paint:
 *
 *     import './theme.js';
 *
 * Two details that look removable and are not:
 *
 * - The `change` listener. A user flipping the OS between light and dark, or Chromium's own appearance
 *   setting, fires it on a live page. Without it the page keeps the theme it happened to load with, and
 *   the only way back is a reload -- which reads as the page ignoring the setting.
 * - Running at module top level rather than on DOMContentLoaded. A module script is deferred, so this
 *   executes after parsing and before the document's first paint; waiting for an event would move it
 *   after that paint and put a white flash in front of every dark-theme page load.
 */

const DARK = '(prefers-color-scheme: dark)';

function apply(dark: boolean) {
  document.documentElement.dataset['theme'] = dark ? 'dark' : 'light';
}

const query = window.matchMedia(DARK);
apply(query.matches);
query.addEventListener('change', e => apply(e.matches));
