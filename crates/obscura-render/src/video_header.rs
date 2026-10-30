//! Intrinsic video size read from a container header, without decoding.
//!
//! Chrome lays a `<video>` out at its natural size as soon as metadata is
//! known. Serve mode may have no decoder, so read the size the container
//! declares: the first video track's `tkhd` (or `avc1`/`hvc1`/... sample
//! entry) in MP4/MOV, `PixelWidth`/`PixelHeight` in WebM/Matroska, and the
//! picture size of an Ogg Theora identification header. Only the first
//! bytes of a file are needed when its `moov` comes first.

/// Resource-cache key prefix of a header-only (first bytes) media fetch.
/// The page transport strips it and sends `Range: bytes=0-N`.
pub const MEDIA_HEADER_PREFIX: &str = "obscura-media-header:";

/// How many leading bytes a header read asks for. Enough for `moov` up to
/// the first track header of a fast-start MP4 and for a WebM's Tracks.
pub const MEDIA_HEADER_BYTES: usize = 128 * 1024;

/// The media URL behind a header-only cache key, if `url` is one.
pub fn media_header_target(url: &str) -> Option<&str> {
    url.strip_prefix(MEDIA_HEADER_PREFIX)
}

/// The video's natural (width, height) in CSS px, or `None`.
pub fn video_dimensions(bytes: &[u8]) -> Option<(f32, f32)> {
    if bytes.len() >= 8 && &bytes[4..8] == b"ftyp"
        || bytes.len() >= 8 && matches!(&bytes[4..8], b"moov" | b"mdat" | b"free" | b"wide")
    {
        return mp4_dimensions(bytes);
    }
    if bytes.starts_with(&[0x1A, 0x45, 0xDF, 0xA3]) {
        return ebml_dimensions(bytes);
    }
    if bytes.starts_with(b"OggS") {
        return theora_dimensions(bytes);
    }
    None
}

fn be32(b: &[u8], at: usize) -> Option<u32> {
    Some(u32::from_be_bytes(b.get(at..at + 4)?.try_into().ok()?))
}

fn be16(b: &[u8], at: usize) -> Option<u16> {
    Some(u16::from_be_bytes(b.get(at..at + 2)?.try_into().ok()?))
}

/// Child boxes of `data`: (type, payload).
fn mp4_boxes(data: &[u8]) -> Vec<([u8; 4], &[u8])> {
    let mut out = Vec::new();
    let mut at = 0usize;
    while at + 8 <= data.len() {
        let Some(size32) = be32(data, at) else { break };
        let kind: [u8; 4] = data[at + 4..at + 8].try_into().unwrap_or([0; 4]);
        let (header, size) = match size32 {
            1 => {
                let Some(large) = data.get(at + 8..at + 16) else {
                    break;
                };
                (
                    16usize,
                    u64::from_be_bytes(large.try_into().unwrap_or([0; 8])) as usize,
                )
            }
            0 => (8, data.len() - at),
            n => (8, n as usize),
        };
        if size < header {
            break;
        }
        let end = at.saturating_add(size).min(data.len());
        out.push((kind, &data[at + header..end]));
        at = at.saturating_add(size);
    }
    out
}

fn mp4_dimensions(bytes: &[u8]) -> Option<(f32, f32)> {
    let moov = mp4_boxes(bytes).into_iter().find(|(k, _)| k == b"moov")?.1;
    for (kind, trak) in mp4_boxes(moov) {
        if &kind != b"trak" {
            continue;
        }
        let children = mp4_boxes(trak);
        // tkhd: version(1) flags(3) ... width/height are the last 8 bytes
        // as 16.16 fixed point, already in display (presentation) size.
        if let Some((_, tkhd)) = children.iter().find(|(k, _)| k == b"tkhd") {
            if tkhd.len() >= 84 {
                let w = be32(tkhd, tkhd.len() - 8)? as f32 / 65536.0;
                let h = be32(tkhd, tkhd.len() - 4)? as f32 / 65536.0;
                if w > 0.0 && h > 0.0 {
                    return Some((w, h));
                }
            }
        }
        // Fall back to the visual sample entry (mdia/minf/stbl/stsd).
        let sample = children
            .iter()
            .find(|(k, _)| k == b"mdia")
            .and_then(|(_, m)| mp4_boxes(m).into_iter().find(|(k, _)| k == b"minf"))
            .and_then(|(_, m)| mp4_boxes(m).into_iter().find(|(k, _)| k == b"stbl"))
            .and_then(|(_, m)| mp4_boxes(m).into_iter().find(|(k, _)| k == b"stsd"));
        if let Some((_, stsd)) = sample {
            // stsd: version/flags(4) entry_count(4) then entries.
            if let Some((kind, entry)) = stsd.get(8..).and_then(|e| mp4_boxes(e).into_iter().next())
            {
                if matches!(
                    &kind,
                    b"avc1" | b"avc3" | b"hvc1" | b"hev1" | b"vp09" | b"av01" | b"mp4v"
                ) {
                    // VisualSampleEntry: 6 reserved + 2 index + 16 pre-defined.
                    let w = be16(entry, 24)? as f32;
                    let h = be16(entry, 26)? as f32;
                    if w > 0.0 && h > 0.0 {
                        return Some((w, h));
                    }
                }
            }
        }
    }
    None
}

