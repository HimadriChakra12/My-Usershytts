// ==UserScript==
// @name         Google — Fast Elegant Debloat (Privacy Edition)
// @namespace    https://github.com/debloat/google
// @version      6.0.0
// @description  Lightweight, theme-aware Google Search cleanup with canvas fingerprint poisoning, storage nuking, referrer stripping, telemetry blocking, and reduced bloat. AI Overview preserved.
// @author       HIM
// @match        https://www.google.com/*
// @match        https://google.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const LOW_RAM_MODE          = true;
  const DISABLE_IMAGES_ON_SCROLL = true;
  const ENABLE_COMPACT_MODE   = true;

  const _toDataURL          = HTMLCanvasElement.prototype.toDataURL;
  const _toBlob             = HTMLCanvasElement.prototype.toBlob;
  const _getImageData       = CanvasRenderingContext2D.prototype.getImageData;
  const _readPixels         = WebGLRenderingContext.prototype.readPixels;

  function noiseCanvas(canvas) {
    try {
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const img = ctx.getImageData(0, 0, canvas.width || 1, canvas.height || 1);
      for (let i = 0; i < img.data.length; i += 4) {
        img.data[i]     ^= Math.random() * 2 | 0;
        img.data[i + 1] ^= Math.random() * 2 | 0;
        img.data[i + 2] ^= Math.random() * 2 | 0;
      }
      ctx.putImageData(img, 0, 0);
    } catch {}
  }

  HTMLCanvasElement.prototype.toDataURL = function(...args) {
    noiseCanvas(this);
    return _toDataURL.apply(this, args);
  };

  HTMLCanvasElement.prototype.toBlob = function(cb, ...args) {
    noiseCanvas(this);
    return _toBlob.call(this, cb, ...args);
  };

  CanvasRenderingContext2D.prototype.getImageData = function(...args) {
    const data = _getImageData.apply(this, args);
    for (let i = 0; i < data.data.length; i += 4) {
      data.data[i]     ^= Math.random() * 2 | 0;
      data.data[i + 1] ^= Math.random() * 2 | 0;
      data.data[i + 2] ^= Math.random() * 2 | 0;
    }
    return data;
  };

  if (window.WebGLRenderingContext) {
    WebGLRenderingContext.prototype.readPixels = function(...args) {
      _readPixels.apply(this, args);
      const buf = args[6];
      if (buf instanceof Uint8Array) {
        for (let i = 0; i < buf.length; i++) {
          buf[i] ^= Math.random() * 2 | 0;
        }
      }
    };
  }

  const spoof = (obj, prop, val) => {
    try {
      Object.defineProperty(obj, prop, {
        get: () => val,
        configurable: true
      });
    } catch {}
  };

  // Spoof hardware concurrency and memory (common fingerprint vectors)
  spoof(navigator, 'hardwareConcurrency', 4);
  spoof(navigator, 'deviceMemory', 8);
  spoof(navigator, 'platform', 'Win32');

  // Empty plugin list — real Brave/FF fingerprint target
  spoof(navigator, 'plugins', {
    length: 0,
    item: () => null,
    namedItem: () => null,
    [Symbol.iterator]: function*() {}
  });

  spoof(navigator, 'mimeTypes', {
    length: 0,
    item: () => null,
    namedItem: () => null,
    [Symbol.iterator]: function*() {}
  });

  // Spoof screen to common 1920×1080, hide real resolution
  spoof(screen, 'width',       1920);
  spoof(screen, 'height',      1080);
  spoof(screen, 'availWidth',  1920);
  spoof(screen, 'availHeight', 1040);
  spoof(screen, 'colorDepth',  24);
  spoof(screen, 'pixelDepth',  24);

  // Kill timezone leak
  const _DateTimeFormat = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function(locale, opts = {}) {
    opts.timeZone = opts.timeZone || 'UTC';
    return new _DateTimeFormat(locale, opts);
  };
  Intl.DateTimeFormat.prototype = _DateTimeFormat.prototype;

  const BLOCKED_COOKIE_NAMES = [
    'NID', 'CONSENT', 'SOCS', '1P_JAR',
    'AEC', 'ANID', 'DSID', 'IDE',
    'DV', 'HSID', 'SSID', 'APISID',
    'SAPISID', '__Secure-1PAPISID',
    '__Secure-3PAPISID', '__Secure-1PSID',
    '__Secure-3PSID', 'SID',
  ];

  const _cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
    || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

  if (_cookieDesc && _cookieDesc.set) {
    Object.defineProperty(document, 'cookie', {
      get: _cookieDesc.get,
      set(val) {
        const name = val.split('=')[0].trim();
        if (BLOCKED_COOKIE_NAMES.some(b => name === b || name.startsWith('__utm'))) {
          return; // silently drop
        }
        _cookieDesc.set.call(document, val);
      },
      configurable: true
    });
  }

  try { localStorage.clear(); }   catch {}
  try { sessionStorage.clear(); } catch {}

  try {
    indexedDB.databases().then(dbs => {
      dbs.forEach(db => indexedDB.deleteDatabase(db.name));
    });
  } catch {}

  // Also nuke any cache storage
  if (window.caches) {
    caches.keys().then(keys => keys.forEach(k => caches.delete(k))).catch(() => {});
  }

  // Meta tag approach (works for page navigations)
  const metaRef = document.createElement('meta');
  metaRef.name    = 'referrer';
  metaRef.content = 'no-referrer';
  (document.head || document.documentElement).appendChild(metaRef);

  // Also patch individual link clicks
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (a) a.referrerPolicy = 'no-referrer';
  }, true);


  const BLOCKED_URLS = [
    'doubleclick',
    'googlesyndication',
    'pagead',
    'adservice',
    'google-analytics',
    'googletagmanager',
    'googletagservices',
    'stats.g.doubleclick',
    '/gen_204',
    '/log?',
    '/cspreport',
    'metrics.gstatic',
    'ssl.gstatic.com/gb/js', // gmail tracking beacon
    'play.google.com/log',
    'jnn-pa.googleapis.com',
  ];

  function isBlocked(url) {
    return BLOCKED_URLS.some(p => url.includes(p));
  }

  const _fetch = window.fetch;
  window.fetch = function(resource, init) {
    const url = typeof resource === 'string' ? resource : (resource.url || '');
    if (isBlocked(url)) {
      return Promise.resolve(new Response('', { status: 204 }));
    }
    return _fetch.call(this, resource, init);
  };

  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    if (typeof url === 'string' && isBlocked(url)) {
      // redirect to a dead endpoint instead of throwing
      return _xhrOpen.call(this, method, 'about:blank', ...rest);
    }
    return _xhrOpen.call(this, method, url, ...rest);
  };

  // Kill beacon entirely — no opt-out, it's pure telemetry
  navigator.sendBeacon = () => true;

  const REMOVE = [
    'iframe[src*="youtube"]',
    'iframe[src*="google.com/ads"]',
    '[jscontroller*="M6B6Be"]',
    '[jscontroller*="Vj6r2c"]',
    '.m6B6Be',

    /* ads */
    '[aria-label="Ads"]',
    '[data-text-ad]',
    '.commercial-unit-desktop-top',
    '.commercial-unit-mobile-top',
    '.commercial-unit-mobile-bottom',
    '#tvcap',
    '#bottomads',

    /* people also ask */
    '.related-question-pair',
    '[jscontroller="ge3PVe"]',

    /* shopping spam */
    '.pla-unit-container',

    /* giant carousels */
    'g-scrolling-carousel',

    /* twitter/x embeds */
    '.eejeod',

    /* footer */
    '#foot',
    '#footcnt',
    '#fbar',
    '#mfooter',
  ];

  const style = document.createElement('style');
  style.textContent = `
    :root {
      --debloat-width: 760px;
      --debloat-gap: 16px;
      --border-light: rgba(0,0,0,.08);
      --border-dark:  rgba(255,255,255,.08);
      --wiki-light:   rgba(0,0,0,.03);
      --wiki-dark:    rgba(255,255,255,.03);
    }

    ${REMOVE.join(',')} { display: none !important; }

    div[class="ULSxyf"]:has([jsname="xQjRM"]){
        position: absolute;
        width: 90%;
        top: -35%;
        left: -100%;
        overflow-y: scroll;
        z-index: 10000000000;
        transition: 0.4s ease-in-out;
    }

    div[class="ULSxyf"]:has([jsname="xQjRM"]):hover{
        background: #11111185;
        backdrop-filter: blur(1000px);
        padding: 20px;
        z-index: 10000000000;
        width: 305%;
        transition: 0.4s ease-in-out;
    }

    div[class="ULSxyf"]:not(:has([jsname="xQjRM"])){
        display: none;
    }
    div[jsslot=""]:has([data-attrid="DictionaryHeader"]){
        display: none
    }

    div[id="uOz6nd"],
    div[id="aaLvqc"]{ display: none; }

    @media screen and (min-width: 1600px) {
      #tsf, .GG4mbd, #rcnt {
        margin-left: calc((100vw - 692px) / 2 - 300px);
      }
      #fbar, .GeEc1b, .B4GxFc {
        display: flex;
        justify-content: center;
      }
    }

    @media screen { #fsl { margin-left: -27px; } }

    #search, #rcnt, #center_col {
      max-width: var(--debloat-width) !important;
      margin: auto !important;
      width: 100% !important;
      float: none !important;
    }

    #rcnt { padding: 0 16px !important; }

    .RNNXgb, .SDkEP, .A8SBwf {
      border-radius: 999px !important;
      box-shadow: none !important;
    }

    @media (prefers-color-scheme: dark) {
      .RNNXgb, .SDkEP, .A8SBwf {
        border: 1px solid rgba(255,255,255,.08) !important;
      }
    }
    @media (prefers-color-scheme: light) {
      .RNNXgb, .SDkEP, .A8SBwf {
        border: 1px solid rgba(0,0,0,.08) !important;
      }
    }

    .g, .tF2Cxc {
      margin-bottom: var(--debloat-gap) !important;
      padding-bottom: 14px !important;
      background: transparent !important;
      box-shadow: none !important;
    }

    @media (prefers-color-scheme: dark) {
      .g:not(:last-child), .tF2Cxc:not(:last-child) {
        border-bottom: 1px solid var(--border-dark) !important;
      }
    }
    @media (prefers-color-scheme: light) {
      .g:not(:last-child), .tF2Cxc:not(:last-child) {
        border-bottom: 1px solid var(--border-light) !important;
      }
    }

    h3, .LC20lb {
      font-size: 1.05rem !important;
      font-weight: 500 !important;
      line-height: 1.35 !important;
    }

    .VwiC3b, .s3v9rd, .st {
      line-height: 1.55 !important;
      opacity: .92;
    }

    cite, .TbwUpd { opacity: .72; }

    #rhs .kp-wholepage,
    #rhs .knowledge-panel,
    #rhs [data-attrid] {
      border-radius: 14px !important;
      padding: 10px !important;
    }

    @media (prefers-color-scheme: dark) {
      #rhs .kp-wholepage,
      #rhs .knowledge-panel,
      #rhs [data-attrid] {
        background: var(--wiki-dark) !important;
        border: 1px solid rgba(255,255,255,.05) !important;
      }
    }
    @media (prefers-color-scheme: light) {
      #rhs .kp-wholepage,
      #rhs .knowledge-panel,
      #rhs [data-attrid] {
        background: var(--wiki-light) !important;
        border: 1px solid rgba(0,0,0,.05) !important;
      }
    }

    body.debloat-compact .g,
    body.debloat-compact .tF2Cxc {
      margin-bottom: 6px !important;
      padding-bottom: 6px !important;
    }

    body {
      text-rendering: optimizeSpeed;
      -webkit-font-smoothing: antialiased;
    }

    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-thumb {
      background: rgba(127,127,127,.25);
      border-radius: 999px;
    }
  `;

  document.documentElement.appendChild(style);

  const PURGE_CACHE = new WeakSet();

  function purge() {
    const nodes = document.querySelectorAll(REMOVE.join(','));
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!PURGE_CACHE.has(el)) {
        PURGE_CACHE.add(el);
        el.remove();
      }
    }
  }

  document.addEventListener('DOMContentLoaded', purge);

  if (LOW_RAM_MODE) {
    setInterval(purge, 2000);
  } else {
    const obs = new MutationObserver(() => {
      setTimeout(purge, 0);
    });
    document.addEventListener('DOMContentLoaded', () => {
      obs.observe(document.body, { childList: true, subtree: true });
    });
  }

  const TRACKING_PARAMS = [
    'ved','ei','usg','source','sxsrf','oq',
    'aqs','gs_lcp','gs_lp','uact','sca_esv',
    'sa','rlz','ie','oe',
  ];

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    try {
      const url = new URL(a.href);
      TRACKING_PARAMS.forEach(p => url.searchParams.delete(p));
      a.href = url.toString();
      a.referrerPolicy = 'no-referrer'; // belt-and-suspenders
    } catch {}
  }, true);

  function memoryHint() {
    try { if (window.gc) window.gc(); } catch {}
    document.querySelectorAll('iframe, video').forEach(el => {
      el.loading = 'lazy';
    });
  }
  setInterval(memoryHint, 15000);

  // Remove speculative rules & ad prefetches
  document.querySelectorAll('script[type="speculationrules"]').forEach(el => el.remove());
  document.querySelectorAll('link[rel="prefetch"], link[rel="preload"]').forEach(el => {
    const href = el.href || '';
    if (href.includes('googleads') || href.includes('doubleclick')) el.remove();
  });

  if (DISABLE_IMAGES_ON_SCROLL) {
    document.addEventListener('scroll', () => {
      document.querySelectorAll('img').forEach(img => {
        if (!img.dataset.src) {
          img.loading  = 'lazy';
          img.decoding = 'async';
        }
      });
    }, { passive: true });
  }

  /* ════════════════════════════════════════
     12. COMPACT MODE TOGGLE  (Alt+Z)
     ════════════════════════════════════════ */

  if (ENABLE_COMPACT_MODE) {
    document.addEventListener('keydown', e => {
      if (e.altKey && e.key.toLowerCase() === 'z') {
        document.body.classList.toggle('debloat-compact');
      }
    });
  }

  console.log('[Fast Elegant Debloat v6.0 Privacy] ✓ AI Overview kept | Canvas poisoned | Storage nuked | Beacon killed');

})();
