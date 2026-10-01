var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
  get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
}) : x)(function(x) {
  if (typeof require !== "undefined") return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) => function __require2() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/gif.js/dist/gif.js
var require_gif = __commonJS({
  "node_modules/gif.js/dist/gif.js"(exports, module) {
    (function(f) {
      if (typeof exports === "object" && typeof module !== "undefined") {
        module.exports = f();
      } else if (typeof define === "function" && define.amd) {
        define([], f);
      } else {
        var g;
        if (typeof window !== "undefined") {
          g = window;
        } else if (typeof global !== "undefined") {
          g = global;
        } else if (typeof self !== "undefined") {
          g = self;
        } else {
          g = this;
        }
        g.GIF = f();
      }
    })(function() {
      var define2, module2, exports2;
      return (function e(t, n, r) {
        function s(o2, u) {
          if (!n[o2]) {
            if (!t[o2]) {
              var a = typeof __require == "function" && __require;
              if (!u && a) return a(o2, true);
              if (i) return i(o2, true);
              var f = new Error("Cannot find module '" + o2 + "'");
              throw f.code = "MODULE_NOT_FOUND", f;
            }
            var l = n[o2] = { exports: {} };
            t[o2][0].call(l.exports, function(e2) {
              var n2 = t[o2][1][e2];
              return s(n2 ? n2 : e2);
            }, l, l.exports, e, t, n, r);
          }
          return n[o2].exports;
        }
        var i = typeof __require == "function" && __require;
        for (var o = 0; o < r.length; o++) s(r[o]);
        return s;
      })({ 1: [function(require2, module3, exports3) {
        function EventEmitter() {
          this._events = this._events || {};
          this._maxListeners = this._maxListeners || void 0;
        }
        module3.exports = EventEmitter;
        EventEmitter.EventEmitter = EventEmitter;
        EventEmitter.prototype._events = void 0;
        EventEmitter.prototype._maxListeners = void 0;
        EventEmitter.defaultMaxListeners = 10;
        EventEmitter.prototype.setMaxListeners = function(n) {
          if (!isNumber(n) || n < 0 || isNaN(n)) throw TypeError("n must be a positive number");
          this._maxListeners = n;
          return this;
        };
        EventEmitter.prototype.emit = function(type) {
          var er, handler, len, args, i, listeners;
          if (!this._events) this._events = {};
          if (type === "error") {
            if (!this._events.error || isObject(this._events.error) && !this._events.error.length) {
              er = arguments[1];
              if (er instanceof Error) {
                throw er;
              } else {
                var err = new Error('Uncaught, unspecified "error" event. (' + er + ")");
                err.context = er;
                throw err;
              }
            }
          }
          handler = this._events[type];
          if (isUndefined(handler)) return false;
          if (isFunction(handler)) {
            switch (arguments.length) {
              case 1:
                handler.call(this);
                break;
              case 2:
                handler.call(this, arguments[1]);
                break;
              case 3:
                handler.call(this, arguments[1], arguments[2]);
                break;
              default:
                args = Array.prototype.slice.call(arguments, 1);
                handler.apply(this, args);
            }
          } else if (isObject(handler)) {
            args = Array.prototype.slice.call(arguments, 1);
            listeners = handler.slice();
            len = listeners.length;
            for (i = 0; i < len; i++) listeners[i].apply(this, args);
          }
          return true;
        };
        EventEmitter.prototype.addListener = function(type, listener) {
          var m;
          if (!isFunction(listener)) throw TypeError("listener must be a function");
          if (!this._events) this._events = {};
          if (this._events.newListener) this.emit("newListener", type, isFunction(listener.listener) ? listener.listener : listener);
          if (!this._events[type]) this._events[type] = listener;
          else if (isObject(this._events[type])) this._events[type].push(listener);
          else this._events[type] = [this._events[type], listener];
          if (isObject(this._events[type]) && !this._events[type].warned) {
            if (!isUndefined(this._maxListeners)) {
              m = this._maxListeners;
            } else {
              m = EventEmitter.defaultMaxListeners;
            }
            if (m && m > 0 && this._events[type].length > m) {
              this._events[type].warned = true;
              console.error("(node) warning: possible EventEmitter memory leak detected. %d listeners added. Use emitter.setMaxListeners() to increase limit.", this._events[type].length);
              if (typeof console.trace === "function") {
                console.trace();
              }
            }
          }
          return this;
        };
        EventEmitter.prototype.on = EventEmitter.prototype.addListener;
        EventEmitter.prototype.once = function(type, listener) {
          if (!isFunction(listener)) throw TypeError("listener must be a function");
          var fired = false;
          function g() {
            this.removeListener(type, g);
            if (!fired) {
              fired = true;
              listener.apply(this, arguments);
            }
          }
          g.listener = listener;
          this.on(type, g);
          return this;
        };
        EventEmitter.prototype.removeListener = function(type, listener) {
          var list, position, length, i;
          if (!isFunction(listener)) throw TypeError("listener must be a function");
          if (!this._events || !this._events[type]) return this;
          list = this._events[type];
          length = list.length;
          position = -1;
          if (list === listener || isFunction(list.listener) && list.listener === listener) {
            delete this._events[type];
            if (this._events.removeListener) this.emit("removeListener", type, listener);
          } else if (isObject(list)) {
            for (i = length; i-- > 0; ) {
              if (list[i] === listener || list[i].listener && list[i].listener === listener) {
                position = i;
                break;
              }
            }
            if (position < 0) return this;
            if (list.length === 1) {
              list.length = 0;
              delete this._events[type];
            } else {
              list.splice(position, 1);
            }
            if (this._events.removeListener) this.emit("removeListener", type, listener);
          }
          return this;
        };
        EventEmitter.prototype.removeAllListeners = function(type) {
          var key, listeners;
          if (!this._events) return this;
          if (!this._events.removeListener) {
            if (arguments.length === 0) this._events = {};
            else if (this._events[type]) delete this._events[type];
            return this;
          }
          if (arguments.length === 0) {
            for (key in this._events) {
              if (key === "removeListener") continue;
              this.removeAllListeners(key);
            }
            this.removeAllListeners("removeListener");
            this._events = {};
            return this;
          }
          listeners = this._events[type];
          if (isFunction(listeners)) {
            this.removeListener(type, listeners);
          } else if (listeners) {
            while (listeners.length) this.removeListener(type, listeners[listeners.length - 1]);
          }
          delete this._events[type];
          return this;
        };
        EventEmitter.prototype.listeners = function(type) {
          var ret;
          if (!this._events || !this._events[type]) ret = [];
          else if (isFunction(this._events[type])) ret = [this._events[type]];
          else ret = this._events[type].slice();
          return ret;
        };
        EventEmitter.prototype.listenerCount = function(type) {
          if (this._events) {
            var evlistener = this._events[type];
            if (isFunction(evlistener)) return 1;
            else if (evlistener) return evlistener.length;
          }
          return 0;
        };
        EventEmitter.listenerCount = function(emitter, type) {
          return emitter.listenerCount(type);
        };
        function isFunction(arg) {
          return typeof arg === "function";
        }
        function isNumber(arg) {
          return typeof arg === "number";
        }
        function isObject(arg) {
          return typeof arg === "object" && arg !== null;
        }
        function isUndefined(arg) {
          return arg === void 0;
        }
      }, {}], 2: [function(require2, module3, exports3) {
        var UA, browser, mode, platform, ua;
        ua = navigator.userAgent.toLowerCase();
        platform = navigator.platform.toLowerCase();
        UA = ua.match(/(opera|ie|firefox|chrome|version)[\s\/:]([\w\d\.]+)?.*?(safari|version[\s\/:]([\w\d\.]+)|$)/) || [null, "unknown", 0];
        mode = UA[1] === "ie" && document.documentMode;
        browser = { name: UA[1] === "version" ? UA[3] : UA[1], version: mode || parseFloat(UA[1] === "opera" && UA[4] ? UA[4] : UA[2]), platform: { name: ua.match(/ip(?:ad|od|hone)/) ? "ios" : (ua.match(/(?:webos|android)/) || platform.match(/mac|win|linux/) || ["other"])[0] } };
        browser[browser.name] = true;
        browser[browser.name + parseInt(browser.version, 10)] = true;
        browser.platform[browser.platform.name] = true;
        module3.exports = browser;
      }, {}], 3: [function(require2, module3, exports3) {
        var EventEmitter, GIF, browser, extend = function(child, parent) {
          for (var key in parent) {
            if (hasProp.call(parent, key)) child[key] = parent[key];
          }
          function ctor() {
            this.constructor = child;
          }
          ctor.prototype = parent.prototype;
          child.prototype = new ctor();
          child.__super__ = parent.prototype;
          return child;
        }, hasProp = {}.hasOwnProperty, indexOf = [].indexOf || function(item) {
          for (var i = 0, l = this.length; i < l; i++) {
            if (i in this && this[i] === item) return i;
          }
          return -1;
        }, slice = [].slice;
        EventEmitter = require2("events").EventEmitter;
        browser = require2("./browser.coffee");
        GIF = (function(superClass) {
          var defaults, frameDefaults;
          extend(GIF2, superClass);
          defaults = { workerScript: "gif.worker.js", workers: 2, repeat: 0, background: "#fff", quality: 10, width: null, height: null, transparent: null, debug: false, dither: false };
          frameDefaults = { delay: 500, copy: false };
          function GIF2(options) {
            var base, key, value;
            this.running = false;
            this.options = {};
            this.frames = [];
            this.freeWorkers = [];
            this.activeWorkers = [];
            this.setOptions(options);
            for (key in defaults) {
              value = defaults[key];
              if ((base = this.options)[key] == null) {
                base[key] = value;
              }
            }
          }
          GIF2.prototype.setOption = function(key, value) {
            this.options[key] = value;
            if (this._canvas != null && (key === "width" || key === "height")) {
              return this._canvas[key] = value;
            }
          };
          GIF2.prototype.setOptions = function(options) {
            var key, results, value;
            results = [];
            for (key in options) {
              if (!hasProp.call(options, key)) continue;
              value = options[key];
              results.push(this.setOption(key, value));
            }
            return results;
          };
          GIF2.prototype.addFrame = function(image, options) {
            var frame, key;
            if (options == null) {
              options = {};
            }
            frame = {};
            frame.transparent = this.options.transparent;
            for (key in frameDefaults) {
              frame[key] = options[key] || frameDefaults[key];
            }
            if (this.options.width == null) {
              this.setOption("width", image.width);
            }
            if (this.options.height == null) {
              this.setOption("height", image.height);
            }
            if (typeof ImageData !== "undefined" && ImageData !== null && image instanceof ImageData) {
              frame.data = image.data;
            } else if (typeof CanvasRenderingContext2D !== "undefined" && CanvasRenderingContext2D !== null && image instanceof CanvasRenderingContext2D || typeof WebGLRenderingContext !== "undefined" && WebGLRenderingContext !== null && image instanceof WebGLRenderingContext) {
              if (options.copy) {
                frame.data = this.getContextData(image);
              } else {
                frame.context = image;
              }
            } else if (image.childNodes != null) {
              if (options.copy) {
                frame.data = this.getImageData(image);
              } else {
                frame.image = image;
              }
            } else {
              throw new Error("Invalid image");
            }
            return this.frames.push(frame);
          };
          GIF2.prototype.render = function() {
            var i, j, numWorkers, ref;
            if (this.running) {
              throw new Error("Already running");
            }
            if (this.options.width == null || this.options.height == null) {
              throw new Error("Width and height must be set prior to rendering");
            }
            this.running = true;
            this.nextFrame = 0;
            this.finishedFrames = 0;
            this.imageParts = function() {
              var j2, ref2, results;
              results = [];
              for (i = j2 = 0, ref2 = this.frames.length; 0 <= ref2 ? j2 < ref2 : j2 > ref2; i = 0 <= ref2 ? ++j2 : --j2) {
                results.push(null);
              }
              return results;
            }.call(this);
            numWorkers = this.spawnWorkers();
            if (this.options.globalPalette === true) {
              this.renderNextFrame();
            } else {
              for (i = j = 0, ref = numWorkers; 0 <= ref ? j < ref : j > ref; i = 0 <= ref ? ++j : --j) {
                this.renderNextFrame();
              }
            }
            this.emit("start");
            return this.emit("progress", 0);
          };
          GIF2.prototype.abort = function() {
            var worker;
            while (true) {
              worker = this.activeWorkers.shift();
              if (worker == null) {
                break;
              }
              this.log("killing active worker");
              worker.terminate();
            }
            this.running = false;
            return this.emit("abort");
          };
          GIF2.prototype.spawnWorkers = function() {
            var j, numWorkers, ref, results;
            numWorkers = Math.min(this.options.workers, this.frames.length);
            (function() {
              results = [];
              for (var j2 = ref = this.freeWorkers.length; ref <= numWorkers ? j2 < numWorkers : j2 > numWorkers; ref <= numWorkers ? j2++ : j2--) {
                results.push(j2);
              }
              return results;
            }).apply(this).forEach(/* @__PURE__ */ (function(_this) {
              return function(i) {
                var worker;
                _this.log("spawning worker " + i);
                worker = new Worker(_this.options.workerScript);
                worker.onmessage = function(event) {
                  _this.activeWorkers.splice(_this.activeWorkers.indexOf(worker), 1);
                  _this.freeWorkers.push(worker);
                  return _this.frameFinished(event.data);
                };
                return _this.freeWorkers.push(worker);
              };
            })(this));
            return numWorkers;
          };
          GIF2.prototype.frameFinished = function(frame) {
            var i, j, ref;
            this.log("frame " + frame.index + " finished - " + this.activeWorkers.length + " active");
            this.finishedFrames++;
            this.emit("progress", this.finishedFrames / this.frames.length);
            this.imageParts[frame.index] = frame;
            if (this.options.globalPalette === true) {
              this.options.globalPalette = frame.globalPalette;
              this.log("global palette analyzed");
              if (this.frames.length > 2) {
                for (i = j = 1, ref = this.freeWorkers.length; 1 <= ref ? j < ref : j > ref; i = 1 <= ref ? ++j : --j) {
                  this.renderNextFrame();
                }
              }
            }
            if (indexOf.call(this.imageParts, null) >= 0) {
              return this.renderNextFrame();
            } else {
              return this.finishRendering();
            }
          };
          GIF2.prototype.finishRendering = function() {
            var data, frame, i, image, j, k, l, len, len1, len2, len3, offset, page, ref, ref1, ref2;
            len = 0;
            ref = this.imageParts;
            for (j = 0, len1 = ref.length; j < len1; j++) {
              frame = ref[j];
              len += (frame.data.length - 1) * frame.pageSize + frame.cursor;
            }
            len += frame.pageSize - frame.cursor;
            this.log("rendering finished - filesize " + Math.round(len / 1e3) + "kb");
            data = new Uint8Array(len);
            offset = 0;
            ref1 = this.imageParts;
            for (k = 0, len2 = ref1.length; k < len2; k++) {
              frame = ref1[k];
              ref2 = frame.data;
              for (i = l = 0, len3 = ref2.length; l < len3; i = ++l) {
                page = ref2[i];
                data.set(page, offset);
                if (i === frame.data.length - 1) {
                  offset += frame.cursor;
                } else {
                  offset += frame.pageSize;
                }
              }
            }
            image = new Blob([data], { type: "image/gif" });
            return this.emit("finished", image, data);
          };
          GIF2.prototype.renderNextFrame = function() {
            var frame, task, worker;
            if (this.freeWorkers.length === 0) {
              throw new Error("No free workers");
            }
            if (this.nextFrame >= this.frames.length) {
              return;
            }
            frame = this.frames[this.nextFrame++];
            worker = this.freeWorkers.shift();
            task = this.getTask(frame);
            this.log("starting frame " + (task.index + 1) + " of " + this.frames.length);
            this.activeWorkers.push(worker);
            return worker.postMessage(task);
          };
          GIF2.prototype.getContextData = function(ctx) {
            return ctx.getImageData(0, 0, this.options.width, this.options.height).data;
          };
          GIF2.prototype.getImageData = function(image) {
            var ctx;
            if (this._canvas == null) {
              this._canvas = document.createElement("canvas");
              this._canvas.width = this.options.width;
              this._canvas.height = this.options.height;
            }
            ctx = this._canvas.getContext("2d");
            ctx.setFill = this.options.background;
            ctx.fillRect(0, 0, this.options.width, this.options.height);
            ctx.drawImage(image, 0, 0);
            return this.getContextData(ctx);
          };
          GIF2.prototype.getTask = function(frame) {
            var index, task;
            index = this.frames.indexOf(frame);
            task = { index, last: index === this.frames.length - 1, delay: frame.delay, transparent: frame.transparent, width: this.options.width, height: this.options.height, quality: this.options.quality, dither: this.options.dither, globalPalette: this.options.globalPalette, repeat: this.options.repeat, canTransfer: browser.name === "chrome" };
            if (frame.data != null) {
              task.data = frame.data;
            } else if (frame.context != null) {
              task.data = this.getContextData(frame.context);
            } else if (frame.image != null) {
              task.data = this.getImageData(frame.image);
            } else {
              throw new Error("Invalid frame");
            }
            return task;
          };
          GIF2.prototype.log = function() {
            var args;
            args = 1 <= arguments.length ? slice.call(arguments, 0) : [];
            if (!this.options.debug) {
              return;
            }
            return console.log.apply(console, args);
          };
          return GIF2;
        })(EventEmitter);
        module3.exports = GIF;
      }, { "./browser.coffee": 2, events: 1 }] }, {}, [3])(3);
    });
  }
});

// src/media/constants.js
var SERVICE_WORKER_KEEPALIVE_INTERVAL_MS = 2e4;
var MESSAGE_OFFSCREEN_PLAY_SOUND = "OFFSCREEN_PLAY_SOUND";
var MESSAGE_REVOKE_BLOB_URL = "REVOKE_BLOB_URL";
var MESSAGE_GENERATE_GIF = "GENERATE_GIF";
var MESSAGE_SERVICE_WORKER_KEEPALIVE = "SW_KEEPALIVE";
var DEFAULT_NOTIFICATION_SOUND_VOLUME = 0.5;
var DEFAULT_GIF_FRAME_DELAY_MS = 800;
var GIF_LAST_FRAME_EXTRA_DELAY_MS = 2e3;
var DEFAULT_GIF_ENCODER_QUALITY = 10;
var GIF_ENCODER_WORKER_COUNT = 2;
var GIF_WORKER_SCRIPT_PATH = "gif.worker.js";

// src/vendor/gif.js
var import_gif = __toESM(require_gif(), 1);

// src/media/dependencies.js
function createMediaDependencies(overrides = {}) {
  const missing = (name) => () => {
    throw new Error(`Media dependency not injected: ${name}`);
  };
  const windowApi = overrides.windowApi || globalThis;
  const documentApi = overrides.documentApi || globalThis.document;
  return {
    chromeApi: overrides.chromeApi || globalThis.chrome,
    windowApi,
    documentApi,
    fetchImpl: overrides.fetchImpl || (typeof globalThis.fetch === "function" ? globalThis.fetch.bind(globalThis) : missing("fetchImpl")),
    UrlCtor: overrides.UrlCtor || globalThis.URL,
    FileReaderCtor: overrides.FileReaderCtor || globalThis.FileReader,
    ImageCtor: overrides.ImageCtor || globalThis.Image,
    Path2DCtor: overrides.Path2DCtor || globalThis.Path2D,
    BlobCtor: overrides.BlobCtor || globalThis.Blob,
    Uint8ArrayCtor: overrides.Uint8ArrayCtor || globalThis.Uint8Array,
    atobFn: overrides.atobFn || globalThis.atob.bind(globalThis),
    createGifEncoder: overrides.createGifEncoder || ((options) => {
      const GifCtor = import_gif.default || /** @type {any} */
      globalThis.GIF;
      if (typeof GifCtor !== "function") {
        throw new Error(
          "Media dependency not injected: createGifEncoder (gif.js missing)"
        );
      }
      return new GifCtor(options);
    }),
    log: overrides.log || console.log.bind(console),
    logError: overrides.logError || console.error.bind(console),
    now: overrides.now || (() => Date.now())
  };
}

// src/media/audio-playback.js
function createAudioPlayback(deps) {
  let lazyAudioContext = null;
  function getOrCreateAudioContext() {
    if (!lazyAudioContext) {
      const AudioContextCtor = deps.windowApi.AudioContext || deps.windowApi.webkitAudioContext;
      lazyAudioContext = new AudioContextCtor();
      deps.log(
        "[Offscreen] AudioContext created, state:",
        lazyAudioContext.state
      );
    }
    return lazyAudioContext;
  }
  async function playNotificationSound(audioUrl, volume) {
    const audioContext = getOrCreateAudioContext();
    try {
      deps.log("[Offscreen] Fetching audio file:", audioUrl);
      const response = await deps.fetchImpl(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      deps.log("[Offscreen] Audio file fetched, decoding...");
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      deps.log("[Offscreen] Audio decoded, creating source...");
      const bufferSource = audioContext.createBufferSource();
      bufferSource.buffer = audioBuffer;
      const gainNode = audioContext.createGain();
      gainNode.gain.value = volume;
      bufferSource.connect(gainNode);
      gainNode.connect(audioContext.destination);
      if (audioContext.state === "suspended") {
        deps.log("[Offscreen] Resuming AudioContext...");
        await audioContext.resume();
      }
      deps.log("[Offscreen] Starting playback...");
      bufferSource.start(0);
      return new Promise((resolve, reject) => {
        bufferSource.onended = () => {
          deps.log("[Offscreen] Playback finished");
          resolve();
        };
        bufferSource.onerror = (error) => {
          deps.logError("[Offscreen] Source error:", error);
          reject(error);
        };
      });
    } catch (error) {
      deps.logError("[Offscreen] Web Audio API error:", error);
      throw error;
    }
  }
  return {
    getOrCreateAudioContext,
    playNotificationSound,
    /** @returns {AudioContext|null} */
    getLazyAudioContext: () => lazyAudioContext
  };
}

// src/media/gif-overlays.js
var REDROB_LOGO_PATH_DATA = "M189.531 430.72L288.951 374.971L290.59 370.088L288.951 367.369H284.035L267.374 366.355L210.562 364.835L161.399 362.807L113.6 360.273L101.583 357.739L90.3843 342.788L91.4768 335.439L101.583 328.597L116.059 329.864L148.015 332.145L196.086 335.439L230.774 337.467L282.396 342.788H290.59L291.682 339.494L288.951 337.467L286.766 335.439L237.056 301.736L183.249 266.259L155.117 245.733L140.094 235.344L132.447 225.714L129.169 204.428L142.826 189.223L161.399 190.491L166.042 191.758L184.888 206.202L225.038 237.371L277.48 275.889L285.127 282.224L288.207 280.145L288.678 278.676L285.127 272.848L256.722 221.406L226.404 168.951L212.747 147.158L209.197 134.234C207.821 128.811 207.012 124.324 207.012 118.776L222.58 97.4901L231.32 94.7026L252.351 97.4901L261.092 105.092L274.202 134.994L295.233 181.875L328.009 245.733L337.569 264.739L342.758 282.224L344.67 287.545H347.948V284.505L350.679 248.521L355.595 204.428L360.512 147.665L362.15 131.7L370.071 112.441L385.913 102.051L398.204 107.88L408.31 122.324L406.944 131.7L400.935 170.725L389.19 231.796L381.543 272.848H385.913L391.102 267.526L411.86 240.158L446.548 196.572L461.843 179.341L479.87 160.335L491.342 151.212H513.192L529.034 175.033L521.932 199.613L499.536 227.995L480.963 252.068L454.332 287.747L437.808 316.434L439.29 318.8L443.271 318.461L503.359 305.537L535.862 299.709L574.647 293.12L592.127 301.229L594.039 309.592L587.211 326.57L545.695 336.706L497.077 346.589L424.68 363.632L423.878 364.277L424.824 365.68L457.473 368.636L471.403 369.396H505.545L569.184 374.211L585.845 385.107L595.678 398.538L594.039 408.927L568.365 421.851L533.95 413.742L453.376 394.483L425.79 387.641H421.966V389.922L444.909 412.475L487.245 450.486L539.959 499.647L542.69 511.811L535.862 521.44L528.761 520.427L482.328 485.456L464.302 469.745L423.878 435.535H421.147V439.083L430.433 452.767L479.87 527.015L482.328 549.822L478.778 557.171L465.94 561.732L452.011 559.198L422.786 518.399L393.014 472.786L368.979 431.734L366.076 433.567L351.771 586.312L345.216 594.168L329.921 599.996L317.084 590.367L310.255 574.656L317.084 543.487L325.278 502.941L331.833 470.759L337.842 430.72L341.511 417.345L341.187 416.45L338.255 416.943L308.07 458.342L262.184 520.427L225.858 559.198L217.117 562.746L202.095 554.89L203.461 540.953L211.928 528.536L262.184 464.677L292.502 424.892L312.042 402.055L311.851 398.751L310.773 398.659L177.24 485.71L153.478 488.751L143.099 479.121L144.464 463.41L149.381 458.342L189.531 430.72Z";
function createGifOverlays(deps) {
  function drawClickIndicator(ctx, xCoordinate, yCoordinate, scaleFactor = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(xCoordinate, yCoordinate, 15 * scaleFactor, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(207, 107, 60, 0.3)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xCoordinate, yCoordinate, 11 * scaleFactor, 0, 2 * Math.PI);
    ctx.fillStyle = "rgba(207, 107, 60, 0.5)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(xCoordinate, yCoordinate, 11 * scaleFactor, 0, 2 * Math.PI);
    ctx.strokeStyle = "rgba(207, 107, 60, 1)";
    ctx.lineWidth = 2 * scaleFactor;
    ctx.stroke();
    ctx.restore();
  }
  function drawDragPath(ctx, startX, startY, endX, endY, scaleFactor = 1) {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 3 * scaleFactor;
    ctx.stroke();
    const angle = Math.atan2(endY - startY, endX - startX);
    const arrowLength = 15 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowLength * Math.cos(angle - Math.PI / 6),
      endY - arrowLength * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      endX - arrowLength * Math.cos(angle + Math.PI / 6),
      endY - arrowLength * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fillStyle = "#dc2626";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(startX, startY, 6 * scaleFactor, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#cf6b3c";
    ctx.lineWidth = 2 * scaleFactor;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(endX, endY, 6 * scaleFactor, 0, 2 * Math.PI);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "#dc2626";
    ctx.lineWidth = 2 * scaleFactor;
    ctx.stroke();
    ctx.restore();
  }
  function drawActionLabel(ctx, text, xCoordinate, yCoordinate, scaleFactor = 1) {
    ctx.save();
    const fontSize = 14 * scaleFactor;
    ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const metrics = ctx.measureText(text);
    const textWidth = metrics.width;
    const textHeight = 20 * scaleFactor;
    const padding = 8 * scaleFactor;
    let labelX = xCoordinate + 20 * scaleFactor;
    let labelY = yCoordinate - 10 * scaleFactor;
    if (labelX + textWidth + padding * 2 > ctx.canvas.width) {
      labelX = xCoordinate - textWidth - padding * 2 - 20 * scaleFactor;
    }
    if (labelY < 0) {
      labelY = yCoordinate + 20 * scaleFactor;
    }
    const backgroundX = labelX;
    const backgroundY = labelY;
    const backgroundWidth = textWidth + padding * 2;
    const backgroundHeight = textHeight + padding;
    const cornerRadius = 6 * scaleFactor;
    ctx.beginPath();
    ctx.moveTo(backgroundX + cornerRadius, backgroundY);
    ctx.lineTo(backgroundX + backgroundWidth - cornerRadius, backgroundY);
    ctx.quadraticCurveTo(
      backgroundX + backgroundWidth,
      backgroundY,
      backgroundX + backgroundWidth,
      backgroundY + cornerRadius
    );
    ctx.lineTo(
      backgroundX + backgroundWidth,
      backgroundY + backgroundHeight - cornerRadius
    );
    ctx.quadraticCurveTo(
      backgroundX + backgroundWidth,
      backgroundY + backgroundHeight,
      backgroundX + backgroundWidth - cornerRadius,
      backgroundY + backgroundHeight
    );
    ctx.lineTo(backgroundX + cornerRadius, backgroundY + backgroundHeight);
    ctx.quadraticCurveTo(
      backgroundX,
      backgroundY + backgroundHeight,
      backgroundX,
      backgroundY + backgroundHeight - cornerRadius
    );
    ctx.lineTo(backgroundX, backgroundY + cornerRadius);
    ctx.quadraticCurveTo(
      backgroundX,
      backgroundY,
      backgroundX + cornerRadius,
      backgroundY
    );
    ctx.closePath();
    ctx.shadowColor = "rgba(0, 0, 0, 0.3)";
    ctx.shadowBlur = 4 * scaleFactor;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2 * scaleFactor;
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fill();
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillStyle = "#ffffff";
    ctx.fillText(text, backgroundX + padding, backgroundY + padding);
    ctx.restore();
  }
  function drawProgressBar(ctx, progress, scaleFactor = 1) {
    ctx.save();
    const barHeight = 4 * scaleFactor;
    const barWidth = ctx.canvas.width;
    const progressWidth = barWidth * progress;
    const barTop = ctx.canvas.height - barHeight;
    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(0, barTop, barWidth, barHeight);
    ctx.fillStyle = "#C96442";
    ctx.fillRect(0, barTop, progressWidth, barHeight);
    ctx.restore();
  }
  function drawWatermark(ctx, scaleFactor = 1) {
    ctx.save();
    const padding = 8 * scaleFactor;
    const logoSize = 32 * scaleFactor;
    const watermarkLeft = ctx.canvas.width - padding - logoSize;
    const watermarkTop = ctx.canvas.height - padding - logoSize - 4 * scaleFactor;
    const cornerRadius = logoSize * 0.234;
    ctx.beginPath();
    ctx.moveTo(watermarkLeft + cornerRadius, watermarkTop);
    ctx.lineTo(watermarkLeft + logoSize - cornerRadius, watermarkTop);
    ctx.quadraticCurveTo(
      watermarkLeft + logoSize,
      watermarkTop,
      watermarkLeft + logoSize,
      watermarkTop + cornerRadius
    );
    ctx.lineTo(
      watermarkLeft + logoSize,
      watermarkTop + logoSize - cornerRadius
    );
    ctx.quadraticCurveTo(
      watermarkLeft + logoSize,
      watermarkTop + logoSize,
      watermarkLeft + logoSize - cornerRadius,
      watermarkTop + logoSize
    );
    ctx.lineTo(watermarkLeft + cornerRadius, watermarkTop + logoSize);
    ctx.quadraticCurveTo(
      watermarkLeft,
      watermarkTop + logoSize,
      watermarkLeft,
      watermarkTop + logoSize - cornerRadius
    );
    ctx.lineTo(watermarkLeft, watermarkTop + cornerRadius);
    ctx.quadraticCurveTo(
      watermarkLeft,
      watermarkTop,
      watermarkLeft + cornerRadius,
      watermarkTop
    );
    ctx.closePath();
    const gradient = ctx.createLinearGradient(
      watermarkLeft,
      watermarkTop + logoSize,
      watermarkLeft,
      watermarkTop
    );
    gradient.addColorStop(0, "#DC6038");
    gradient.addColorStop(1, "#2B52FF");
    ctx.fillStyle = gradient;
    ctx.fill();
    const logoPath = new deps.Path2DCtor(REDROB_LOGO_PATH_DATA);
    const pathScale = logoSize / 691;
    ctx.translate(watermarkLeft, watermarkTop);
    ctx.scale(pathScale, pathScale);
    ctx.fillStyle = "rgba(250, 249, 245, 0.9)";
    ctx.fill(logoPath);
    ctx.restore();
  }
  function applyActionIndicators(canvas, action, options, scaleFactor = 1) {
    const ctx = canvas.getContext("2d");
    if (!ctx || !action) return;
    if (options.showClickIndicators && action.coordinate && (action.type.includes("click") || action.type === "scroll")) {
      const [x, y] = action.coordinate;
      const scaledX = x * scaleFactor;
      const scaledY = y * scaleFactor;
      drawClickIndicator(ctx, scaledX, scaledY, scaleFactor);
      if (options.showActionLabels && action.description) {
        drawActionLabel(ctx, action.description, scaledX, scaledY, scaleFactor);
      }
    }
    if (options.showDragPaths && action.type === "left_click_drag" && action.start_coordinate && action.coordinate) {
      const [startX, startY] = action.start_coordinate;
      const [endX, endY] = action.coordinate;
      const scaledStartX = startX * scaleFactor;
      const scaledStartY = startY * scaleFactor;
      const scaledEndX = endX * scaleFactor;
      const scaledEndY = endY * scaleFactor;
      drawDragPath(
        ctx,
        scaledStartX,
        scaledStartY,
        scaledEndX,
        scaledEndY,
        scaleFactor
      );
      if (options.showActionLabels && action.description) {
        drawActionLabel(
          ctx,
          action.description,
          scaledEndX,
          scaledEndY,
          scaleFactor
        );
      }
    }
    if (options.showActionLabels && action.description && !action.coordinate && (action.type === "type" || action.type === "key" || action.type === "wait")) {
      drawActionLabel(
        ctx,
        action.description,
        20 * scaleFactor,
        20 * scaleFactor,
        scaleFactor
      );
    }
  }
  return {
    drawClickIndicator,
    drawDragPath,
    drawActionLabel,
    drawProgressBar,
    drawWatermark,
    applyActionIndicators
  };
}

// src/media/gif-generation.js
function padCanvasToSize(deps, canvas, width, height) {
  if (canvas.width === width && canvas.height === height) {
    return canvas;
  }
  const padded = deps.documentApi.createElement("canvas");
  padded.width = width;
  padded.height = height;
  const ctx = padded.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(canvas, 0, 0);
  return padded;
}
function createGifGeneration(deps, overlays) {
  async function generateAnimatedGif(frames, options = {}) {
    deps.log(`[Offscreen] Generating GIF from ${frames.length} frames`);
    deps.log(`[Offscreen] Options:`, options);
    const enhancementOptions = {
      showClickIndicators: options.showClickIndicators ?? true,
      showDragPaths: options.showDragPaths ?? true,
      showActionLabels: options.showActionLabels ?? true,
      showProgressBar: options.showProgressBar ?? true,
      // Stamping a logo onto the user's own recording is not ours to do.
      showWatermark: options.showWatermark ?? false
    };
    const images = await Promise.all(
      frames.map((frame, index) => {
        deps.log(`[Offscreen] Loading image ${index + 1}/${frames.length}`);
        return new Promise((resolve, reject) => {
          const image = new deps.ImageCtor();
          image.onload = () => {
            deps.log(
              `[Offscreen] Image ${index + 1} loaded: ${image.width}x${image.height}`
            );
            resolve(image);
          };
          image.onerror = reject;
          const dataUrl = `data:image/${frame.format || "png"};base64,${frame.base64}`;
          image.src = dataUrl;
        });
      })
    );
    deps.log(`[Offscreen] All ${images.length} images loaded`);
    const width = Math.max(...images.map((image) => image.width));
    const height = Math.max(...images.map((image) => image.height));
    deps.log(`[Offscreen] Enhancing frames with indicators and overlays...`);
    const enhancedCanvases = images.map((image, index) => {
      const canvas = deps.documentApi.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const frame = frames[index];
      let scaleFactor = 1;
      if (frame.viewportWidth && canvas.width) {
        scaleFactor = canvas.width / frame.viewportWidth;
        deps.log(
          `[Offscreen] Frame ${index + 1}: Applying scale factor ${scaleFactor} (canvas: ${canvas.width}x${canvas.height}, viewport: ${frame.viewportWidth}x${frame.viewportHeight})`
        );
      } else {
        deps.log(
          `[Offscreen] Frame ${index + 1}: No viewport metadata, using scale factor 1.0 (backwards compatibility)`
        );
      }
      if (frame.action) {
        overlays.applyActionIndicators(
          canvas,
          frame.action,
          enhancementOptions,
          scaleFactor
        );
      }
      const progress = (index + 1) / images.length;
      if (enhancementOptions.showProgressBar) {
        overlays.drawProgressBar(ctx, progress, scaleFactor);
      }
      if (enhancementOptions.showWatermark) {
        overlays.drawWatermark(ctx, scaleFactor);
      }
      deps.log(
        `[Offscreen] Frame ${index + 1}/${images.length} enhanced (progress: ${Math.round(progress * 100)}%)`
      );
      return padCanvasToSize(deps, canvas, width, height);
    });
    deps.log(
      `[Offscreen] Creating GIF encoder: ${width}x${height}, workers: ${GIF_ENCODER_WORKER_COUNT}`
    );
    const frameDelays = frames.map((frame, index) => {
      const baseDelay = frame.delay || DEFAULT_GIF_FRAME_DELAY_MS;
      const isLastFrame = index === frames.length - 1;
      return isLastFrame ? baseDelay + GIF_LAST_FRAME_EXTRA_DELAY_MS : baseDelay;
    });
    return new Promise((resolve, reject) => {
      const gifEncoder = deps.createGifEncoder({
        workers: GIF_ENCODER_WORKER_COUNT,
        quality: options.quality || DEFAULT_GIF_ENCODER_QUALITY,
        width,
        height,
        workerScript: deps.chromeApi.runtime.getURL(GIF_WORKER_SCRIPT_PATH),
        repeat: 0,
        debug: true
      });
      gifEncoder.on("progress", (percent) => {
        deps.log(
          `[Offscreen] GIF encoding progress: ${Math.round(percent * 100)}%`
        );
      });
      gifEncoder.on("finished", (blob) => {
        deps.log(`[Offscreen] GIF created: ${blob.size} bytes`);
        const blobUrl = deps.UrlCtor.createObjectURL(blob);
        deps.log(`[Offscreen] Created blob URL: ${blobUrl}`);
        const reader = new deps.FileReaderCtor();
        reader.onloadend = () => {
          const base64 = (
            /** @type {string} */
            reader.result.split(",")[1]
          );
          deps.log(
            `[Offscreen] Conversion complete, base64 length: ${base64.length}`
          );
          resolve({
            base64,
            blobUrl,
            size: blob.size,
            width,
            height
          });
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
      gifEncoder.on("abort", () => reject(new Error("GIF rendering aborted")));
      enhancedCanvases.forEach((canvas, index) => {
        gifEncoder.addFrame(canvas, { delay: frameDelays[index] });
      });
      deps.log(`[Offscreen] Starting GIF rendering...`);
      gifEncoder.render();
    });
  }
  return {
    padCanvasToSize: (canvas, width, height) => padCanvasToSize(deps, canvas, width, height),
    generateAnimatedGif
  };
}

// src/media/offscreen-message-router.js
function installOffscreenMessageRouter(deps, handlers) {
  function onRuntimeMessage(message, _sender, sendResponse) {
    if (message.type === MESSAGE_OFFSCREEN_PLAY_SOUND) {
      deps.log("[Offscreen] Received OFFSCREEN_PLAY_SOUND message");
      const volume = message.volume || DEFAULT_NOTIFICATION_SOUND_VOLUME;
      handlers.playNotificationSound(message.audioUrl, volume).then(() => {
        deps.log("[Offscreen] Sound played successfully via Web Audio API");
        sendResponse({ success: true });
      }).catch((error) => {
        deps.logError("[Offscreen] Failed to play sound:", error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
    if (message.type === MESSAGE_REVOKE_BLOB_URL) {
      handlers.revokeBlobUrl(message.blobUrl);
      sendResponse({ success: true });
      return true;
    }
    if (message.type === MESSAGE_GENERATE_GIF) {
      deps.log("[Offscreen] Received GENERATE_GIF message");
      deps.log(`[Offscreen] Frames: ${message.frames?.length}`);
      deps.log(`[Offscreen] Options:`, message.options);
      handlers.generateAnimatedGif(message.frames, message.options).then((result) => {
        deps.log("[Offscreen] GIF generated successfully");
        sendResponse({ success: true, result });
      }).catch((error) => {
        deps.logError("[Offscreen] Failed to generate GIF:", error);
        sendResponse({ success: false, error: error.message });
      });
      return true;
    }
  }
  deps.chromeApi.runtime.onMessage.addListener(onRuntimeMessage);
  return () => {
    deps.chromeApi.runtime.onMessage.removeListener(onRuntimeMessage);
  };
}

// src/media/offscreen-bootstrap.js
function startServiceWorkerKeepalive(deps, intervalMs = SERVICE_WORKER_KEEPALIVE_INTERVAL_MS) {
  return setInterval(() => {
    deps.chromeApi.runtime.sendMessage({ type: MESSAGE_SERVICE_WORKER_KEEPALIVE }).catch(() => {
    });
  }, intervalMs);
}
function bootstrapOffscreenDocument(dependencyOverrides = {}) {
  const deps = createMediaDependencies(dependencyOverrides);
  deps.log("[Offscreen] Document loaded and ready");
  const keepaliveIntervalId = startServiceWorkerKeepalive(deps);
  const audioPlayback = createAudioPlayback(deps);
  const gifOverlays = createGifOverlays(deps);
  const gifGeneration = createGifGeneration(deps, gifOverlays);
  const uninstallMessageRouter = installOffscreenMessageRouter(deps, {
    playNotificationSound: audioPlayback.playNotificationSound,
    generateAnimatedGif: gifGeneration.generateAnimatedGif,
    revokeBlobUrl: (blobUrl) => deps.UrlCtor.revokeObjectURL(blobUrl)
  });
  return {
    deps,
    audioPlayback,
    gifOverlays,
    gifGeneration,
    keepaliveIntervalId,
    uninstallMessageRouter
  };
}

// src/media/offscreen-entry.js
bootstrapOffscreenDocument();
//# sourceMappingURL=offscreen.js.map
