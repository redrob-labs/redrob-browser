//! `backdrop-filter` (Filter Effects 2): the filter functions and the
//! pixel operations, shared by the CPU paint, the scene rasterizer and the
//! window so all three filter a backdrop the same way.
//!
//! Functions apply in list order to premultiplied RGBA8. The color
//! functions are the Filter Effects 1 shorthand matrices, applied to the
//! sRGB values as Chrome does; `blur` is a Gaussian with standard deviation
//! equal to its radius, edges clamped (Skia's backdrop edge mode).

use serde::{Deserialize, Serialize};

/// One `backdrop-filter` function. Amounts are the CSS numbers (1 = 100%),
/// lengths CSS px, `hue_rotate` degrees.
#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum FilterOp {
    Blur(f32),
    Brightness(f32),
    Contrast(f32),
    Grayscale(f32),
    Saturate(f32),
    Opacity(f32),
    Invert(f32),
    Sepia(f32),
    HueRotate(f32),
    DropShadow {
        offset: (f32, f32),
        blur: f32,
        color: [f32; 4],
    },
}

/// Parse a CSS filter function list (`blur(5px) saturate(180%)`). None for
/// `none`, an empty list, or a function this does not know (the whole
/// declaration is then invalid, as in CSS).
pub fn parse_filter_list(value: &str) -> Option<Vec<FilterOp>> {
    let value = value.trim();
    if value.is_empty() || value.eq_ignore_ascii_case("none") {
        return None;
    }
    let mut out = Vec::new();
    let mut rest = value;
    while !rest.trim().is_empty() {
        let trimmed = rest.trim_start();
        let open = trimmed.find('(')?;
        let name = trimmed[..open].trim().to_ascii_lowercase();
        let mut depth = 0usize;
        let mut close = None;
        for (i, c) in trimmed[open..].char_indices() {
            match c {
                '(' => depth += 1,
                ')' => {
                    depth -= 1;
                    if depth == 0 {
                        close = Some(open + i);
                        break;
                    }
                }
                _ => {}
            }
        }
        let close = close?;
        let args = trimmed[open + 1..close].trim();
        rest = &trimmed[close + 1..];
        let amount = |default: f32| -> Option<f32> {
            if args.is_empty() {
                return Some(default);
            }
            if let Some(p) = args.strip_suffix('%') {
                return p.trim().parse::<f32>().ok().map(|v| v / 100.0);
            }
            args.parse::<f32>().ok()
        };
        let op = match name.as_str() {
            "blur" => FilterOp::Blur(if args.is_empty() { 0.0 } else { length(args)? }),
            "brightness" => FilterOp::Brightness(amount(1.0)?.max(0.0)),
            "contrast" => FilterOp::Contrast(amount(1.0)?.max(0.0)),
            "grayscale" => FilterOp::Grayscale(amount(1.0)?.clamp(0.0, 1.0)),
            "saturate" => FilterOp::Saturate(amount(1.0)?.max(0.0)),
            "opacity" => FilterOp::Opacity(amount(1.0)?.clamp(0.0, 1.0)),
            "invert" => FilterOp::Invert(amount(1.0)?.clamp(0.0, 1.0)),
            "sepia" => FilterOp::Sepia(amount(1.0)?.clamp(0.0, 1.0)),
            "hue-rotate" => FilterOp::HueRotate(if args.is_empty() { 0.0 } else { angle(args)? }),
            "drop-shadow" => drop_shadow(args)?,
            _ => return None,
        };
        out.push(op);
    }
    (!out.is_empty()).then_some(out)
}

fn length(v: &str) -> Option<f32> {
    let v = v.trim();
    if v == "0" {
        return Some(0.0);
    }
    v.strip_suffix("px")?.trim().parse::<f32>().ok()
}

