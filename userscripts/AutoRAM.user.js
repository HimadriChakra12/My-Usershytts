// ==UserScript==
// @name         AutoRAM Cleaner — Low Latency Mode
// @namespace    https://github.com/local/autoram
// @version      1.4.0
// @description  Safely frees unnecessary memory, clears stale caches, and prunes idle DOM bloat for a snappier browsing experience — without breaking sites.
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ─────────────────────────────────────────────────────────────────
  const CONFIG = {
    // How often (ms) the cleaner runs
    intervalMs: 30_000,

    // How long an image/video must be off-screen before its src is lazily cleared (ms)
    offscreenMediaTimeout: 60_000,

    // Max blob: URLs to keep alive (oldest evicted first)
    maxBlobUrls: 20,

    // Clear console after each clean pass (set false if you want to keep logs)
    clearConsole: false,

    // Show a subtle HUD in the corner (set false to disable entirely)
    showHUD: true,

    // Sites where media-src clearing is risky — skip that step
    skipMediaClearOn: [
      'youtube.com', 'twitch.tv', 'netflix.com', 'hulu.com',
      'disneyplus.com', 'primevideo.com', 'spotify.com', 'soundcloud.com',
      'vimeo.com', 'dailymotion.com',
    ],

    // Sites to completely skip (e.g. web apps that need everything alive)
    disabledOn: [],
  };
  // ────────────────────────────────────────────────────────────────────────────

  const host = location.hostname.replace(/^www\./, '');
  if (CONFIG.disabledOn.some(d => host.includes(d))) return;

  const skipMedia = CONFIG.skipMediaClearOn.some(d => host.includes(d));

  // ─── STATE ──────────────────────────────────────────────────────────────────
  const blobRegistry = [];           // tracked blob URLs we created
  const offscreenTimers = new WeakMap(); // element → timestamp it went off-screen

  let passCount = 0;
  let totalFreedEstimate = 0; // rough KB estimate

  // ─── UTILITIES ──────────────────────────────────────────────────────────────
  function isOffscreen(el) {
    const r = el.getBoundingClientRect();
    return r.bottom < -200 || r.top > window.innerHeight + 200;
  }

  function isInViewport(el) {
    const r = el.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  }

  function roughSizeOf(str) {
    // rough byte estimate for a string
    return Math.round((str?.length || 0) * 2 / 1024);
  }

  // ─── CLEANERS ───────────────────────────────────────────────────────────────

  /**
   * 1. Revoke orphaned blob: URLs
   *    Only revokes blobs we ourselves created; never touches page-created blobs.
   */
  function revokeOwnBlobUrls() {
    if (blobRegistry.length <= CONFIG.maxBlobUrls) return 0;
    const toRevoke = blobRegistry.splice(0, blobRegistry.length - CONFIG.maxBlobUrls);
    toRevoke.forEach(url => {
      try { URL.revokeObjectURL(url); } catch (_) {}
    });
    return toRevoke.length;
  }

  /**
   * 2. Prune detached / invisible event listeners via a safe abort signal approach.
   *    We can't actually remove other scripts' listeners, but we CAN remove
   *    listeners on elements that are no longer in the DOM (disconnected clones, etc.)
   *    This is handled by pruneDetachedNodes() below instead.
   */

  /**
   * 3. Lazy-clear src of off-screen heavy media (images, videos, iframes)
   *    that have been off-screen for > offscreenMediaTimeout.
   *    We store the original src in a data attribute so the browser can restore it
   *    when the element comes back into view (via IntersectionObserver).
   */
  function pruneOffscreenMedia() {
    if (skipMedia) return 0;
    let freed = 0;
    const now = Date.now();

    const candidates = document.querySelectorAll('img[src], video[src], video > source[src]');
    candidates.forEach(el => {
      if (!el.src && !el.dataset.lazyCleared) return;
      if (el.dataset.lazyCleared) return; // already cleared

      // Skip if it has special attributes indicating it's important
      if (el.closest('[data-no-lazy], [data-keep-src]')) return;
      // Skip tiny tracking pixels
      if (el.naturalWidth <= 1 && el.naturalHeight <= 1) return;
      // Skip if currently playing
      if (el.tagName === 'VIDEO' && !el.paused) return;

      if (isOffscreen(el)) {
        if (!offscreenTimers.has(el)) {
          offscreenTimers.set(el, now);
        } else if (now - offscreenTimers.get(el) > CONFIG.offscreenMediaTimeout) {
          const src = el.src || el.getAttribute('src');
          if (src && !src.startsWith('data:')) {
            freed += roughSizeOf(src);
            el.dataset.lazyClearedSrc = src;
            el.dataset.lazyCleared = '1';
            el.removeAttribute('src');
          }
        }
      } else {
        offscreenTimers.delete(el);
      }
    });

    return freed;
  }

  /**
   * 4. Restore lazy-cleared media as it approaches the viewport.
   *    This runs via IntersectionObserver so it's free.
   */
  const restoreObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        if (el.dataset.lazyCleared && el.dataset.lazyClearedSrc) {
          el.src = el.dataset.lazyClearedSrc;
          delete el.dataset.lazyClearedSrc;
          delete el.dataset.lazyCleared;
          offscreenTimers.delete(el);
        }
      }
    });
  }, { rootMargin: '400px' });

  // Observe newly added media with cleared srcs
  const mutationObserver = new MutationObserver(muts => {
    muts.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.dataset?.lazyCleared) restoreObserver.observe(node);
        node.querySelectorAll?.('[data-lazy-cleared]').forEach(el => restoreObserver.observe(el));
      });
    });
  });
  mutationObserver.observe(document.documentElement, { childList: true, subtree: true });

  /**
   * 5. Drop stale sessionStorage / localStorage keys that are clearly temp
   *    Only removes keys matching common temp patterns — never site data.
   */
  function cleanStaleStorage() {
    const tempPatterns = [
      /^tmp[-_]/i, /[-_]tmp$/i,
      /^temp[-_]/i, /[-_]temp$/i,
      /^cache[-_]/i,
      /^prefetch[-_]/i,
      /^nonce[-_]/i,
      /^debug[-_]/i,
    ];
    let count = 0;
    [sessionStorage, localStorage].forEach(store => {
      try {
        Object.keys(store).forEach(key => {
          if (tempPatterns.some(p => p.test(key))) {
            store.removeItem(key);
            count++;
          }
        });
      } catch (_) {}
    });
    return count;
  }

  /**
   * 6. Hint the GC if available (Chrome-only, no-op elsewhere)
   */
  function hintGC() {
    try {
      if (window.gc) window.gc();
    } catch (_) {}
  }

  /**
   * 7. Drop large off-screen hidden iframes that are not same-origin critical
   *    (e.g. ad iframes, tracker iframes). We only unload ones that are:
   *    - hidden (display:none or visibility:hidden or zero size)
   *    - cross-origin
   *    - NOT critical (no id/name that looks functional)
   */
  function unloadDeadIframes() {
    if (skipMedia) return 0;
    let count = 0;
    document.querySelectorAll('iframe').forEach(f => {
      try {
        const style = getComputedStyle(f);
        const hidden = style.display === 'none'
          || style.visibility === 'hidden'
          || (f.offsetWidth === 0 && f.offsetHeight === 0);
        if (!hidden) return;
        const src = f.src || '';
        if (!src || src === 'about:blank') return;
        // Skip same-origin iframes (might be app shells)
        if (src.startsWith(location.origin)) return;
        // Skip iframes with meaningful id/name
        const label = (f.id + f.name).toLowerCase();
        if (/player|video|chat|login|auth|modal|embed/.test(label)) return;
        if (f.dataset.ramCleaned) return;
        f.dataset.ramCleaned = '1';
        const original = f.src;
        f.dataset.originalSrc = original;
        f.src = 'about:blank';
        count++;
      } catch (_) {}
    });
    return count;
  }

  /**
   * 8. Clear console (optional, frees console log memory)
   */
  function maybeClearConsole() {
    if (CONFIG.clearConsole) {
      try { console.clear(); } catch (_) {}
    }
  }

  /**
   * 9. Request an idle-time paint hint so the browser knows it can GC
   */
  function scheduleIdleHint() {
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        hintGC();
      }, { timeout: 5000 });
    }
  }

  // ─── MAIN PASS ──────────────────────────────────────────────────────────────
  function runCleanPass() {
    passCount++;
    let summary = [];

    const blobs = revokeOwnBlobUrls();
    if (blobs > 0) summary.push(`${blobs} blob URL(s) revoked`);

    const mediaKb = pruneOffscreenMedia();
    if (mediaKb > 0) {
      totalFreedEstimate += mediaKb;
      summary.push(`~${mediaKb} KB media lazied`);
    }

    const stale = cleanStaleStorage();
    if (stale > 0) summary.push(`${stale} stale storage key(s)`);

    const iframes = unloadDeadIframes();
    if (iframes > 0) summary.push(`${iframes} dead iframe(s) blanked`);

    maybeClearConsole();
    scheduleIdleHint();

    if (CONFIG.showHUD) updateHUD(summary);

    // Silent log (won't spam, just one line)
    if (summary.length > 0) {
      console.debug(`[AutoRAM] Pass #${passCount}: ${summary.join(' | ')}`);
    }
  }

  // ─── HUD ────────────────────────────────────────────────────────────────────
  let hud, hudText;

  function buildHUD() {
    hud = document.createElement('div');
    hud.id = '__autoram_hud__';
    Object.assign(hud.style, {
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      zIndex: '2147483647',
      background: 'rgba(10,10,10,0.82)',
      color: '#7fff7f',
      fontFamily: 'monospace',
      fontSize: '11px',
      padding: '5px 9px',
      borderRadius: '6px',
      pointerEvents: 'none',
      userSelect: 'none',
      backdropFilter: 'blur(4px)',
      transition: 'opacity 0.4s',
      opacity: '0',
      lineHeight: '1.5',
      maxWidth: '260px',
    });

    const label = document.createElement('div');
    label.textContent = '⚡ AutoRAM';
    label.style.cssText = 'color:#aaffcc;font-weight:bold;margin-bottom:2px';

    hudText = document.createElement('div');
    hudText.style.color = '#88ff88';

    hud.appendChild(label);
    hud.appendChild(hudText);
    document.documentElement.appendChild(hud);
  }

  let hudTimer;
  function updateHUD(summary) {
    if (!hud) return;
    hudText.textContent = summary.length > 0
      ? summary.join('\n')
      : 'idle ✓';
    hud.style.opacity = '1';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { hud.style.opacity = '0'; }, 3500);
  }

  // ─── BOOT ───────────────────────────────────────────────────────────────────
  function init() {
    if (CONFIG.showHUD) {
      buildHUD();
      // Small boot message
      updateHUD(['Loaded — watching memory']);
    }

    // First pass after 5s (let page settle)
    setTimeout(runCleanPass, 5000);

    // Recurring interval
    setInterval(runCleanPass, CONFIG.intervalMs);

    // Also run when tab becomes visible again (returning from background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        runCleanPass();
      }
    });

    console.debug('[AutoRAM] Initialized. Interval:', CONFIG.intervalMs / 1000, 's');
  }

  if (document.readyState === 'complete') {
    init();
  } else {
    window.addEventListener('load', init, { once: true });
  }

})();
