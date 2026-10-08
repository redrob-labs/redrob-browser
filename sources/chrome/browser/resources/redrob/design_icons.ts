// VENDORED FROM THE REDROB DESIGN SYSTEM -- DO NOT EDIT.
// source: @redrob-labs/ui@1.0.2  dist/icons/index.js
// commit: f97d68788db563c1d398946f51685d550dea163a
//
// Regenerate with: python3 scripts/vendor_design_system.py --update
// A value changed here is a value that disagrees with every other Redrob product.

/* eslint-disable */
// The 16 design-system glyphs this browser draws, as data.
//
// DERIVED, not copied: the delivery ships these as a React module, and this is a WebUI under
// Trusted Types with no React and no bundler, where assigning innerHTML throws. Every attribute
// below is verbatim from that module -- no coordinate has been reformatted or rounded.

export type IconElement = [string, Record<string, string>];

// The frame every glyph shares, read from the delivery's own svg() helper rather than retyped.
// 45-icons.md: 24x24 box on a 20px live area, stroke 2 unscaled, BUTT caps ('Never round'),
// miter joins at limit 3. Size comes from CSS (1em), so width/height are deliberately absent.
export const ICON_FRAME: Record<string, string> = {
  "viewBox": "0 0 24 24",
  "fill": "none",
  "stroke": "currentColor",
  "stroke-width": "2",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  "stroke-miterlimit": "3",
  "aria-hidden": "true",
  "focusable": "false",
};

export const ICONS: Record<string, IconElement[]> = {
  alert: [["circle", {"cx": "12", "cy": "12", "r": "8.5"}], ["line", {"x1": "12", "y1": "7.6", "x2": "12", "y2": "13"}], ["rect", {"x": "11", "y": "15.4", "width": "2", "height": "2"}]],
  blocked: [["circle", {"cx": "12", "cy": "12", "r": "8.5"}], ["line", {"x1": "6", "y1": "18", "x2": "18", "y2": "6"}]],
  browser: [["path", {"d": "M3 4.5H19A2 2 0 0 1 21 6.5V17.5A2 2 0 0 1 19 19.5H5A2 2 0 0 1 3 17.5Z"}], ["line", {"x1": "3", "y1": "9", "x2": "21", "y2": "9"}], ["rect", {"x": "5.5", "y": "6.2", "width": "1.6", "height": "1.6", "fill": "currentColor", "stroke": "none"}], ["rect", {"x": "8.3", "y": "6.2", "width": "1.6", "height": "1.6", "fill": "currentColor", "stroke": "none"}]],
  camera: [["path", {"d": "M3.5 9A1.5 1.5 0 0 1 5 7.5H8L9.5 5H14.5L16 7.5H19A1.5 1.5 0 0 1 20.5 9V18A1.5 1.5 0 0 1 19 19.5H5A1.5 1.5 0 0 1 3.5 18Z"}], ["circle", {"cx": "12", "cy": "13", "r": "3.6"}]],
  chevronDown: [["polyline", {"points": "7 9.9 12 14.1 17 9.9"}]],
  chevronLeft: [["polyline", {"points": "14.1 7 9.9 12 14.1 17"}]],
  close: [["line", {"x1": "5.5", "y1": "5.5", "x2": "18.5", "y2": "18.5"}], ["line", {"x1": "18.5", "y1": "5.5", "x2": "5.5", "y2": "18.5"}]],
  history: [["path", {"d": "M5.23 16.07 A7.9 7.9 0 1 0 5.23 7.93"}], ["polyline", {"points": "9.39 6.5 5.23 7.93 4.54 3.58"}], ["polyline", {"points": "12 7 12 12.4 16.3 14.6"}]],
  key: [["path", {"d": "M9.38 11.91 A4.4 4.4 0 1 1 12.12 8.64"}], ["line", {"x1": "11.17", "y1": "10.63", "x2": "20.4", "y2": "18.37"}], ["line", {"x1": "17.81", "y1": "16.2", "x2": "16.14", "y2": "18.19"}], ["line", {"x1": "20.4", "y1": "18.37", "x2": "19.11", "y2": "19.9"}]],
  list: [["line", {"x1": "9", "y1": "6.5", "x2": "20.5", "y2": "6.5"}], ["line", {"x1": "9", "y1": "12", "x2": "20.5", "y2": "12"}], ["line", {"x1": "9", "y1": "17.5", "x2": "20.5", "y2": "17.5"}], ["rect", {"x": "3.5", "y": "5.5", "width": "2", "height": "2"}], ["rect", {"x": "3.5", "y": "11", "width": "2", "height": "2"}], ["rect", {"x": "3.5", "y": "16.5", "width": "2", "height": "2"}]],
  pending: [["path", {"d": "M3.5 12A8.5 8.5 0 1 1 20.5 12A8.5 8.5 0 1 1 3.5 12"}], ["rect", {"x": "6.6", "y": "11", "width": "2", "height": "2", "fill": "currentColor", "stroke": "none"}], ["rect", {"x": "11", "y": "11", "width": "2", "height": "2", "fill": "currentColor", "stroke": "none"}], ["rect", {"x": "15.4", "y": "11", "width": "2", "height": "2", "fill": "currentColor", "stroke": "none"}]],
  pulse: [["polyline", {"points": "3 12 7.5 12 9.5 6.5 13 17.5 15 12 21 12"}]],
  repeat: [["path", {"d": "M4.5 11V9.5A2.5 2.5 0 0 1 7 7H17"}], ["polyline", {"points": "13.78 9.7 17 7 13.78 4.3"}], ["path", {"d": "M19.5 13V14.5A2.5 2.5 0 0 1 17 17H7"}], ["polyline", {"points": "10.22 14.3 7 17 10.22 19.7"}]],
  route: [["rect", {"x": "3", "y": "19", "width": "2", "height": "2", "fill": "currentColor", "stroke": "none"}], ["polyline", {"points": "5.5 20 9.5 20 9.5 13 15 13 15 6 20.5 6"}]],
  save: [["path", {"d": "M4.5 4.5H16L19.5 8V19.5H4.5Z"}], ["rect", {"x": "8", "y": "4.5", "width": "8", "height": "4.5"}], ["rect", {"x": "8", "y": "13", "width": "8", "height": "6.5"}]],
  search: [["path", {"d": "M12.84 16.02 A6 6 0 1 1 16.35 11.85"}], ["line", {"x1": "15.1", "y1": "14.36", "x2": "20.5", "y2": "18.89"}]],
  shieldCheck: [["path", {"d": "M12 3.4 19.6 6.3 V12.4 C19.6 16.6 16.2 19.4 12 20.6 C7.8 19.4 4.4 16.6 4.4 12.4 V6.3 Z"}], ["polyline", {"points": "8 12.2 10.5 14.3 16 9.68"}]],
  split: [["line", {"x1": "3.5", "y1": "12", "x2": "13", "y2": "12"}], ["path", {"d": "M13 12A2 2 0 0 0 15 10V7H20.5"}], ["path", {"d": "M13 12A2 2 0 0 1 15 14V17H20.5"}]],
};
