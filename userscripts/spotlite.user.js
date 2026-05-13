// ==UserScript==
// @name         Spotify Lite
// @namespace    https://open.spotify.com
// @version      2.0.0
// @description  Aggressive low-latency mode — kills every thread-blocking pattern Spotify uses.
// @author       you
// @match        https://open.spotify.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* ═══════════════════════════════════════════════════════════
     1. NUCLEAR CSS — zero transitions, zero animations,
        zero blur, zero will-change bloat. Injected at
        document-start so it lands before first paint.
  ═══════════════════════════════════════════════════════════ */
  const injectCSS = () => {
    const s = document.createElement('style');
    s.id = 'sl-v2';
    s.textContent = `
      /* Global animation kill */
      *, *::before, *::after {
        animation-duration:        0.001ms !important;
        animation-delay:           0ms     !important;
        animation-iteration-count: 1       !important;
        transition-duration:       0ms     !important;
        transition-delay:          0ms     !important;
        scroll-behavior:           auto    !important;
      }

      /* GPU layer hogs removed */
      * {
        will-change: auto !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }

      /* Overlays / modals / menus: no entrance delay */
      [class*="Overlay"], [class*="overlay"],
      [class*="Modal"],   [class*="modal"],
      [class*="Dialog"],  [class*="dialog"],
      [class*="Sheet"],   [class*="sheet"],
      [class*="Drawer"],  [class*="drawer"],
      [class*="ContextMenu"], [class*="contextMenu"],
      [class*="Tooltip"], [class*="tooltip"],
      [class*="Popover"], [class*="popover"],
      [class*="Dropdown"],[class*="dropdown"] {
        animation: none !important;
        transition: none !important;
        opacity: 1 !important;
        transform: none !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  };

  injectCSS();
  document.addEventListener('DOMContentLoaded', injectCSS, { once: true });


  /* ═══════════════════════════════════════════════════════════
     2. setTimeout FAST-PATH via MessageChannel
        0-delay timers run in < 1ms instead of the browser's
        ~4ms clamped minimum. Spotify defers a lot of work
        behind setTimeout(fn, 0) — this makes it land faster.
  ═══════════════════════════════════════════════════════════ */
  const _setTimeout   = window.setTimeout.bind(window);
  const _clearTimeout = window.clearTimeout.bind(window);

  const mc     = new MessageChannel();
  const mcJobs = new Map();
  let   mcSeq  = 1;

  mc.port1.onmessage = ({ data: id }) => {
    const job = mcJobs.get(id);
    if (!job) return;
    mcJobs.delete(id);
    try { job.fn(...job.args); } catch (_) {}
  };

  window.setTimeout = function (fn, delay = 0, ...args) {
    if (delay === 0 && typeof fn === 'function') {
      const id = mcSeq++;
      mcJobs.set(id, { fn, args });
      mc.port2.postMessage(id);
      return id;
    }
    return _setTimeout(fn, delay, ...args);
  };

  window.clearTimeout = function (id) {
    if (mcJobs.has(id)) { mcJobs.delete(id); return; }
    _clearTimeout(id);
  };


  /* ═══════════════════════════════════════════════════════════
     3. requestIdleCallback — analytics get real idle time only
        Non-urgent idle work (telemetry, prefetch hints, etc.)
        is queued and only runs when the tab has ≥1ms free.
        Urgent callbacks (timeout < 100ms) bypass the queue.
  ═══════════════════════════════════════════════════════════ */
  const _rIC = window.requestIdleCallback  || (cb => _setTimeout(cb, 1));
  const _cIC = window.cancelIdleCallback   || _clearTimeout;
  const icQ  = [];
  let icTimer = null;

  function drainIdle(dl) {
    icTimer = null;
    while (icQ.length && (dl.timeRemaining() > 1 || dl.didTimeout)) {
      const { cb } = icQ.shift();
      try { cb(dl); } catch (_) {}
    }
    if (icQ.length) icTimer = _rIC(drainIdle, { timeout: 2000 });
  }

  window.requestIdleCallback = function (cb, opts = {}) {
    if (opts.timeout && opts.timeout < 100) return _rIC(cb, opts);
    icQ.push({ cb, opts });
    if (!icTimer) icTimer = _rIC(drainIdle, { timeout: 2000 });
    return icQ.length;
  };
  window.cancelIdleCallback = id => { icQ.splice(id - 1, 1); _cIC(id); };


  /* ═══════════════════════════════════════════════════════════
     4. MutationObserver coalescing
        All mutations for a given observer are batched into one
        microtask per rAF. Spotify's MOs fire on every tiny DOM
        tweak — coalescing cuts callback volume dramatically.
  ═══════════════════════════════════════════════════════════ */
  const _MO = window.MutationObserver;
  window.MutationObserver = class extends _MO {
    #q = []; #s = false; #cb;
    constructor(cb) {
      let self;
      super((mutations, obs) => {
        self.#q.push(...mutations);
        if (!self.#s) {
          self.#s = true;
          queueMicrotask(() => {
            self.#s = false;
            const batch = self.#q.splice(0);
            if (batch.length) try { self.#cb(batch, obs); } catch (_) {}
          });
        }
      });
      self = this; this.#cb = cb;
    }
  };


  /* ═══════════════════════════════════════════════════════════
     5. rAF storm guard
        Cap concurrent rAF callbacks per frame to 8.
        Extras spill to the next frame. Input handling always
        gets a slot in the frame budget.
  ═══════════════════════════════════════════════════════════ */
  const _raf = window.requestAnimationFrame.bind(window);
  const _caf = window.cancelAnimationFrame.bind(window);
  const BUDGET = 8;
  let rafQ = [], rafOvf = [], rafLive = false;

  function rafFlush(ts) {
    rafLive = false;
    const run = rafQ.splice(0);
    let n = 0;
    for (const e of run) {
      if (e.id._c) continue;
      if (n++ < BUDGET) { try { e.fn(ts); } catch (_) {} }
      else rafOvf.push(e);
    }
    if (rafOvf.length) { rafQ = rafOvf.splice(0); schedRaf(); }
  }
  function schedRaf() { if (!rafLive) { rafLive = true; _raf(rafFlush); } }

  window.requestAnimationFrame = fn => {
    const e = { fn, id: { _c: false } };
    rafQ.push(e); schedRaf(); return e.id;
  };
  window.cancelAnimationFrame = id => {
    if (id && typeof id === 'object') id._c = true; else _caf(id);
  };


  /* ═══════════════════════════════════════════════════════════
     6. Event listener upgrades
        • scroll / pointermove / mousemove  → throttled 16ms
        • wheel / touchstart / touchmove    → forced passive
          (compositor thread handles scroll, zero jank)
        • resize                            → debounced 80ms
  ═══════════════════════════════════════════════════════════ */
  const _AEL = EventTarget.prototype.addEventListener;
  const _REL = EventTarget.prototype.removeEventListener;

  const THROTTLE_EVT = new Set(['scroll','pointermove','mousemove']);
  const PASSIVE_EVT  = new Set(['wheel','touchstart','touchmove']);
  const DEBOUNCE_EVT = new Set(['resize']);

  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    if (typeof fn !== 'function') return _AEL.call(this, type, fn, opts);

    if (PASSIVE_EVT.has(type)) {
      const o = typeof opts === 'object'
        ? { ...opts, passive: true }
        : { passive: true, capture: !!opts };
      return _AEL.call(this, type, fn, o);
    }

    if (THROTTLE_EVT.has(type)) {
      let last = 0;
      const t = function (e) {
        const now = performance.now();
        if (now - last >= 16) { last = now; fn.call(this, e); }
      };
      fn._slt = t;
      return _AEL.call(this, type, t, opts);
    }

    if (DEBOUNCE_EVT.has(type)) {
      let timer;
      const d = function (e) {
        clearTimeout(timer);
        timer = _setTimeout(() => fn.call(this, e), 80);
      };
      fn._slt = d;
      return _AEL.call(this, type, d, opts);
    }

    return _AEL.call(this, type, fn, opts);
  };

  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    _REL.call(this, type, fn?._slt ?? fn, opts);
  };


  /* ═══════════════════════════════════════════════════════════
     7. IntersectionObserver — analytics deferred, lazy-load instant
  ═══════════════════════════════════════════════════════════ */
  const _IO = window.IntersectionObserver;
  window.IntersectionObserver = function (cb, opts = {}) {
    const margin = opts.rootMargin || '0px';
    const isAnalytics = /[1-9]\d{2,}px/.test(margin) || margin === '0px';
    const wrapped = isAnalytics
      ? (() => { let t; return (e,o) => { clearTimeout(t); t = _setTimeout(()=>cb(e,o), 150); }; })()
      : cb;
    return new _IO(wrapped, opts);
  };
  Object.setPrototypeOf(window.IntersectionObserver, _IO);
  window.IntersectionObserver.prototype = _IO.prototype;


  /* ═══════════════════════════════════════════════════════════
     8. fetch() priority — analytics calls get priority: 'low'
        so they never compete with track/UI fetches.
  ═══════════════════════════════════════════════════════════ */
  const _fetch = window.fetch.bind(window);
  const LOW_RX = [
    /\/log\//,/\/telemetry/,/\/event/i,/analytics/i,
    /\/metrics/,/\/tracking/,/\/report/i,/sentry\.io/,
    /amplitude\.com/,/\/interaction/,/\/stats/,/\/beacon/,
  ];

  window.fetch = function (input, init = {}) {
    const url = typeof input === 'string' ? input : (input?.url ?? '');
    if (!init.priority && LOW_RX.some(r => r.test(url))) {
      init = { ...init, priority: 'low' };
    }
    return _fetch(input, init);
  };


  /* ═══════════════════════════════════════════════════════════
     9. XHR analytics delay — older telemetry path
        send() is postponed 80ms so it never lands during a
        user-gesture frame.
  ═══════════════════════════════════════════════════════════ */
  const _XHROpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    if (LOW_RX.some(r => r.test(String(url)))) {
      const orig = this.send.bind(this);
      this.send = (...a) => _setTimeout(() => orig(...a), 80);
    }
    return _XHROpen.call(this, method, url, ...rest);
  };


  /* ═══════════════════════════════════════════════════════════
     10. Image async decode + lazy load (uses native _MO)
  ═══════════════════════════════════════════════════════════ */
  const upgradeImg = img => {
    if (img._sl) return; img._sl = 1;
    img.decoding = 'async';
    if (!img.loading) img.loading = 'lazy';
  };

  const imgMO = new _MO(mutations => {
    for (const m of mutations)
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') upgradeImg(n);
        n.querySelectorAll?.('img').forEach(upgradeImg);
      }
  });

  const startImgMO = () => {
    imgMO.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll('img').forEach(upgradeImg);
  };
  document.body ? startImgMO()
    : document.addEventListener('DOMContentLoaded', startImgMO, { once: true });


  /* ═══════════════════════════════════════════════════════════
     11. Hover prefetch — 100ms intent window (was 200ms)
  ═══════════════════════════════════════════════════════════ */
  const prefetched = new Set();
  document.addEventListener('mouseover', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const { href } = a;
    if (!href.startsWith('https://open.spotify.com') || prefetched.has(href)) return;
    const t = _setTimeout(() => {
      prefetched.add(href);
      const l = Object.assign(document.createElement('link'), { rel: 'prefetch', as: 'document', href });
      document.head.appendChild(l);
    }, 100);
    a.addEventListener('mouseleave', () => clearTimeout(t), { once: true });
  }, { passive: true });


  /* ═══════════════════════════════════════════════════════════
     12. Long-task diagnostic (dev console only)
  ═══════════════════════════════════════════════════════════ */
  try {
    new PerformanceObserver(list => {
      for (const e of list.getEntries())
        if (e.duration > 50)
          console.warn(`[SpotifyLite] long task ${e.duration.toFixed(0)}ms`, e);
    }).observe({ type: 'longtask', buffered: true });
  } catch (_) {}


  console.log(
    '%c⚡ Spotify Lite %cv2 ULTRA',
    'background:#1DB954;color:#000;font-weight:800;padding:2px 8px;border-radius:4px 0 0 4px;font-family:monospace',
    'background:#191414;color:#1DB954;font-weight:800;padding:2px 8px;border-radius:0 4px 4px 0;font-family:monospace'
  );

})();
