// ==UserScript==
// @name         Instagram — Hard Mode Privacy
// @namespace    https://github.com/debloat/instagram
// @version      3.0.0
// @description  Aggressive fingerprint + telemetry + tracking protection while preserving login/session
// @match        https://www.instagram.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ── 1. Block actual telemetry endpoints ── */
  const TELEMETRY_PATTERNS = [
    '/logging_client_events',
    '/ajax/bz',
    '/tr/',
    '/ajax/device_id/',
    'connect.facebook.net',
    '/api/v1/web/comet/perf_log/',
  ];

  const _fetch = window.fetch;
  window.fetch = function(resource, init) {
    const url = typeof resource === 'string'
      ? resource
      : (resource?.url ?? '');

    if (TELEMETRY_PATTERNS.some(p => url.includes(p))) {
      console.debug('[Privacy] Blocked fetch:', url);
      return Promise.resolve(new Response('', { status: 204 }));
    }
    return _fetch.call(this, resource, init);
  };

  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string' && TELEMETRY_PATTERNS.some(p => url.includes(p))) {
      console.debug('[Privacy] Blocked XHR:', url);
      url = 'about:blank';
    }
    return _xhrOpen.call(this, method, url, ...rest);
  };

  /* ── 2. Kill beacons ── */
  navigator.sendBeacon = () => false;

  /* ── 3. Strip referrer safely ── */
  const injectReferrerMeta = () => {
    if (document.head && !document.querySelector('meta[name="referrer"]')) {
      const m = document.createElement('meta');
      m.name = 'referrer';
      m.content = 'no-referrer';
      document.head.prepend(m);
    }
  };

  if (document.head) {
    injectReferrerMeta();
  } else {
    document.addEventListener('DOMContentLoaded', injectReferrerMeta, { once: true });
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a) a.referrerPolicy = 'no-referrer';
  }, true);

  /* ── 4. Block third-party scripts from loading ── */
  // Note: this only catches dynamically injected scripts
  const _createElement = document.createElement.bind(document);
  document.createElement = function(tag, ...args) {
    const el = _createElement(tag, ...args);
    if (tag.toLowerCase() === 'script') {
      const _setSrc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src')?.set;
      if (_setSrc) {
        Object.defineProperty(el, 'src', {
          set(val) {
            if (TELEMETRY_PATTERNS.some(p => val.includes(p))) {
              console.debug('[Privacy] Blocked script:', val);
              return;
            }
            _setSrc.call(el, val);
          },
          get() {
            return el.getAttribute('src') ?? '';
          },
          configurable: true
        });
      }
    }
    return el;
  };

  /* ── 5. Canvas: fingerprint noise ONLY on readback, not display ── */
  // Only poison when data is being EXTRACTED, not when drawing
  const _getImageData = CanvasRenderingContext2D.prototype.getImageData;
  CanvasRenderingContext2D.prototype.getImageData = function(x, y, w, h, ...rest) {
    const data = _getImageData.call(this, x, y, w, h, ...rest);
    // Only add noise if this looks like a small fingerprint probe
    // Large reads are likely actual image processing
    if (w * h < 1000) {
      for (let i = 0; i < data.data.length; i += 4) {
        data.data[i]     ^= Math.random() * 2 | 0;
        data.data[i + 1] ^= Math.random() * 2 | 0;
        data.data[i + 2] ^= Math.random() * 2 | 0;
      }
    }
    return data;
  };

  /* ── 6. DO NOT touch localStorage - it will crash the site ── */
  // Instead, intercept specific known tracking keys
  const BLOCKED_LS_KEYS = [
    'ig_did',
    'ig_nrcb',
    'ig_direct_region_hint',
  ];

  const _lsGetItem = Storage.prototype.getItem;
  const _lsSetItem = Storage.prototype.setItem;

  Storage.prototype.setItem = function(key, value) {
    if (BLOCKED_LS_KEYS.includes(key)) return;
    return _lsSetItem.call(this, key, value);
  };

  Storage.prototype.getItem = function(key) {
    if (BLOCKED_LS_KEYS.includes(key)) return null;
    return _lsGetItem.call(this, key);
  };

  console.log('[Privacy] ✓ Telemetry blocked | Referrer stripped | Canvas hardened');
})();
