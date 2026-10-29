//! Text coverage the way Chrome draws it on Linux: FreeType-style LCD
//! (subpixel) masks, Skia's gamma "pre-blend" tables and Skia's LCD16
//! blend.
//!
//! - A glyph is rasterized at three times its horizontal resolution; each
//!   pixel's red, green and blue channels take the left, middle and right
//!   third. FreeType's default LCD filter (FT_LCD_FILTER_DEFAULT, taps
//!   8 77 86 77 8 / 256) runs across the subpixels.
//! - Skia corrects the linear coverage per channel with a table picked by
//!   that channel of the text color (SkMaskGamma, 3 luminance bits),
//!   built from the contrast and gamma Chromium sets for Linux
//!   (SK_GAMMA_CONTRAST 0.2, SK_GAMMA_EXPONENT 1.2).
//! - The corrected mask is stored as RGB565 and blended per channel as
//!   `dst + ((src - dst) * m >> 5)` with `m` in 0..=32.
//!
//! Portions derived from Skia (https://skia.org), BSD-3-Clause:
//! src/core/SkMaskGamma.{h,cpp}, src/core/SkBlitter_ARGB32.cpp.

use std::sync::OnceLock;

/// FreeType's default LCD filter.
const FIR: [u32; 5] = [8, 77, 86, 77, 8];

/// Skia's text contrast and device gamma on Linux, as Skia stores them
/// (contrast in 1/255, gamma in 1/64).
const CONTRAST: f32 = 51.0 / 255.0;
const GAMMA: f32 = 76.0 / 64.0;

/// An LCD glyph mask: per-pixel red, green, blue coverage after the
/// FreeType filter, before gamma correction.
pub(crate) struct LcdGlyph {
    /// Pixel offset of the mask from the glyph origin (x right, y down to
    /// the mask's top row).
    pub left: i32,
    pub top: i32,
    pub width: i32,
    pub height: i32,
    pub data: Vec<[u8; 3]>,
}

impl LcdGlyph {
    /// Filter a coverage mask rasterized at 3x horizontal resolution.
    /// `left3` is the mask's left edge in subpixels from the glyph origin
    /// (which sits on a pixel boundary), `top` its top row in pixels.
    pub(crate) fn from_subpixels(mask: &[u8], w3: usize, h: usize, left3: i32, top: i32) -> Self {
        let s0 = left3 - 2;
        let s1 = left3 + w3 as i32 + 2;
        let p0 = s0.div_euclid(3);
        let p1 = (s1 + 2).div_euclid(3);
        let width = (p1 - p0).max(0);
        let mut data = vec![[0u8; 3]; width as usize * h];
        for row in 0..h {
            let line = &mask[row * w3..(row + 1) * w3];
            let at = |s: i32| -> u32 {
                let i = s - left3;
                if i < 0 || i as usize >= w3 {
                    0
                } else {
                    line[i as usize] as u32
                }
            };
            for p in p0..p1 {
                let mut out = [0u8; 3];
                for (c, value) in out.iter_mut().enumerate() {
                    let s = p * 3 + c as i32;
                    let mut v = 0;
                    for (k, w) in FIR.iter().enumerate() {
                        v += w * at(s - 2 + k as i32);
                    }
                    *value = (v >> 8).min(255) as u8;
                }
                data[row * width as usize + (p - p0) as usize] = out;
            }
        }
        LcdGlyph {
            left: p0,
            top,
            width,
            height: h as i32,
            data,
        }
    }
}

fn apply_contrast(srca: f32, contrast: f32) -> f32 {
    srca + ((1.0 - srca) * contrast * srca)
}

/// SkTMaskGamma_build_correcting_lut with a power-curve device gamma.
fn build_correcting_lut(src_i: u8, contrast: f32, gamma: f32) -> [u8; 256] {
    let to_luma = |v: f32| v.powf(gamma);
    let from_luma = |v: f32| v.powf(1.0 / gamma);
    let src = src_i as f32 / 255.0;
    let lin_src = to_luma(src);
    let dst = 1.0 - src;
    let lin_dst = to_luma(dst);
    let adjusted_contrast = contrast * lin_dst;
    let mut table = [0u8; 256];
    if (src - dst).abs() < 1.0 / 256.0 {
        for (i, out) in table.iter_mut().enumerate() {
            let srca = apply_contrast(i as f32 / 255.0, adjusted_contrast);
            *out = (255.0 * srca).round().clamp(0.0, 255.0) as u8;
        }
    } else {
        for (i, out) in table.iter_mut().enumerate() {
            let srca = apply_contrast(i as f32 / 255.0, adjusted_contrast);
            let dsta = 1.0 - srca;
            let lin_out = lin_src * srca + dsta * lin_dst;
            let value = from_luma(lin_out);
            let result = (value - dst) / (src - dst);
            *out = (255.0 * result).round().clamp(0.0, 255.0) as u8;
        }
    }
    table
}

/// sk_t_scale255<3>.
fn scale255_3(base: u8) -> u8 {
    let base = (base as u32) << 5;
    (base | (base >> 3) | (base >> 6)) as u8
}

fn tables() -> &'static [[u8; 256]; 8] {
    static TABLES: OnceLock<[[u8; 256]; 8]> = OnceLock::new();
    TABLES.get_or_init(|| {
        let mut out = [[0u8; 256]; 8];
        for (i, table) in out.iter_mut().enumerate() {
            *table = build_correcting_lut(scale255_3(i as u8), CONTRAST, GAMMA);
        }
        out
    })
}

/// The gamma tables for the red, green and blue mask channels of text in
/// `color` (straight RGB).
pub(crate) fn lcd_preblend(color: [u8; 4]) -> [&'static [u8; 256]; 3] {
    let t = tables();
    [
        &t[(color[0] >> 5) as usize],
        &t[(color[1] >> 5) as usize],
        &t[(color[2] >> 5) as usize],
    ]
}

/// The gamma table for a grayscale (A8) mask of text in `color`.
pub(crate) fn gray_preblend(color: [u8; 4]) -> &'static [u8; 256] {
    let lum = (color[0] as u32 * 54 + color[1] as u32 * 183 + color[2] as u32 * 19) >> 8;
    &tables()[(lum >> 5) as usize]
}

fn upscale_31_to_32(v: u32) -> u32 {
    v + (v >> 4)
}

fn blend_32(src: u32, dst: u32, scale: u32) -> u32 {
    (dst as i32 + (((src as i32 - dst as i32) * scale as i32) >> 5)) as u32
}

/// Skia's LCD16 blend of straight color `src` through the gamma-corrected
/// channel coverage `mask` onto an opaque pixel `dst` (RGB). `alpha`
/// scales the coverage (text color alpha times any clip mask, 0..=255).
pub(crate) fn blend_lcd(src: [u8; 3], alpha: u32, mask: [u8; 3], dst: [u8; 3]) -> [u8; 3] {
    // RGB565 storage keeps 5 bits of red and blue and 6 of green; the
    // blend drops green to 5 bits as well.
    let mut m = [
        upscale_31_to_32(mask[0] as u32 >> 3),
        upscale_31_to_32(mask[1] as u32 >> 3),
        upscale_31_to_32(mask[2] as u32 >> 3),
    ];
    if alpha < 255 {
        let a = alpha + 1;
        for v in &mut m {
            *v = *v * a >> 8;
        }
    }
    [
        blend_32(src[0] as u32, dst[0] as u32, m[0]) as u8,
        blend_32(src[1] as u32, dst[1] as u32, m[1]) as u8,
        blend_32(src[2] as u32, dst[2] as u32, m[2]) as u8,
    ]
}
