// ==UserScript==
// @name         AutoRAM Cleaner ☢ Nuclear Edition
// @namespace    https://github.com/local/autoram
// @version      3.0.0
// @description  Deep-cleans RAM, nukes stale Cache API entries, purges dead DOM, pauses off-screen animations, and auto-reloads idle tabs eating memory.
// @author       You
// @match        *://*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CONFIG
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const CFG = {

    // ── Intervals ─────────────────────────────────────────────────────────────
    cleanIntervalMs:      8_000,    // main clean pass every 8 seconds
    idleCheckIntervalMs: 15_000,    // idle check every 15 seconds
    cachePurgeIntervalMs:60_000,    // Cache API purge every 60 seconds

    // ── Idle Tab Auto-Reload ───────────────────────────────────────────────────
    enableIdleReload:   true,
    idleReloadAfterMs:  5 * 60_000, // reload after 5 min idle (background tab only)
    idleReloadMinRamMB: 100,        // only reload if JS heap > this (MB)
    reloadGraceMs:      4_000,      // countdown before reload (user can move mouse to cancel)

    // ── Cache API Purge ────────────────────────────────────────────────────────
    enableCachePurge:   true,
    // Cache names matching these patterns are KEPT (site-critical caches)
    keepCachePatterns:  [/workbox/i, /precache/i, /runtime/i, /critical/i, /shell/i],

    // ── RAM Thresholds (MB) ────────────────────────────────────────────────────
    ramWarnMB:          200,        // HUD turns orange
    ramCritMB:          400,        // HUD turns red + deeper clean

    // ── Media / DOM ───────────────────────────────────────────────────────────
    offscreenTimeoutMs: 10_000,     // clear off-screen media after 10s
    maxBlobUrls:        5,
    freezeAnims:        true,       // pause CSS animations on off-screen elements
    pruneGhostNodes:    true,       // remove empty ghost nodes left by trackers

    // ── Misc ──────────────────────────────────────────────────────────────────
    clearConsole:       true,
    showHUD:            true,

    // Sites where aggressively clearing media src could break things
    skipMediaOn: [
      'youtube.com','twitch.tv','netflix.com','hulu.com','disneyplus.com',
      'primevideo.com','spotify.com','soundcloud.com','vimeo.com','dailymotion.com',
    ],

    // Completely opt-out these hosts
    disabledOn: [],
  };
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const host      = location.hostname.replace(/^www\./, '');
  if (CFG.disabledOn.some(d => host.includes(d))) return;
  const skipMedia = CFG.skipMediaOn.some(d => host.includes(d));

  // ── State ──────────────────────────────────────────────────────────────────
  const blobReg     = [];
  const offTimers   = new WeakMap();
  const frozenAnims = new WeakSet();
  const ghostSeen   = new WeakMap();

  let passCount       = 0;
  let lastActivity    = Date.now();
  let reloadCountdown = null;
  let hud, hudRamRow, hudStatus, hudBody;

  // ── Helpers ────────────────────────────────────────────────────────────────
  const vph = () => window.innerHeight;

  function isOffscreen(el) {
    const r = el.getBoundingClientRect();
    return r.bottom < -100 || r.top > vph() + 100;
  }

  function heapMB()      { return performance?.memory ? Math.round(performance.memory.usedJSHeapSize  / 1_048_576) : null; }
  function heapTotalMB() { return performance?.memory ? Math.round(performance.memory.totalJSHeapSize / 1_048_576) : null; }

  function ramColor(mb) {
    return mb > CFG.ramCritMB ? '#ff4040' : mb > CFG.ramWarnMB ? '#ffaa22' : '#44ff88';
  }

  function bar10(used, total) {
    const pct    = Math.min(100, Math.round(used / total * 100));
    const filled = Math.round(pct / 10);
    return { str: '█'.repeat(filled) + '░'.repeat(10 - filled), pct };
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 1 — Revoke own blob URLs
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function revokeBlobs() {
    if (blobReg.length <= CFG.maxBlobUrls) return 0;
    return blobReg
      .splice(0, blobReg.length - CFG.maxBlobUrls)
      .reduce((n, u) => { try { URL.revokeObjectURL(u); return n + 1; } catch (_) { return n; } }, 0);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 2 — Lazy-clear off-screen media src
  //              Restored automatically via IntersectionObserver
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const restoreIO = new IntersectionObserver(entries => {
    entries.forEach(({ isIntersecting, target: el }) => {
      if (!isIntersecting) return;
      if (el.dataset.ramSrc) {
        el.src = el.dataset.ramSrc;
        delete el.dataset.ramSrc;
        delete el.dataset.ramLazy;
        offTimers.delete(el);
      }
      if (frozenAnims.has(el)) {
        el.style.animationPlayState = el.dataset.ramAnim || '';
        delete el.dataset.ramAnim;
        frozenAnims.delete(el);
      }
      restoreIO.unobserve(el);
    });
  }, { rootMargin: '350px' });

  function clearOffscreenMedia() {
    if (skipMedia) return 0;
    const now = Date.now();
    let n = 0;
    document.querySelectorAll('img[src],video[src],video>source[src]').forEach(el => {
      if (el.dataset.ramLazy) return;
      if (el.closest('[data-no-lazy],[data-keep-src]')) return;
      if ((el.naturalWidth ?? 2) <= 1) return;
      if (el.tagName === 'VIDEO' && !el.paused) return;
      if (!isOffscreen(el)) { offTimers.delete(el); return; }

      const t = offTimers.get(el);
      if (!t) { offTimers.set(el, now); return; }
      if (now - t < CFG.offscreenTimeoutMs) return;

      const src = el.src || el.getAttribute('src') || '';
      if (!src || src.startsWith('data:')) return;

      el.dataset.ramSrc  = src;
      el.dataset.ramLazy = '1';
      el.removeAttribute('src');
      restoreIO.observe(el);
      n++;
    });
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 3 — Pause CSS animations on off-screen elements
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function freezeOffscreenAnimations() {
    if (!CFG.freezeAnims) return 0;
    let n = 0;
    const sel = '[style*="animation"],[class*="anim"],[class*="spin"],[class*="pulse"],[class*="rotate"],[class*="blink"],[class*="fade"],[class*="loop"]';
    document.querySelectorAll(sel).forEach(el => {
      if (frozenAnims.has(el) || !isOffscreen(el)) return;
      el.dataset.ramAnim            = el.style.animationPlayState || 'running';
      el.style.animationPlayState   = 'paused';
      frozenAnims.add(el);
      restoreIO.observe(el);
      n++;
    });
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 4 — Nuke stale localStorage / sessionStorage
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const STALE_KEYS = [
    /^tmp[-_]/i,   /[-_]tmp$/i,
    /^temp[-_]/i,  /[-_]temp$/i,
    /^cache[-_]/i, /[-_]cache$/i,
    /^prefetch/i,  /^nonce[-_]/i,
    /^debug[-_]/i, /^log[-_]/i,
    /^perf[-_]/i,  /^beacon/i,
    /^_ga/i,       /^_pk_/i,
    /^utmz/i,      /^__utm/i,
    /^amp-/i,
  ];

  function cleanStorage() {
    let n = 0;
    const now = Date.now();
    [sessionStorage, localStorage].forEach(store => {
      try {
        [...Object.keys(store)].forEach(key => {
          if (STALE_KEYS.some(p => p.test(key))) { store.removeItem(key); n++; return; }
          try {
            const raw = store.getItem(key);
            if (!raw || raw[0] !== '{') return;
            const obj = JSON.parse(raw);
            const exp = obj.expires ?? obj.expiry ?? obj.exp ?? obj.ttl;
            if (typeof exp === 'number' && exp < now) { store.removeItem(key); n++; }
          } catch (_) {}
        });
      } catch (_) {}
    });
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 5 — Blank hidden cross-origin iframes
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function blankDeadIframes() {
    if (skipMedia) return 0;
    let n = 0;
    document.querySelectorAll('iframe:not([data-ram-blank])').forEach(f => {
      try {
        const cs = getComputedStyle(f);
        const hidden = cs.display === 'none'
          || cs.visibility === 'hidden'
          || (f.offsetWidth === 0 && f.offsetHeight === 0);
        if (!hidden) return;
        const src = f.src || '';
        if (!src || src === 'about:blank') return;
        if (src.startsWith(location.origin)) return;
        const lbl = (f.id + f.name).toLowerCase();
        if (/player|video|chat|login|auth|modal|embed|oauth/.test(lbl)) return;
        f.dataset.ramBlank   = '1';
        f.dataset.ramOrigSrc = src;
        f.src = 'about:blank';
        n++;
      } catch (_) {}
    });
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 6 — Remove empty ghost / sentinel nodes
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function pruneGhostNodes() {
    if (!CFG.pruneGhostNodes) return 0;
    let n = 0;
    const now = Date.now();
    document.querySelectorAll('span:empty,div:empty,p:empty').forEach(el => {
      if (el.id || el.className || el.childNodes.length || !isOffscreen(el)) return;
      const seen = ghostSeen.get(el);
      if (!seen) { ghostSeen.set(el, now); return; }
      if (now - seen > 90_000) { try { el.remove(); n++; } catch (_) {} }
    });
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 7 — ★ Cache API Purge
  //  Deletes stale Cache API caches (service worker / PWA leftovers).
  //  Keeps caches matching keepCachePatterns.
  //  For kept caches, sweeps entries older than 24h by response Date header.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async function purgeCacheAPI() {
    if (!CFG.enableCachePurge || !('caches' in window)) return 0;
    let n = 0;
    try {
      const names = await caches.keys();
      await Promise.all(names.map(async name => {
        if (!CFG.keepCachePatterns.some(p => p.test(name))) {
          await caches.delete(name); n++; return;
        }
        try {
          const cache  = await caches.open(name);
          const keys   = await cache.keys();
          const cutoff = Date.now() - 86_400_000; // 24h
          await Promise.all(keys.map(async req => {
            try {
              const res  = await cache.match(req);
              if (!res) return;
              const date = res.headers.get('date');
              if (date && new Date(date).getTime() < cutoff) { await cache.delete(req); n++; }
            } catch (_) {}
          }));
        } catch (_) {}
      }));
    } catch (_) {}
    return n;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 8 — ★ RAM Pressure Nuke
  //  Fires every available browser knob to release memory pressure.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function nukeRAM() {
    // Explicit GC (Chrome --expose-gc / DevTools open)
    try { if (window.gc) window.gc(); } catch (_) {}

    // Idle-time GC + harmless layout flush to release pending style cache
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => {
        try { if (window.gc) window.gc(); } catch (_) {}
        void document.documentElement.offsetHeight;
      }, { timeout: 1500 });
    }

    // Flush PerformanceEntry buffers (megabytes on heavy SPAs)
    try {
      performance.clearResourceTimings?.();
      performance.clearMarks?.();
      performance.clearMeasures?.();
    } catch (_) {}

    // Console buffer
    if (CFG.clearConsole) { try { console.clear(); } catch (_) {} }
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  CLEANER 9 — ★ Idle Tab Auto-Reload
  //  Reloads ONLY background tabs, ONLY when idle > idleReloadAfterMs
  //  AND heap > idleReloadMinRamMB. Moving the mouse cancels it.
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function bumpActivity() { lastActivity = Date.now(); }

  ['mousemove','keydown','mousedown','touchstart','scroll','click','wheel']
    .forEach(e => window.addEventListener(e, bumpActivity, { passive: true }));

  function checkIdleReload() {
    if (!CFG.enableIdleReload || reloadCountdown) return;
    if (document.visibilityState !== 'hidden') return; // background only

    const idle = Date.now() - lastActivity;
    if (idle < CFG.idleReloadAfterMs) return;

    const mb = heapMB();
    if (mb === null || mb < CFG.idleReloadMinRamMB) return;

    const mins = Math.round(idle / 60_000);
    setStatus(`♻ Idle ${mins}min · ${mb}MB → reloading in ${CFG.reloadGraceMs / 1000}s…`, 8000);

    reloadCountdown = setTimeout(() => {
      if (Date.now() - lastActivity < CFG.idleReloadAfterMs / 2) {
        reloadCountdown = null;
        setStatus('↩ Reload cancelled — user returned');
        return;
      }
      location.reload();
    }, CFG.reloadGraceMs);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && reloadCountdown) {
      clearTimeout(reloadCountdown);
      reloadCountdown = null;
      setStatus('↩ Reload cancelled — tab focused');
    }
    if (document.visibilityState === 'visible') runPass();
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  MAIN PASSES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function runPass() {
    passCount++;
    const log = [];
    const b = revokeBlobs();                if (b) log.push(`${b} blob(s)`);
    const m = clearOffscreenMedia();        if (m) log.push(`${m} media`);
    const a = freezeOffscreenAnimations();  if (a) log.push(`${a} anim(s)`);
    const s = cleanStorage();               if (s) log.push(`${s} stale keys`);
    const f = blankDeadIframes();           if (f) log.push(`${f} iframe(s)`);
    const g = pruneGhostNodes();            if (g) log.push(`${g} ghost(s)`);
    nukeRAM();
    const mb = heapMB();
    if (mb && mb > CFG.ramCritMB) log.push(`⚠ ${mb}MB!`);
    updateHUD(log);
  }

  async function runCachePurge() {
    const n = await purgeCacheAPI();
    if (n > 0) setStatus(`🗑 ${n} cache entr(ies) purged`);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  HUD
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function buildHUD() {
    hud = document.createElement('div');
    Object.assign(hud.style, {
      position: 'fixed', bottom: '12px', right: '12px',
      zIndex: '2147483647',
      background: 'rgba(6,8,14,0.93)',
      fontFamily: '"Cascadia Code",Consolas,"Courier New",monospace',
      fontSize: '11px', lineHeight: '1.65',
      padding: '8px 12px', borderRadius: '9px',
      pointerEvents: 'none', userSelect: 'none',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(80,255,140,0.16)',
      boxShadow: '0 4px 28px rgba(0,0,0,0.65)',
      transition: 'opacity 0.5s', opacity: '0',
      minWidth: '210px', maxWidth: '300px',
    });

    const title = Object.assign(document.createElement('div'), { textContent: '☢ AutoRAM Nuclear' });
    Object.assign(title.style, {
      color: '#55ffaa', fontWeight: 'bold', fontSize: '11.5px',
      borderBottom: '1px solid rgba(80,255,140,0.18)',
      paddingBottom: '3px', marginBottom: '4px',
    });

    hudRamRow = document.createElement('div');
    hudStatus  = document.createElement('div');
    hudBody    = document.createElement('div');
    hudStatus.style.cssText = 'color:#77ccaa;font-size:10.5px';
    hudBody.style.cssText   = 'color:#446655;font-size:10px;margin-top:2px;word-break:break-word';

    hud.append(title, hudRamRow, hudStatus, hudBody);
    document.documentElement.appendChild(hud);
  }

  let hudTimer;
  function flashHUD(ms = 4000) {
    if (!hud) return;
    hud.style.opacity = '1';
    clearTimeout(hudTimer);
    hudTimer = setTimeout(() => { if (hud) hud.style.opacity = '0'; }, ms);
  }

  function setStatus(msg, ms = 5000) {
    if (!CFG.showHUD || !hudStatus) return;
    hudStatus.textContent = msg;
    flashHUD(ms);
  }

  function updateHUD(lines) {
    if (!CFG.showHUD || !hud) return;
    const used  = heapMB();
    const total = heapTotalMB();
    if (used !== null && total) {
      const { str, pct } = bar10(used, total);
      const col = ramColor(used);
      hudRamRow.innerHTML = '';
      const b1 = Object.assign(document.createElement('span'), { textContent: str });
      const b2 = Object.assign(document.createElement('span'), { textContent: ` ${used}/${total}MB (${pct}%)` });
      b1.style.color = b2.style.color = col;
      hudRamRow.append(b1, b2);
    } else {
      hudRamRow.textContent = '(heap API unavailable)';
      hudRamRow.style.color = '#445';
    }
    const idleSec = Math.round((Date.now() - lastActivity) / 1000);
    const idleStr = idleSec >= 60
      ? `${Math.floor(idleSec/60)}m${String(idleSec%60).padStart(2,'0')}s`
      : `${idleSec}s`;
    hudStatus.textContent = `Pass #${passCount} · idle ${idleStr}`;
    hudBody.textContent   = lines.length ? lines.join(' · ') : '✓ clean';
    flashHUD(lines.length ? 5000 : 2000);
  }

  // Watch for newly-added lazy-cleared nodes needing restore observation
  new MutationObserver(muts => {
    muts.forEach(m => m.addedNodes.forEach(n => {
      if (n.nodeType !== 1) return;
      if (n.dataset?.ramLazy) restoreIO.observe(n);
      n.querySelectorAll?.('[data-ram-lazy]').forEach(el => restoreIO.observe(el));
    }));
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  BOOT
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  function init() {
    if (CFG.showHUD) { buildHUD(); setStatus('☢ Nuclear mode active', 3000); }

    setTimeout(runPass,       2_000);   // first clean pass
    setTimeout(runCachePurge, 4_000);   // first cache purge

    setInterval(runPass,         CFG.cleanIntervalMs);
    setInterval(runCachePurge,   CFG.cachePurgeIntervalMs);
    setInterval(checkIdleReload, CFG.idleCheckIntervalMs);

    // After scroll settles
    let sd;
    window.addEventListener('scroll', () => {
      clearTimeout(sd); sd = setTimeout(runPass, 1_200);
    }, { passive: true });

    // Browser memory pressure event (Chrome 89+)
    if ('onmemorywarning' in window) {
      window.addEventListener('memorywarning', () => {
        setStatus('⚠ Memory pressure! Sweeping…', 6000);
        runPass(); runCachePurge();
      });
    }
  }

  if (document.readyState === 'complete') init();
  else window.addEventListener('load', init, { once: true });

})();
