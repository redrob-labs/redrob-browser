// Included inside bootstrap's private closure when generating the startup snapshot.
// Redrob Browser media extras (docs/MEDIA.md): full-screen video, <track>
// subtitles handed to the window, and Media Source Extensions. The window
// does the playing; these keep the page-facing state.
(function _redrobMediaExtras() {
  const hasWindow = () => typeof globalThis.redrobMedia === 'function';
  const fire = (target, name) => {
    const ev = new Event(name);
    try { _eventTargetDispatch(target, ev); } catch (_e) {}
    const h = target['on' + name];
    if (typeof h === 'function') { try { h.call(target, ev); } catch (e) { console.error(e); } }
  };
  const later = (fn) => setTimeout(fn, 0);
  const absUrl = (el, raw) => {
    if (!raw) return '';
    try { return new URL(raw, el.baseURI || globalThis.location?.href || 'about:blank').href; }
    catch (_e) { return raw; }
  };

  // Tell the window which subtitle tracks an element has when it loads or plays.
  const baseSend = HTMLMediaElement.prototype.__send;
  HTMLMediaElement.prototype.__send = function (op, extra) {
    if (op === 'play' || op === 'load') {
      const tracks = Array.from(this.querySelectorAll('track')).map((t) => ({
        kind: t.getAttribute('kind') || 'subtitles',
        src: absUrl(t, t.getAttribute('src')),
        default: t.hasAttribute('default'),
        mode: t._textTrack ? t._textTrack.mode : '',
      }));
      extra = Object.assign({ tracks }, extra || {});
    }
    return baseSend.call(this, op, extra);
  };

  // ---- Full screen -------------------------------------------------------
  // Only video is shown full screen: a request on a player's container
  // picks the first <video> inside it.
  let fsElement = null;
  let fsVideo = null;
  const videoOf = (el) => {
    if (el instanceof HTMLMediaElement) return el;
    return el && typeof el.querySelector === 'function' ? el.querySelector('video') : null;
  };
  const fsChanged = (el) => {
    const ev = new Event('fullscreenchange', { bubbles: true });
    try { (el && el.isConnected ? el : document).dispatchEvent(ev); } catch (_e) {}
  };
  function requestFullscreen() {
    const video = videoOf(this);
    if (!hasWindow() || !video) {
      return Promise.reject(new TypeError('Fullscreen request denied'));
    }
    if (fsVideo && fsVideo !== video) fsVideo.__send('fullscreen', { on: false });
    fsElement = this;
    fsVideo = video;
    video.__send('fullscreen', { on: true });
    const el = this;
    later(() => fsChanged(el));
    return Promise.resolve();
  }
  function exitFullscreen() {
    if (!fsElement) return Promise.reject(new TypeError('Document not active'));
    const el = fsElement;
    if (fsVideo) fsVideo.__send('fullscreen', { on: false });
    fsElement = null;
    fsVideo = null;
    later(() => fsChanged(el));
    return Promise.resolve();
  }
  Element.prototype.requestFullscreen = requestFullscreen;
  Element.prototype.webkitRequestFullscreen = requestFullscreen;
  Element.prototype.webkitRequestFullScreen = requestFullscreen;
  Document.prototype.exitFullscreen = exitFullscreen;
  Document.prototype.webkitExitFullscreen = exitFullscreen;
  Document.prototype.webkitCancelFullScreen = exitFullscreen;
  const fsGet = { get() { return fsElement; }, configurable: true };
  Object.defineProperty(Document.prototype, 'fullscreenElement', fsGet);
  Object.defineProperty(Document.prototype, 'webkitFullscreenElement', fsGet);
  Object.defineProperty(Document.prototype, 'webkitCurrentFullScreenElement', fsGet);
  Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: hasWindow, configurable: true });
  Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: hasWindow, configurable: true });
  Object.defineProperty(Document.prototype, 'fullscreen', { get() { return fsElement !== null; }, configurable: true });
  // The window left full screen (Escape, or the tab changed).
  globalThis.__redrobFullscreenExit = function (_id) {
    if (!fsElement) return;
    const el = fsElement;
    fsElement = null;
    fsVideo = null;
    fsChanged(el);
  };

  // ---- TimeRanges --------------------------------------------------------
  class TimeRanges {
    constructor(ranges) { this._r = ranges || []; }
    get length() { return this._r.length; }
    start(i) {
      if (!(i >= 0 && i < this._r.length)) throw new DOMException('The index provided is out of range.', 'IndexSizeError');
      return this._r[i][0];
    }
    end(i) {
      if (!(i >= 0 && i < this._r.length)) throw new DOMException('The index provided is out of range.', 'IndexSizeError');
      return this._r[i][1];
    }
  }
  const TOLERANCE = 0.2;
  const mergeRanges = (list) => {
    const sorted = list.filter((r) => r[1] > r[0]).sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const r of sorted) {
      const last = out[out.length - 1];
      if (last && r[0] <= last[1] + TOLERANCE) last[1] = Math.max(last[1], r[1]);
      else out.push([r[0], r[1]]);
    }
    return out;
  };
  const subtractRange = (list, s, e) => {
    const out = [];
    for (const [a, b] of list) {
      if (b <= s || a >= e) { out.push([a, b]); continue; }
      if (a < s) out.push([a, s]);
      if (b > e) out.push([e, b]);
    }
    return out;
  };
  const intersectRanges = (x, y) => {
    const out = [];
    for (const [a, b] of x) for (const [c, d] of y) {
      const s = Math.max(a, c), e = Math.min(b, d);
      if (e > s) out.push([s, e]);
    }
    return mergeRanges(out);
  };

  // ---- Media segment timing ----------------------------------------------
  // SourceBuffer.buffered must change as soon as an append finishes, so the
  // page reads segment times here: fragmented MP4 (tfdt + trun) and WebM
  // (Cluster Timecode + block timecodes). Bytes may arrive in any slices.
  const MP4_ENTER = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf', 'edts']);
  const MP4_LEAF = new Set(['tkhd', 'mdhd', 'trex', 'tfhd', 'tfdt', 'trun']);
  const WEBM_ENTER = new Set([0x18538067, 0x1F43B675, 0xA0, 0x1654AE6B, 0xAE, 0x1549A966]);
  const WEBM_LEAF = new Set([0x2AD7B1, 0xE7, 0x23E383, 0xD7]);
  const WEBM_BLOCK = new Set([0xA3, 0xA1]);
  const MAX_CARRY = 4 * 1024 * 1024;
  class SegmentTimes {
    constructor(type) {
      this.mp4 = /mp4/i.test(type);
      this.webm = /webm|matroska/i.test(type);
      this.reset();
      this.timescale = {};
      this.defaultDuration = {};
      this.scale = 1000000;
    }
    reset() {
      this.carry = new Uint8Array(0);
      this.skip = 0;
    }
    feed(bytes, offset) {
      const out = [];
      if (!this.mp4 && !this.webm) return out;
      let b = bytes;
      if (this.carry.length) {
        b = new Uint8Array(this.carry.length + bytes.length);
        b.set(this.carry, 0);
        b.set(bytes, this.carry.length);
      }
      this.offset = offset;
      let p = Math.min(this.skip, b.length);
      this.skip -= p;
      while (p < b.length) {
        const next = this.mp4 ? this.mp4Step(b, p, out) : this.webmStep(b, p, out);
        if (next < 0) break;
        p = next;
      }
      this.carry = b.length - p > MAX_CARRY ? new Uint8Array(0) : b.slice(p);
      return out;
    }
    skipTo(b, end) {
      if (end > b.length) { this.skip = end - b.length; return b.length; }
      return end;
    }
    mp4Step(b, p, out) {
      if (p + 8 > b.length) return -1;
      const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
      let size = dv.getUint32(p);
      const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
      let hdr = 8;
      if (size === 1) {
        if (p + 16 > b.length) return -1;
        size = dv.getUint32(p + 8) * 4294967296 + dv.getUint32(p + 12);
        hdr = 16;
      } else if (size === 0) {
        size = Infinity;
      }
      if (size < hdr) { this.reset(); return b.length; }
      if (MP4_ENTER.has(type)) return p + hdr;
      if (MP4_LEAF.has(type)) {
        if (p + size > b.length) return -1;
        this.mp4Leaf(type, new DataView(b.buffer, b.byteOffset + p + hdr, size - hdr), out);
        return p + size;
      }
      return this.skipTo(b, p + size);
    }
    mp4Leaf(type, d, out) {
      if (d.byteLength < 4) return;
      const v = d.getUint8(0);
      const flags = d.getUint32(0) & 0xffffff;
      const u64 = (o) => d.getUint32(o) * 4294967296 + d.getUint32(o + 4);
      if (type === 'tkhd') {
        this.track = d.getUint32(v === 1 ? 20 : 12);
      } else if (type === 'mdhd') {
        this.timescale[this.track] = d.getUint32(v === 1 ? 20 : 12);
      } else if (type === 'trex') {
        this.defaultDuration[d.getUint32(4)] = d.getUint32(12);
      } else if (type === 'tfhd') {
        this.trafTrack = d.getUint32(4);
        let o = 8;
        if (flags & 0x1) o += 8;
        if (flags & 0x2) o += 4;
        this.trafDuration = (flags & 0x8) ? d.getUint32(o) : (this.defaultDuration[this.trafTrack] || 0);
        this.cursor = null;
      } else if (type === 'tfdt') {
        this.cursor = v === 1 ? u64(4) : d.getUint32(4);
      } else if (type === 'trun') {
        if (this.cursor == null) return;
        const count = d.getUint32(4);
        let o = 8;
        if (flags & 0x1) o += 4;
        if (flags & 0x4) o += 4;
        const fields = ((flags & 0x100) ? 1 : 0) + ((flags & 0x200) ? 1 : 0) + ((flags & 0x400) ? 1 : 0) + ((flags & 0x800) ? 1 : 0);
        let duration = 0;
        if (flags & 0x100) {
          for (let i = 0; i < count && o + 4 <= d.byteLength; i++, o += fields * 4) duration += d.getUint32(o);
        } else {
          duration = count * this.trafDuration;
        }
        const scale = this.timescale[this.trafTrack] || Object.values(this.timescale)[0] || 90000;
        const start = this.cursor / scale + this.offset;
        this.cursor += duration;
        out.push([start, this.cursor / scale + this.offset]);
      }
    }
    // EBML variable-length integers. Element IDs keep their marker bit.
    vint(b, p, keepMarker) {
      if (p >= b.length) return null;
      const first = b[p];
      let len = 1;
      while (len <= 8 && !(first & (0x80 >> (len - 1)))) len++;
      if (len > 8) return { bad: true };
      if (p + len > b.length) return null;
      let value = keepMarker ? first : first & (0xff >> len);
      let allOnes = value === (0xff >> len);
      for (let i = 1; i < len; i++) {
        value = value * 256 + b[p + i];
        if (b[p + i] !== 0xff) allOnes = false;
      }
      return { value, len, unknown: !keepMarker && allOnes };
    }
    webmStep(b, p, out) {
      const id = this.vint(b, p, true);
      if (!id) return -1;
      if (id.bad || id.len > 4) { this.reset(); return b.length; }
      const size = this.vint(b, p + id.len, false);
      if (!size) return -1;
      if (size.bad) { this.reset(); return b.length; }
      const body = p + id.len + size.len;
      if (WEBM_ENTER.has(id.value)) return body;
      if (size.unknown) { this.reset(); return b.length; }
      const end = body + size.value;
      if (WEBM_LEAF.has(id.value)) {
        if (end > b.length) return -1;
        let n = 0;
        for (let i = body; i < end; i++) n = n * 256 + b[i];
        if (id.value === 0x2AD7B1) this.scale = n;
        else if (id.value === 0xE7) this.cluster = n;
        else if (id.value === 0xD7) this.track = n;
        else if (id.value === 0x23E383) this.defaultDuration[this.track] = n;
        return end;
      }
      if (WEBM_BLOCK.has(id.value)) {
        const track = this.vint(b, body, false);
        if (!track) return -1;
        if (track.bad) { this.reset(); return b.length; }
        const t = body + track.len;
        if (t + 2 > b.length) return -1;
        let rel = (b[t] << 8) | b[t + 1];
        if (rel & 0x8000) rel -= 0x10000;
        if (this.cluster != null) {
          const start = (this.cluster + rel) * this.scale / 1e9 + this.offset;
          const dd = this.defaultDuration[track.value];
          out.push([start, start + (dd ? dd / 1e9 : 0.02)]);
        }
        return this.skipTo(b, end);
      }
      return this.skipTo(b, end);
    }
  }

  // ---- Media Source Extensions -------------------------------------------
  const sendMse = (el, op, extra) => {
    if (!el || typeof globalThis.redrobMse !== 'function') return;
    globalThis.redrobMse(JSON.stringify(Object.assign({ op, id: el.__media.id }, extra || {})));
  };
  const toBase64 = (u8) => {
    let s = '';
    for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return btoa(s);
  };
  const bytesOf = (data) => {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    throw new TypeError("Failed to execute 'appendBuffer' on 'SourceBuffer': The provided value is not of type '(ArrayBuffer or ArrayBufferView)'.");
  };
  // Codecs the window's GStreamer decoders are expected to have.
  const SUPPORTED_CODEC = /^(avc1|avc3|mp4a|vp8|vp9|vp09|opus|vorbis|flac)(\.|$)/i;
  class SourceBufferList extends Array {
    static get [Symbol.species]() { return Array; }
    item(i) { return this[i] || null; }
  }
  let nextSourceBufferId = 0;
  class SourceBuffer {
    constructor(ms, type) {
      this._ms = ms;
      this._type = type;
      this._id = ++nextSourceBufferId;
      this._ranges = [];
      this._times = new SegmentTimes(type);
      this._removed = false;
      this.updating = false;
      this.mode = /audio\/(mpeg|aac)/i.test(type) ? 'sequence' : 'segments';
      this.timestampOffset = 0;
      this.appendWindowStart = 0;
      this.appendWindowEnd = Infinity;
      this.audioTracks = [];
      this.videoTracks = [];
      this.textTracks = [];
      this.onupdatestart = null; this.onupdate = null; this.onupdateend = null;
      this.onerror = null; this.onabort = null;
    }
    get buffered() {
      if (this._removed) throw new DOMException('This SourceBuffer has been removed from the parent media source.', 'InvalidStateError');
      return new TimeRanges(this._ranges.map((r) => r.slice()));
    }
    _check(what) {
      if (this._removed) throw new DOMException(`Failed to execute '${what}' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.`, 'InvalidStateError');
      if (this.updating) throw new DOMException(`Failed to execute '${what}' on 'SourceBuffer': This SourceBuffer is still processing an 'appendBuffer' or 'remove' operation.`, 'InvalidStateError');
    }
    _finish() {
      later(() => {
        if (!this.updating) return;
        this.updating = false;
        fire(this, 'update');
        fire(this, 'updateend');
      });
    }
    appendBuffer(data) {
      this._check('appendBuffer');
      const bytes = bytesOf(data);
      if (this._ms._readyState === 'ended') this._ms._reopen();
      this.updating = true;
      fire(this, 'updatestart');
      let ranges = this._times.feed(bytes, this.timestampOffset);
      if (this.mode === 'sequence' && ranges.length) {
        // Sequence mode lays segments end to end after what is buffered.
        const end = this._ranges.length ? this._ranges[this._ranges.length - 1][1] : 0;
        const shift = end - ranges[0][0];
        ranges = ranges.map(([a, b]) => [a + shift, b + shift]);
        this.timestampOffset += shift;
      }
      this._ranges = mergeRanges(this._ranges.concat(ranges));
      sendMse(this._ms._el, 'mse-append', { sb: this._id, data: toBase64(bytes) });
      this._finish();
    }
    abort() {
      if (this._removed) throw new DOMException("Failed to execute 'abort' on 'SourceBuffer': This SourceBuffer has been removed from the parent media source.", 'InvalidStateError');
      this._times.reset();
      if (this.updating) {
        this.updating = false;
        fire(this, 'abort');
        fire(this, 'updateend');
      }
      sendMse(this._ms._el, 'mse-abort', { sb: this._id });
    }
    remove(start, end) {
      this._check('remove');
      const s = Number(start), e = Number(end);
      if (!(s >= 0) || !(e > s)) throw new TypeError("Failed to execute 'remove' on 'SourceBuffer': The start or end value is invalid.");
      this.updating = true;
      fire(this, 'updatestart');
      this._ranges = subtractRange(this._ranges, s, e);
      sendMse(this._ms._el, 'mse-remove', { sb: this._id, start: s, end: e });
      this._finish();
    }
    changeType(type) {
      this._check('changeType');
      this._type = String(type);
      this._times = new SegmentTimes(this._type);
    }
  }
  class MediaSource {
    constructor() {
      this._readyState = 'closed';
      this._duration = NaN;
      this._el = null;
      this._url = null;
      this.sourceBuffers = new SourceBufferList();
      this.activeSourceBuffers = new SourceBufferList();
      this.onsourceopen = null; this.onsourceended = null; this.onsourceclose = null;
    }
    static isTypeSupported(type) {
      if (!hasWindow()) return false;
      const t = String(type).trim();
      const m = /^(video|audio)\/(mp4|webm)\s*(;|$)/i.exec(t);
      if (!m) return false;
      const codecs = /codecs\s*=\s*"?([^";]*)"?/i.exec(t);
      if (!codecs) return true;
      return codecs[1].split(',').map((c) => c.trim()).every((c) => SUPPORTED_CODEC.test(c));
    }
    static get canConstructInDedicatedWorker() { return false; }
    get readyState() { return this._readyState; }
    get duration() { return this._readyState === 'closed' ? NaN : this._duration; }
    set duration(v) {
      const n = Number(v);
      if (Number.isNaN(n) || n < 0) throw new TypeError("Failed to set the 'duration' property on 'MediaSource': The value provided is invalid.");
      if (this._readyState !== 'open') throw new DOMException("Failed to set the 'duration' property on 'MediaSource': The MediaSource's readyState is not 'open'.", 'InvalidStateError');
      if (n === this._duration) return;
      this._duration = n;
      if (this._el) this._el.__fire('durationchange');
    }
    addSourceBuffer(type) {
      type = String(type);
      if (!MediaSource.isTypeSupported(type)) throw new DOMException(`Failed to execute 'addSourceBuffer' on 'MediaSource': The type provided ('${type}') is unsupported.`, 'NotSupportedError');
      if (this._readyState !== 'open') throw new DOMException("Failed to execute 'addSourceBuffer' on 'MediaSource': The MediaSource's readyState is not 'open'.", 'InvalidStateError');
      const sb = new SourceBuffer(this, type);
      this.sourceBuffers.push(sb);
      this.activeSourceBuffers.push(sb);
      sendMse(this._el, 'mse-add', { sb: sb._id, mime: type });
      return sb;
    }
    removeSourceBuffer(sb) {
      const i = this.sourceBuffers.indexOf(sb);
      if (i < 0) throw new DOMException("Failed to execute 'removeSourceBuffer' on 'MediaSource': The SourceBuffer provided is not contained in this MediaSource.", 'NotFoundError');
      if (sb.updating) sb.abort();
      sb._removed = true;
      this.sourceBuffers.splice(i, 1);
      const j = this.activeSourceBuffers.indexOf(sb);
      if (j >= 0) this.activeSourceBuffers.splice(j, 1);
    }
    endOfStream(error) {
      if (this._readyState !== 'open') throw new DOMException("Failed to execute 'endOfStream' on 'MediaSource': The MediaSource's readyState is not 'open'.", 'InvalidStateError');
      if (this.sourceBuffers.some((sb) => sb.updating)) throw new DOMException("Failed to execute 'endOfStream' on 'MediaSource': The 'updating' attribute is true on one or more of this MediaSource's SourceBuffers.", 'InvalidStateError');
      this._readyState = 'ended';
      if (!error) {
        const end = Math.max(0, ...this.sourceBuffers.map((sb) => sb._ranges.length ? sb._ranges[sb._ranges.length - 1][1] : 0));
        if (!(this._duration >= end) || Number.isNaN(this._duration)) {
          this._duration = end;
          if (this._el) this._el.__fire('durationchange');
        }
        sendMse(this._el, 'mse-end');
      }
      fire(this, 'sourceended');
    }
    setLiveSeekableRange() {}
    clearLiveSeekableRange() {}
    _reopen() { this._readyState = 'open'; fire(this, 'sourceopen'); }
    _attach(el) {
      this._el = el;
      this._readyState = 'open';
      el.__send('mse-open');
      later(() => { if (this._el === el) fire(this, 'sourceopen'); });
    }
    _detach() {
      if (!this._el) return;
      this._el = null;
      this._readyState = 'closed';
      for (const sb of this.sourceBuffers) sb._removed = true;
      this.sourceBuffers.length = 0;
      this.activeSourceBuffers.length = 0;
      later(() => fire(this, 'sourceclose'));
    }
  }
  globalThis.MediaSource = MediaSource;
  globalThis.SourceBuffer = SourceBuffer;
  globalThis.SourceBufferList = SourceBufferList;
  globalThis.TimeRanges = TimeRanges;

  // blob: URLs for a MediaSource, and attaching it through src or srcObject.
  const mseUrls = new Map();
  const baseCreate = URL.createObjectURL;
  const baseRevoke = URL.revokeObjectURL;
  URL.createObjectURL = function (obj) {
    if (obj instanceof MediaSource) {
      let origin = 'null';
      try { origin = new URL(location.href).origin || 'null'; } catch (_e) {}
      const uuid = typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : Array.from(crypto.getRandomValues(new Uint8Array(16)), (x) => x.toString(16).padStart(2, '0')).join('')
          .replace(/^(.{8})(.{4}).(.{3}).(.{3})(.{12})$/, '$1-$2-4$3-a$4-$5');
      const url = 'blob:' + origin + '/' + uuid;
      mseUrls.set(url, obj);
      obj._url = url;
      return url;
    }
    return baseCreate.apply(this, arguments);
  };
  URL.revokeObjectURL = function (url) {
    mseUrls.delete(String(url));
    return baseRevoke.apply(this, arguments);
  };
  const proto = HTMLMediaElement.prototype;
  const srcDesc = Object.getOwnPropertyDescriptor(proto, 'src');
  const durDesc = Object.getOwnPropertyDescriptor(proto, 'duration');
  const attachFor = (el, value) => {
    const ms = mseUrls.get(String(value)) || null;
    if (el.__mse && el.__mse !== ms) { el.__mse._detach(); el.__mse = null; }
    if (ms && el.__mse !== ms) {
      if (ms._el && ms._el !== el) ms._detach();
      el.__mse = ms;
      ms._attach(el);
    }
  };
  Object.defineProperty(proto, 'src', {
    get: srcDesc.get,
    set(v) { srcDesc.set.call(this, v); attachFor(this, v); },
    configurable: true,
  });
  Object.defineProperty(proto, 'srcObject', {
    get() { return this.__srcObject || null; },
    set(v) {
      this.__srcObject = v || null;
      if (v instanceof MediaSource) this.src = v._url || URL.createObjectURL(v);
      else if (v == null && this.__mse) { this.__mse._detach(); this.__mse = null; this.removeAttribute('src'); }
    },
    configurable: true,
  });
  const baseSetAttribute = proto.setAttribute;
  proto.setAttribute = function (name, value) {
    const r = baseSetAttribute.call(this, name, value);
    if (String(name).toLowerCase() === 'src') attachFor(this, value);
    return r;
  };
  Object.defineProperty(proto, 'duration', {
    get() { return this.__mse ? this.__mse._duration : durDesc.get.call(this); },
    configurable: true,
  });
  Object.defineProperty(proto, 'buffered', {
    get() {
      if (this.__mse) {
        const lists = this.__mse.activeSourceBuffers.map((sb) => sb._ranges);
        if (!lists.length) return new TimeRanges([]);
        return new TimeRanges(lists.slice(1).reduce(intersectRanges, mergeRanges(lists[0])));
      }
      const d = this.duration;
      return new TimeRanges(this.readyState >= 1 && Number.isFinite(d) ? [[0, d]] : []);
    },
    configurable: true,
  });
  Object.defineProperty(proto, 'seekable', {
    get() {
      const d = this.duration;
      return new TimeRanges(Number.isFinite(d) && d > 0 ? [[0, d]] : []);
    },
    configurable: true,
  });
})();