fn angle(v: &str) -> Option<f32> {
    let v = v.trim();
    if v == "0" {
        return Some(0.0);
    }
    for (unit, factor) in [
        ("deg", 1.0),
        ("grad", 0.9),
        ("rad", 180.0 / std::f32::consts::PI),
        ("turn", 360.0),
    ] {
        if let Some(n) = v.strip_suffix(unit) {
            return n.trim().parse::<f32>().ok().map(|n| n * factor);
        }
    }
    None
}

/// `drop-shadow(<color>? <dx> <dy> <blur>?)`: lengths in px, the color as
/// a hex, `rgb()`/`rgba()` or a few keywords; currentcolor-less default
/// black.
fn drop_shadow(args: &str) -> Option<FilterOp> {
    let mut lengths = Vec::new();
    let mut color = [0.0, 0.0, 0.0, 1.0];
    let mut rest = args.trim();
    while !rest.is_empty() {
        let token_end = if let Some(open) = rest
            .find('(')
            .filter(|o| rest[..*o].chars().all(|c| c.is_ascii_alphabetic()))
        {
            rest[open..].find(')').map(|c| open + c + 1)?
        } else {
            rest.find(char::is_whitespace).unwrap_or(rest.len())
        };
        let token = &rest[..token_end];
        rest = rest[token_end..].trim_start();
        if let Some(l) = length(token) {
            lengths.push(l);
        } else {
            color = parse_color(token)?;
        }
    }
    if !(2..=3).contains(&lengths.len()) {
        return None;
    }
    Some(FilterOp::DropShadow {
        offset: (lengths[0], lengths[1]),
        blur: lengths.get(2).copied().unwrap_or(0.0),
        color,
    })
}

fn parse_color(token: &str) -> Option<[f32; 4]> {
    let t = token.trim().to_ascii_lowercase();
    let named = match t.as_str() {
        "black" => Some([0.0, 0.0, 0.0, 1.0]),
        "white" => Some([1.0, 1.0, 1.0, 1.0]),
        "transparent" => Some([0.0, 0.0, 0.0, 0.0]),
        "red" => Some([1.0, 0.0, 0.0, 1.0]),
        _ => None,
    };
    if named.is_some() {
        return named;
    }
    if let Some(hex) = t.strip_prefix('#') {
        let v = |s: &str| u8::from_str_radix(s, 16).ok().map(|b| b as f32 / 255.0);
        return match hex.len() {
            3 | 4 => {
                let d: Vec<String> = hex.chars().map(|c| format!("{c}{c}")).collect();
                Some([
                    v(&d[0])?,
                    v(&d[1])?,
                    v(&d[2])?,
                    d.get(3).map_or(Some(1.0), |a| v(a))?,
                ])
            }
            6 | 8 => Some([
                v(&hex[0..2])?,
                v(&hex[2..4])?,
                v(&hex[4..6])?,
                if hex.len() == 8 { v(&hex[6..8])? } else { 1.0 },
            ]),
            _ => None,
        };
    }
    let inner = t
        .strip_prefix("rgba(")
        .or_else(|| t.strip_prefix("rgb("))?
        .strip_suffix(')')?;
    let parts: Vec<&str> = inner
        .split(|c: char| c == ',' || c == '/' || c.is_whitespace())
        .filter(|p| !p.is_empty())
        .collect();
    let channel = |p: &str| -> Option<f32> {
        match p.strip_suffix('%') {
            Some(n) => n.parse::<f32>().ok().map(|n| n / 100.0),
            None => p.parse::<f32>().ok().map(|n| n / 255.0),
        }
    };
    let alpha = |p: &str| -> Option<f32> {
        match p.strip_suffix('%') {
            Some(n) => n.parse::<f32>().ok().map(|n| n / 100.0),
            None => p.parse::<f32>().ok(),
        }
    };
    Some([
        channel(parts.first()?)?,
        channel(parts.get(1)?)?,
        channel(parts.get(2)?)?,
        parts.get(3).map_or(Some(1.0), |a| alpha(a))?,
    ])
}

/// A 4x5 color matrix (rows r, g, b, a; columns r, g, b, a, offset) on
/// straight colors in 0..=1.
type ColorMatrix = [[f32; 5]; 4];

