// ==UserScript==
// @name         Google — Fast Elegant Debloat
// @namespace    https://github.com/debloat/google
// @version      5.1.0
// @description  Lightweight, theme-aware Google Search cleanup with low RAM usage, preserved wiki panels, no animations, and reduced telemetry.
// @author       You
// @match        https://www.google.com/*
// @match        https://google.com/*
// @run-at       document-start
// @inject-into  page
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  /* ════════════════════════════════════════
     SETTINGS
     ════════════════════════════════════════ */

  const ENABLE_COMPACT_MODE = true;

  /* ════════════════════════════════════════
     REMOVE ONLY ACTUAL BLOAT
     Keep:
     - Wikipedia/wiki cards
     - Image sidebar
     - Knowledge panels
     - Direct answers
     ════════════════════════════════════════ */

  const REMOVE = [

    /* AI */
    '[data-attrid="SGEOverview"]',
    '[data-async-type="sgegenerative"]',
    '.M8OgIe',
    '.dG2XIf',
    'sfc-overview',

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

    /* giant product/video carousels */
    'g-scrolling-carousel',

    /* twitter/x embeds */
    '.eejeod',

    /* footer junk */
    '#foot',
    '#footcnt',
    '#fbar',
    '#mfooter',

    /* sticky junk */
    '.mMAuCf',
    '.EyBRub',
  ];

  /* ════════════════════════════════════════
     CSS
     optimized
     no blur
     no animations
     low repaint cost
     ════════════════════════════════════════ */

  const style = document.createElement('style');

  style.textContent = `
    :root {
      --debloat-width: 760px;
      --debloat-gap: 16px;

      --border-light: rgba(0,0,0,.08);
      --border-dark: rgba(255,255,255,.08);

      --wiki-light: rgba(0,0,0,.03);
      --wiki-dark: rgba(255,255,255,.03);
    }

    ${REMOVE.join(',')} {
      display: none !important;
    }
        @media screen and (min-width: 1600px) {
        #tsf,
        .GG4mbd,
        #rcnt
        {
            margin-left: calc((100vw - 692px) / 2 - 300px);
        }
        #fbar,
        .GeEc1b,
        .B4GxFc
        {
            display: flex;
            justify-content: center;
        }
    }
    @media screen {
        #fsl
        {
            margin-left: -27px;
        }
    }

    /* layout */
    #search,
    #rcnt,
    #center_col {
      max-width: var(--debloat-width) !important;
      margin: auto !important;
      width: 100% !important;
      float: none !important;
    }

    #rcnt {
      padding: 0 16px !important;
    }

    /* keep sidebar/wiki functionality */
    #rhs {
      opacity: .95;
    }

    /* searchbar */
    .RNNXgb,
    .SDkEP,
    .A8SBwf {
      border-radius: 999px !important;
      box-shadow: none !important;
    }

    @media (prefers-color-scheme: dark) {
      .RNNXgb,
      .SDkEP,
      .A8SBwf {
        border: 1px solid rgba(255,255,255,.08) !important;
      }
    }

    @media (prefers-color-scheme: light) {
      .RNNXgb,
      .SDkEP,
      .A8SBwf {
        border: 1px solid rgba(0,0,0,.08) !important;
      }
    }

    /* results */
    .g,
    .tF2Cxc {
      margin-bottom: var(--debloat-gap) !important;
      padding-bottom: 14px !important;

      background: transparent !important;
      box-shadow: none !important;
    }

    @media (prefers-color-scheme: dark) {
      .g:not(:last-child),
      .tF2Cxc:not(:last-child) {
        border-bottom: 1px solid var(--border-dark) !important;
      }
    }

    @media (prefers-color-scheme: light) {
      .g:not(:last-child),
      .tF2Cxc:not(:last-child) {
        border-bottom: 1px solid var(--border-light) !important;
      }
    }

    /* typography */
    h3,
    .LC20lb {
      font-size: 1.05rem !important;
      font-weight: 500 !important;
      line-height: 1.35 !important;
    }

    .VwiC3b,
    .s3v9rd,
    .st {
      line-height: 1.55 !important;
      opacity: .92;
    }

    cite,
    .TbwUpd {
      opacity: .72;
    }

    /* ════════════════════════════════════
       WIKI / KNOWLEDGE PANEL ENHANCEMENT
       this is the peak part
       ════════════════════════════════════ */

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

    /* compact mode */
    body.debloat-compact .g,
    body.debloat-compact .tF2Cxc {
      margin-bottom: 6px !important;
      padding-bottom: 6px !important;
    }

    /* NO ANIMATIONS */
    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
      scroll-behavior: auto !important;
    }

    /* low repaint cost */
    body {
      text-rendering: optimizeSpeed;
      -webkit-font-smoothing: antialiased;
    }

    /* scrollbar */
    ::-webkit-scrollbar {
      width: 8px;
    }

    ::-webkit-scrollbar-thumb {
      background: rgba(127,127,127,.25);
      border-radius: 999px;
    }
  `;

  document.documentElement.appendChild(style);

  /* ════════════════════════════════════════
     FAST PURGE
     low overhead
     ════════════════════════════════════════ */

  function purge() {

    for (const selector of REMOVE) {
      document.querySelectorAll(selector).forEach(el => el.remove());
    }

    /* remove AI headings manually */
    document.querySelectorAll('h1,h2,h3').forEach(el => {

      const text = el.textContent;

      if (
        text.includes('AI Overview') ||
        text.includes('People also ask')
      ) {
        el.closest('div[jscontroller], .g, section')?.remove();
      }

    });

  }

  document.addEventListener('DOMContentLoaded', purge);

  let scheduled = false;

  const observer = new MutationObserver(() => {

    if (scheduled) return;

    scheduled = true;

    requestIdleCallback(() => {

      purge();
      scheduled = false;

    }, { timeout: 1000 });

  });

  document.addEventListener('DOMContentLoaded', () => {

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

  });

  /* ════════════════════════════════════════
     URL CLEANER
     lightweight
     ════════════════════════════════════════ */

  const TRACKING = [
    'ved',
    'ei',
    'usg',
    'source',
    'sxsrf',
    'oq',
    'aqs',
    'gs_lcp',
    'gs_lp',
    'uact',
    'sca_esv',
  ];

  document.addEventListener('click', e => {

    const a = e.target.closest('a[href]');

    if (!a) return;

    try {

      const url = new URL(a.href);

      TRACKING.forEach(p => {
        url.searchParams.delete(p);
      });

      a.href = url.toString();

    } catch {}

  }, true);

  /* ════════════════════════════════════════
     BLOCK TELEMETRY
     keep search/image/wiki functionality
     ════════════════════════════════════════ */

  const BLOCKED = [
    'doubleclick',
    'googlesyndication',
    'pagead',
    'adservice',
    'google-analytics',
    '/gen_204',
  ];

  function blocked(url) {
    return BLOCKED.some(p => url.includes(p));
  }

  const originalFetch = window.fetch;

  window.fetch = function(resource, init) {

    const url =
      typeof resource === 'string'
        ? resource
        : resource.url;

    if (blocked(url)) {

      return Promise.resolve(
        new Response('{}', {
          status: 204,
          headers: {
            'Content-Type': 'application/json'
          }
        })
      );

    }

    return originalFetch.call(this, resource, init);

  };

  const originalOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function(method, url, ...args) {

    if (blocked(url)) return;

    return originalOpen.call(this, method, url, ...args);

  };

  if (navigator.sendBeacon) {
    navigator.sendBeacon = () => true;
  }

  /* ════════════════════════════════════════
     LOW RAM TWEAKS
     ════════════════════════════════════════ */

  /* remove speculative loading */
  document.querySelectorAll('script[type="speculationrules"]').forEach(el => {
    el.remove();
  });

  /* remove ad prefetch */
  document.querySelectorAll('link[rel="prefetch"], link[rel="preload"]').forEach(el => {

    const href = el.href || '';

    if (
      href.includes('googleads') ||
      href.includes('doubleclick')
    ) {
      el.remove();
    }

  });

  /* lighter idle callback */
  window.requestIdleCallback = cb => setTimeout(cb, 200);

  /* compact mode */
  if (ENABLE_COMPACT_MODE) {

    document.addEventListener('keydown', e => {

      if (e.altKey && e.key.toLowerCase() === 'z') {
        document.body.classList.toggle('debloat-compact');
      }

    });

  }

  console.log('[Fast Elegant Debloat v5.1] ✓ Wiki panels preserved');

})();
