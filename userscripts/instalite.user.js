// ==UserScript==
// @name         Instagram Lite — Low RAM Mode
// @namespace    https://github.com/userscripts/instagram-lite
// @version      2.0.0
// @description  Reduces Instagram RAM: kills autoplay, unloads off-screen images, prunes old feed nodes, blocks ONLY telemetry/tracking. Core feed, DMs, and profiles all work normally.
// @author       instagram-lite
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     CONFIGURATION
  ───────────────────────────────────────────── */
  const CFG = {
    blockReels:          true,   // hide Reels nav link & rows
    blockStories:        false,  // set true to hide stories bar
    blockSuggested:      true,   // hide "Suggested for you" cards
    blockAds:            true,   // hide Sponsored posts
    pauseVideos:         true,   // no autoplay — click to play
    lazyImages:          true,   // unload off-screen images
    gcInterval:          30,     // seconds between GC sweeps
    maxFeedItems:        40,     // prune feed beyond this count
    blockTrackingPixels: true,   // nuke 1x1 spy images
    disableAnimations:   true,   // kill CSS transitions
  };

  /* ─────────────────────────────────────────────
     1. EARLY CSS — hide heavy UI before paint
  ───────────────────────────────────────────── */
  const css = `
    /* Reels nav + reel shelf */
    ${CFG.blockReels ? `
      a[href="/reels/"],
      a[href*="/reels"],
      svg[aria-label="Reels"] { display:none!important; }
    ` : ''}

    /* Stories bar */
    ${CFG.blockStories ? `
      div[role="menu"] > div:first-child > ul,
      section > div > div > div > ul { display:none!important; }
    ` : ''}

    /* Suggested for you */
    ${CFG.blockSuggested ? `
      div[data-testid="suggested-users-container"],
      aside div[style*="flex-direction: column"] { display:none!important; }
    ` : ''}

    /* Sponsored posts badge */
    ${CFG.blockAds ? `
      div[data-testid="ad_badge"] { display:none!important; }
    ` : ''}

    /* Kill all animations/transitions */
    ${CFG.disableAnimations ? `
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-delay:    0ms     !important;
        transition-duration:0.001ms !important;
        transition-delay:   0ms     !important;
      }
    ` : ''}

    /* Misc bloat */
    div[data-testid="PushNotifNudge"]  { display:none!important; }
  `;

  if (typeof GM_addStyle !== 'undefined') {
    GM_addStyle(css);
  } else {
    const s = document.createElement('style');
    s.textContent = css;
    document.documentElement.appendChild(s);
  }

  /* ─────────────────────────────────────────────
     2. NETWORK BLOCK — ONLY pure telemetry/tracking
     !! Do NOT block /graphql, /api/, /direct/
        Those are needed for feed, DMs, profiles.
  ───────────────────────────────────────────── */
  const BLOCK_PATTERNS = [
    // Facebook tracking pixels & signals only
    /pixel\.facebook\.com/,
    /connect\.facebook\.net\/[^/]+\/signals/,
    /connect\.facebook\.net\/[^/]+\/fbevents/,
    // Instagram internal logging endpoints only
    /\/logging_client_events/,
    /\/ajax\/bz/,
    /\/ajax\/nt\/logging/,
  ];

  function shouldBlock(url) {
    if (!url) return false;
    // Safety: never block graphql or direct (DMs)
    if (/\/(graphql|direct|api\/v1)\//i.test(url)) return false;
    return BLOCK_PATTERNS.some(p => p.test(url));
  }

  // Intercept fetch
  const _fetch = window.fetch;
  window.fetch = function (resource, init) {
    const url = typeof resource === 'string' ? resource : (resource?.url ?? '');
    if (shouldBlock(url)) {
      return Promise.resolve(new Response('{}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }));
    }
    return _fetch.apply(this, arguments);
  };

  // Intercept XHR
  const _xhrOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (method, url) {
    this._igUrl = url;
    return _xhrOpen.apply(this, arguments);
  };
  const _xhrSend = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.send = function () {
    if (shouldBlock(this._igUrl)) {
      const self = this;
      setTimeout(() => {
        Object.defineProperty(self, 'readyState',    { get: () => 4,    configurable: true });
        Object.defineProperty(self, 'status',        { get: () => 200,  configurable: true });
        Object.defineProperty(self, 'responseText',  { get: () => '{}', configurable: true });
        self.dispatchEvent(new Event('load'));
      }, 0);
      return;
    }
    return _xhrSend.apply(this, arguments);
  };

  /* ─────────────────────────────────────────────
     3. VIDEO — no autoplay, click to play
  ───────────────────────────────────────────── */
  function tameVideo(video) {
    if (video._igLite) return;
    video._igLite = true;
    video.autoplay = false;
    video.preload  = 'none';
    video.pause();

    video.addEventListener('play', () => {
      if (!video._igUserPlay) video.pause();
    });
    video.addEventListener('pointerdown', () => {
      video._igUserPlay = true;
    }, { capture: true });
  }

  /* ─────────────────────────────────────────────
     4. TRACKING PIXEL REMOVAL
  ───────────────────────────────────────────── */
  const BLANK_GIF = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEAAAAALAAAAAABAAEAAAI=';

  function nukePixels(root) {
    if (!CFG.blockTrackingPixels) return;
    const el = root.querySelectorAll ? root : document;
    el.querySelectorAll('img').forEach(img => {
      if ((img.width <= 2 || img.naturalWidth <= 2) && img.src && !img.src.startsWith('data:')) {
        img.src = BLANK_GIF;
        img.srcset = '';
      }
    });
  }

  /* ─────────────────────────────────────────────
     5. AD REMOVAL via DOM scan
        (CSS :contains isn't standard)
  ───────────────────────────────────────────── */
  function hideAds(root) {
    if (!CFG.blockAds) return;
    const el = root.querySelectorAll ? root : document;
    el.querySelectorAll('article span, article div').forEach(node => {
      if (node.childNodes.length === 1 && node.textContent.trim() === 'Sponsored') {
        const article = node.closest('article');
        if (article) article.style.display = 'none';
      }
    });
  }

  /* ─────────────────────────────────────────────
     6. LAZY IMAGE UNLOADING
     Swap off-screen images to 1-byte placeholder;
     restore when scrolled into view.
  ───────────────────────────────────────────── */
  let io = null;
  if (CFG.lazyImages) {
    io = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const img = entry.target;
        if (!entry.isIntersecting) {
          if (img.src && !img.src.startsWith('data:') && !img._igOrig) {
            img._igOrig = img.src;
            img.src = BLANK_GIF;
          }
        } else if (img._igOrig) {
          img.src = img._igOrig;
          delete img._igOrig;
        }
      });
    }, { rootMargin: '300px 0px', threshold: 0.01 });
  }

  function observeImages(root) {
    if (!io) return;
    const el = root.querySelectorAll ? root : document;
    el.querySelectorAll('article img, div[role="dialog"] img, main img').forEach(img => {
      if (!img._igObserved) {
        img._igObserved = true;
        io.observe(img);
      }
    });
  }

  /* ─────────────────────────────────────────────
     7. FEED NODE PRUNING
     Instagram's infinite scroll never removes old
     nodes — we do it for them.
  ───────────────────────────────────────────── */
  function pruneFeed() {
    const articles = document.querySelectorAll('main article');
    if (articles.length > CFG.maxFeedItems) {
      const stale = Array.from(articles).slice(0, articles.length - CFG.maxFeedItems);
      stale.forEach(el => {
        el.querySelectorAll('video').forEach(v => { v.pause(); v.src = ''; });
        el.remove();
      });
      console.log(`[IG Lite] pruned ${stale.length} stale feed nodes`);
    }
  }

  /* ─────────────────────────────────────────────
     8. MUTATION OBSERVER
  ───────────────────────────────────────────── */
  const mo = new MutationObserver(mutations => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.tagName === 'VIDEO') tameVideo(node);
        node.querySelectorAll?.('video').forEach(tameVideo);
        nukePixels(node);
        hideAds(node);
        observeImages(node);
      }
    }
  });

  mo.observe(document.documentElement, { childList: true, subtree: true });

  /* ─────────────────────────────────────────────
     9. PERIODIC GC SWEEP
  ───────────────────────────────────────────── */
  setInterval(() => {
    pruneFeed();
    nukePixels(document.body);
    hideAds(document.body);
    document.querySelectorAll('video').forEach(tameVideo);
    observeImages(document.body);
  }, CFG.gcInterval * 1000);

  /* ─────────────────────────────────────────────
     10. PAUSE ALL ON TAB HIDE
  ───────────────────────────────────────────── */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      document.querySelectorAll('video').forEach(v => {
        v._igUserPlay = false;
        v.pause();
      });
    }
  });

  console.log(
    '%c[IG Lite v2] Loaded — feed, DMs & profiles untouched',
    'background:#111;color:#22c55e;padding:3px 8px;border-radius:3px;font-weight:bold'
  );

})();