fn rgb_matrix(m: [[f32; 3]; 3]) -> ColorMatrix {
    [
        [m[0][0], m[0][1], m[0][2], 0.0, 0.0],
        [m[1][0], m[1][1], m[1][2], 0.0, 0.0],
        [m[2][0], m[2][1], m[2][2], 0.0, 0.0],
        [0.0, 0.0, 0.0, 1.0, 0.0],
    ]
}

fn color_matrix(op: &FilterOp) -> Option<ColorMatrix> {
    Some(match *op {
        FilterOp::Brightness(a) => [
            [a, 0.0, 0.0, 0.0, 0.0],
            [0.0, a, 0.0, 0.0, 0.0],
            [0.0, 0.0, a, 0.0, 0.0],
            [0.0, 0.0, 0.0, 1.0, 0.0],
        ],
        FilterOp::Contrast(a) => {
            let o = 0.5 - 0.5 * a;
            [
                [a, 0.0, 0.0, 0.0, o],
                [0.0, a, 0.0, 0.0, o],
                [0.0, 0.0, a, 0.0, o],
                [0.0, 0.0, 0.0, 1.0, 0.0],
            ]
        }
        FilterOp::Invert(a) => {
            let s = 1.0 - 2.0 * a;
            [
                [s, 0.0, 0.0, 0.0, a],
                [0.0, s, 0.0, 0.0, a],
                [0.0, 0.0, s, 0.0, a],
                [0.0, 0.0, 0.0, 1.0, 0.0],
            ]
        }
        FilterOp::Opacity(a) => [
            [1.0, 0.0, 0.0, 0.0, 0.0],
            [0.0, 1.0, 0.0, 0.0, 0.0],
            [0.0, 0.0, 1.0, 0.0, 0.0],
            [0.0, 0.0, 0.0, a, 0.0],
        ],
        FilterOp::Grayscale(a) => {
            let s = 1.0 - a;
            rgb_matrix([
                [
                    0.2126 + 0.7874 * s,
                    0.7152 - 0.7152 * s,
                    0.0722 - 0.0722 * s,
                ],
                [
                    0.2126 - 0.2126 * s,
                    0.7152 + 0.2848 * s,
                    0.0722 - 0.0722 * s,
                ],
                [
                    0.2126 - 0.2126 * s,
                    0.7152 - 0.7152 * s,
                    0.0722 + 0.9278 * s,
                ],
            ])
        }
        FilterOp::Sepia(a) => {
            let s = 1.0 - a;
            rgb_matrix([
                [0.393 + 0.607 * s, 0.769 - 0.769 * s, 0.189 - 0.189 * s],
                [0.349 - 0.349 * s, 0.686 + 0.314 * s, 0.168 - 0.168 * s],
                [0.272 - 0.272 * s, 0.534 - 0.534 * s, 0.131 + 0.869 * s],
            ])
        }
        FilterOp::Saturate(s) => rgb_matrix([
            [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
            [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
            [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
        ]),
        FilterOp::HueRotate(deg) => {
            let (sin, cos) = deg.to_radians().sin_cos();
            rgb_matrix([
                [
                    0.213 + cos * 0.787 - sin * 0.213,
                    0.715 - cos * 0.715 - sin * 0.715,
                    0.072 - cos * 0.072 + sin * 0.928,
                ],
                [
                    0.213 - cos * 0.213 + sin * 0.143,
                    0.715 + cos * 0.285 + sin * 0.140,
                    0.072 - cos * 0.072 - sin * 0.283,
                ],
                [
                    0.213 - cos * 0.213 - sin * 0.787,
                    0.715 - cos * 0.715 + sin * 0.715,
                    0.072 + cos * 0.928 + sin * 0.072,
                ],
            ])
        }
        FilterOp::Blur(_) | FilterOp::DropShadow { .. } => return None,
    })
}

fn apply_matrix(rgba: &mut [u8], m: &ColorMatrix) {
    for px in rgba.as_chunks_mut::<4>().0.iter_mut() {
        let a = px[3] as f32 / 255.0;
        if a <= 0.0 && m[3][4] <= 0.0 {
            continue;
        }
        let un = |v: u8| {
            if a > 0.0 {
                (v as f32 / 255.0 / a).min(1.0)
            } else {
                0.0
            }
        };
        let c = [un(px[0]), un(px[1]), un(px[2]), a];
        let mut out = [0.0f32; 4];
        for (row, o) in out.iter_mut().enumerate() {
            *o = (m[row][0] * c[0]
                + m[row][1] * c[1]
                + m[row][2] * c[2]
                + m[row][3] * c[3]
                + m[row][4])
                .clamp(0.0, 1.0);
        }
        let na = out[3];
        px[0] = (out[0] * na * 255.0).round() as u8;
        px[1] = (out[1] * na * 255.0).round() as u8;
        px[2] = (out[2] * na * 255.0).round() as u8;
        px[3] = (na * 255.0).round() as u8;
    }
}

/// Separable Gaussian (standard deviation `sigma` px) over one plane,
/// edges clamped.
fn blur_plane(plane: &mut [f32], w: usize, h: usize, sigma: f32) {
    if sigma <= 0.0 || w == 0 || h == 0 {
        return;
    }
    let radius = (sigma * 3.0).ceil() as i64;
    let mut kernel: Vec<f32> = (-radius..=radius)
        .map(|i| (-((i * i) as f32) / (2.0 * sigma * sigma)).exp())
        .collect();
    let sum: f32 = kernel.iter().sum();
    kernel.iter_mut().for_each(|k| *k /= sum);
    let mut line = vec![0f32; w.max(h)];
    for y in 0..h {
        line[..w].copy_from_slice(&plane[y * w..(y + 1) * w]);
        for x in 0..w {
            let mut v = 0.0;
            for (k, kw) in kernel.iter().enumerate() {
                let sx = (x as i64 + k as i64 - radius).clamp(0, w as i64 - 1) as usize;
                v += kw * line[sx];
            }
            plane[y * w + x] = v;
        }
    }
    for x in 0..w {
        for y in 0..h {
            line[y] = plane[y * w + x];
        }
        for y in 0..h {
            let mut v = 0.0;
            for (k, kw) in kernel.iter().enumerate() {
                let sy = (y as i64 + k as i64 - radius).clamp(0, h as i64 - 1) as usize;
                v += kw * line[sy];
            }
            plane[y * w + x] = v;
        }
    }
}

fn blur(rgba: &mut [u8], w: usize, h: usize, sigma: f32) {
    if sigma <= 0.0 {
        return;
    }
    for c in 0..4 {
        let mut plane: Vec<f32> = rgba.as_chunks::<4>().0.iter().map(|p| p[c] as f32).collect();
        blur_plane(&mut plane, w, h, sigma);
        for (px, v) in rgba.as_chunks_mut::<4>().0.iter_mut().zip(plane) {
            px[c] = v.round().clamp(0.0, 255.0) as u8;
        }
    }
    // Keep premultiplication valid after rounding.
    for px in rgba.as_chunks_mut::<4>().0.iter_mut() {
        px[0] = px[0].min(px[3]);
        px[1] = px[1].min(px[3]);
        px[2] = px[2].min(px[3]);
    }
}

/// Apply `filters` in order to the premultiplied RGBA8 image `rgba`
/// (`w` x `h` device pixels, `scale` device px per CSS px).
pub fn apply_filters(rgba: &mut [u8], w: usize, h: usize, filters: &[FilterOp], scale: f32) {
    if rgba.len() != w * h * 4 {
        return;
    }
    for op in filters {
        match *op {
            FilterOp::Blur(r) => blur(rgba, w, h, r * scale),
            FilterOp::DropShadow {
                offset,
                blur: r,
                color,
            } => {
                let mut alpha: Vec<f32> = vec![0.0; w * h];
                let (dx, dy) = (
                    (offset.0 * scale).round() as i64,
                    (offset.1 * scale).round() as i64,
                );
                for y in 0..h as i64 {
                    for x in 0..w as i64 {
                        let (sx, sy) = (x - dx, y - dy);
                        if sx >= 0 && sy >= 0 && sx < w as i64 && sy < h as i64 {
                            alpha[(y as usize) * w + x as usize] =
                                rgba[(sy as usize * w + sx as usize) * 4 + 3] as f32;
                        }
                    }
                }
                blur_plane(&mut alpha, w, h, r * scale / 2.0);
                for (px, a) in rgba.as_chunks_mut::<4>().0.iter_mut().zip(alpha) {
                    let sa = (a / 255.0) * color[3];
                    let inv = 1.0 - px[3] as f32 / 255.0;
                    let shadow = |c: f32| c * sa * 255.0 * inv;
                    px[0] = (px[0] as f32 + shadow(color[0])).round().min(255.0) as u8;
                    px[1] = (px[1] as f32 + shadow(color[1])).round().min(255.0) as u8;
                    px[2] = (px[2] as f32 + shadow(color[2])).round().min(255.0) as u8;
                    px[3] = (px[3] as f32 + sa * 255.0 * inv).round().min(255.0) as u8;
                }
            }
            ref other => {
                if let Some(m) = color_matrix(other) {
                    apply_matrix(rgba, &m);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_chrome_filter_lists() {
        assert_eq!(
            parse_filter_list("blur(5px) saturate(180%) hue-rotate(90deg)"),
            Some(vec![
                FilterOp::Blur(5.0),
                FilterOp::Saturate(1.8),
                FilterOp::HueRotate(90.0)
            ])
        );
        assert_eq!(parse_filter_list("none"), None);
        assert_eq!(parse_filter_list("blur(5px) frobnicate(1)"), None);
        assert_eq!(
            parse_filter_list("drop-shadow(2px 3px 4px rgba(0, 0, 0, 0.5))"),
            Some(vec![FilterOp::DropShadow {
                offset: (2.0, 3.0),
                blur: 4.0,
                color: [0.0, 0.0, 0.0, 0.5]
            }])
        );
    }

    #[test]
    fn color_functions_match_the_filter_effects_matrices() {
        let mut px = vec![200u8, 100, 50, 255];
        apply_filters(&mut px, 1, 1, &[FilterOp::Grayscale(1.0)], 1.0);
        let l = (0.2126 * 200.0 + 0.7152 * 100.0 + 0.0722 * 50.0f32).round() as u8;
        assert_eq!(px, vec![l, l, l, 255]);
        let mut px = vec![200u8, 100, 50, 255];
        apply_filters(&mut px, 1, 1, &[FilterOp::Invert(1.0)], 1.0);
        assert_eq!(px, vec![55, 155, 205, 255]);
        let mut px = vec![200u8, 100, 50, 255];
        apply_filters(
            &mut px,
            1,
            1,
            &[FilterOp::Brightness(0.5), FilterOp::Opacity(0.5)],
            1.0,
        );
        assert_eq!(px, vec![50, 25, 13, 128]);
    }

    #[test]
    fn blur_averages_stripes_and_keeps_flat_color() {
        let (w, h) = (20, 20);
        let mut img: Vec<u8> = (0..w * h)
            .flat_map(|i| {
                let v = if (i / w) % 4 < 2 { 0u8 } else { 255 };
                [v, v, v, 255]
            })
            .collect();
        apply_filters(&mut img, w, h, &[FilterOp::Blur(4.0)], 1.0);
        let mid = img[(10 * w + 10) * 4];
        assert!(mid > 90 && mid < 165, "{mid}");
        let mut flat = [10u8, 20, 30, 255].repeat(16);
        apply_filters(&mut flat, 4, 4, &[FilterOp::Blur(3.0)], 1.0);
        assert_eq!(&flat[..4], &[10, 20, 30, 255]);
    }
}