/// An EBML variable-length integer at `at`: (value, length). `marker`
/// keeps the length marker bit (element IDs) or strips it (sizes).
fn vint(b: &[u8], at: usize, marker: bool) -> Option<(u64, usize)> {
    let first = *b.get(at)?;
    let len = first.leading_zeros() as usize + 1;
    if len > 8 {
        return None;
    }
    let mut value = if marker {
        first as u64
    } else {
        (first as u64) & (0xFF >> len)
    };
    for i in 1..len {
        value = (value << 8) | *b.get(at + i)? as u64;
    }
    Some((value, len))
}

fn ebml_dimensions(bytes: &[u8]) -> Option<(f32, f32)> {
    // Walk master elements (Segment 0x18538067, Tracks 0x1654AE6B,
    // TrackEntry 0xAE, Video 0xE0) and read PixelWidth 0xB0 / Height 0xBA,
    // preferring DisplayWidth 0x54B0 / DisplayHeight 0x54BA.
    fn walk(b: &[u8], depth: usize, out: &mut [Option<u64>; 4]) {
        let mut at = 0usize;
        while at < b.len() && depth < 6 {
            let Some((id, id_len)) = vint(b, at, true) else {
                return;
            };
            let Some((size, size_len)) = vint(b, at + id_len, false) else {
                return;
            };
            let start = at + id_len + size_len;
            let unknown = size == (1u64 << (7 * size_len)) - 1;
            let end = if unknown {
                b.len()
            } else {
                start.saturating_add(size as usize).min(b.len())
            };
            let body = &b[start.min(b.len())..end];
            let uint = || body.iter().fold(0u64, |v, x| (v << 8) | *x as u64);
            match id {
                0x18538067 | 0x1654AE6B | 0xAE | 0xE0 => walk(body, depth + 1, out),
                0xB0 => out[0] = out[0].or(Some(uint())),
                0xBA => out[1] = out[1].or(Some(uint())),
                0x54B0 => out[2] = out[2].or(Some(uint())),
                0x54BA => out[3] = out[3].or(Some(uint())),
                // A cluster means the headers are over.
                0x1F43B675 => return,
                _ => {}
            }
            if out[0].is_some() && out[1].is_some() && depth > 0 {
                // keep scanning siblings for display size within this Video
            }
            at = end;
        }
    }
    let mut out = [None; 4];
    walk(bytes, 0, &mut out);
    let (w, h) = match (out[2], out[3]) {
        (Some(w), Some(h)) if w > 0 && h > 0 => (w, h),
        _ => (out[0]?, out[1]?),
    };
    (w > 0 && h > 0).then_some((w as f32, h as f32))
}

fn theora_dimensions(bytes: &[u8]) -> Option<(f32, f32)> {
    // The identification header packet starts 0x80 "theora".
    let at = bytes.windows(7).position(|w| w == b"\x80theora")?;
    let h = bytes.get(at..at + 20)?;
    // id(7) version(3) FMBW(2) FMBH(2) PICW(3) PICH(3)
    let picw = (h[14] as u32) << 16 | (h[15] as u32) << 8 | h[16] as u32;
    let pich = (h[17] as u32) << 16 | (h[18] as u32) << 8 | h[19] as u32;
    (picw > 0 && pich > 0).then_some((picw as f32, pich as f32))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn mp4_box(kind: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let mut v = ((payload.len() + 8) as u32).to_be_bytes().to_vec();
        v.extend_from_slice(kind);
        v.extend_from_slice(payload);
        v
    }

    #[test]
    fn reads_mp4_track_header_size() {
        let mut tkhd = vec![0u8; 76];
        tkhd.extend_from_slice(&(320u32 << 16).to_be_bytes());
        tkhd.extend_from_slice(&(176u32 << 16).to_be_bytes());
        let trak = mp4_box(b"trak", &mp4_box(b"tkhd", &tkhd));
        let mut file = mp4_box(b"ftyp", b"isom\0\0\0\0");
        file.extend(mp4_box(b"moov", &trak));
        assert_eq!(video_dimensions(&file), Some((320.0, 176.0)));
    }

    #[test]
    fn reads_webm_pixel_size() {
        // EBML header, Segment(unknown size) > Tracks > TrackEntry > Video.
        let video = [0xB0, 0x82, 0x01, 0x40, 0xBA, 0x81, 0xB0];
        let mut entry = vec![0xE0, 0x80 | video.len() as u8];
        entry.extend_from_slice(&video);
        let mut track = vec![0xAE, 0x80 | entry.len() as u8];
        track.extend_from_slice(&entry);
        let mut tracks = vec![0x16, 0x54, 0xAE, 0x6B, 0x80 | track.len() as u8];
        tracks.extend_from_slice(&track);
        let mut file = vec![0x1A, 0x45, 0xDF, 0xA3, 0x80];
        file.extend_from_slice(&[
            0x18, 0x53, 0x80, 0x67, 0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        ]);
        file.extend_from_slice(&tracks);
        assert_eq!(video_dimensions(&file), Some((320.0, 176.0)));
    }

    #[test]
    fn reads_theora_picture_size() {
        let mut file = b"OggS".to_vec();
        file.extend_from_slice(&[0; 24]);
        file.extend_from_slice(b"\x80theora\x03\x02\x01");
        file.extend_from_slice(&[0, 20, 0, 11, 0, 1, 0x40, 0, 0, 0xB0]);
        assert_eq!(video_dimensions(&file), Some((320.0, 176.0)));
    }
}
