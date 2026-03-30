// ==UserScript==
// @name         Instagram iCal Blocker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Instagram is always blocked. Add an "Instagram Block" event to Google Calendar to unblock it.
// @author       You
// @match        https://www.instagram.com/*
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────
  // Google Calendar → Settings → your calendar
  // → "Secret address in iCal format" → paste below
  const ICAL_URL       = 'https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics'; // ← paste here
  const UNBLOCK_KW     = 'instagram block';    // event title keyword (case-insensitive)
  const CHECK_INTERVAL = 60000;                // recheck every 60s
  // ──────────────────────────────────────────────────────────────────────

  let lastUnblocked = null; // null = unknown, true = unblocked, false = blocked

  // ── iCal parser ───────────────────────────────────────────────────────

  function parseICalDate(str) {
    if (!str) return null;
    str = str.trim().replace(/^VALUE=DATE(-TIME)?:/, '');
    if (str.length === 8) {
      return new Date(
        parseInt(str.slice(0, 4)),
        parseInt(str.slice(4, 6)) - 1,
        parseInt(str.slice(6, 8))
      );
    }
    const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8);
    const h = str.slice(9, 11), mi = str.slice(11, 13), s = str.slice(13, 15);
    return str.endsWith('Z')
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
      : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  }

  function expandRRule(dtstart, rrule, now) {
    if (!rrule) return false;
    const freq  = (rrule.match(/FREQ=(\w+)/) || [])[1];
    const byday = (rrule.match(/BYDAY=([\w,]+)/) || [])[1];
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    if (freq === 'DAILY') return true;
    if (freq === 'WEEKLY') {
      const days = byday
        ? byday.split(',').map(d => dayMap[d.slice(-2)])
        : [dtstart.getDay()];
      return days.includes(now.getDay());
    }
    return false;
  }

  function isEventActiveNow(ev, now) {
    const { dtstart, dtend, rrule, duration } = ev;
    if (!dtstart) return false;
    const start = new Date(dtstart);
    let end = dtend ? new Date(dtend) : null;
    if (!end && duration) {
      const dh = +(duration.match(/(\d+)H/) || [,0])[1];
      const dm = +(duration.match(/(\d+)M/) || [,0])[1];
      end = new Date(start.getTime() + (dh * 3600 + dm * 60) * 1000);
    }
    if (!end) end = new Date(start.getTime() + 3600000);

    if (rrule) {
      if (!expandRRule(start, rrule, now)) return false;
      const todayStart = new Date(now);
      todayStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      const todayEnd = new Date(todayStart.getTime() + (end - start));
      return now >= todayStart && now < todayEnd;
    }
    return now >= start && now < end;
  }

  function parseIcal(text) {
    const events = [];
    const lines  = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT')      { cur = {}; }
      else if (line === 'END:VEVENT' && cur) { events.push(cur); cur = null; }
      else if (cur) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).toUpperCase();
        const val = line.slice(colon + 1);
        if      (key === 'SUMMARY')             cur.summary  = val;
        else if (key.startsWith('DTSTART'))     cur.dtstart  = parseICalDate(val);
        else if (key.startsWith('DTEND'))       cur.dtend    = parseICalDate(val);
        else if (key === 'DURATION')            cur.duration = val;
        else if (key === 'RRULE')               cur.rrule    = val;
      }
    }
    return events;
  }

  // ── Block screen ───────────────────────────────────────────────────────

function blockPage() {
  // Wait for DOM to be ready if needed
  function inject() {
    // Remove any existing overlay first
    const existing = document.getElementById('__ig_block__');
    if (existing) return;

    const div = document.createElement('div');
    div.id = '__ig_block__';
    div.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:#0d0d0d;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#fff;text-align:center;
    `;

    div.innerHTML = `
      <div style="max-width:320px;width:90%;padding:20px 0;">
        <div style="width:72px;height:72px;margin:0 auto 28px;">
          <svg viewBox="0 0 72 72" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="56" height="56" rx="16" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
            <rect x="22" y="22" width="28" height="28" rx="8" fill="none" stroke="#333" stroke-width="2"/>
            <circle cx="36" cy="36" r="7" fill="none" stroke="#444" stroke-width="2"/>
            <circle cx="44.5" cy="27.5" r="2" fill="#444"/>
            <line x1="14" y1="14" x2="58" y2="58" stroke="#c0392b" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="font-size:11px;letter-spacing:.12em;color:#555;text-transform:uppercase;margin-bottom:12px;">Access restricted</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px;line-height:1.3;">Instagram is blocked</div>
        <div style="font-size:14px;color:#666;line-height:1.7;margin-bottom:28px;">
          No screen time scheduled. Add an <span style="color:#888;font-style:italic;">Instagram Block</span> event in Google Calendar to unlock.
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
          <div style="height:1px;width:40px;background:#222;"></div>
          <div style="font-size:12px;color:#444;">next check in</div>
          <div style="height:1px;width:40px;background:#222;"></div>
        </div>
        <div id="__ig_cd__" style="font-size:38px;font-weight:700;letter-spacing:-1px;">1:00</div>
        <div style="font-size:12px;color:#444;margin-top:4px;">seconds</div>
        <div style="margin-top:32px;padding:14px 20px;background:#111;border:1px solid #1e1e1e;border-radius:12px;">
          <div style="font-size:11px;color:#444;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;">How to unblock</div>
          <div style="font-size:13px;color:#666;line-height:1.6;">
            Google Calendar → New event<br>
            Title: <span style="color:#888;font-style:italic;">"Instagram Block"</span>
          </div>
        </div>
      </div>
    `;

    // Append to body, or html if body not ready
    (document.body || document.documentElement).appendChild(div);

    // Hide everything else
    document.body && (document.body.style.overflow = 'hidden');

    // Countdown timer
    let s = 60;
    const cd = document.getElementById('__ig_cd__');
    const timer = setInterval(() => {
      s--;
      if (!document.getElementById('__ig_block__')) { clearInterval(timer); return; }
      if (s <= 0) { clearInterval(timer); cd && (cd.textContent = '0:00'); return; }
      cd && (cd.textContent = '0:' + ('0' + s).slice(-2));
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
}

  function notify(text, title) {
    GM_notification({ title, text, timeout: 5000 });
  }

  // ── Core logic ─────────────────────────────────────────────────────────

  function applyState(unblocked) {
    if (unblocked && lastUnblocked !== true) {
      lastUnblocked = true;
      notify('Instagram UNBLOCKED — calendar event is active.', '✅ Unblocked');
      // Page will load normally on next navigation; reload if currently blocked
      if (document.title === '' || document.body == null) location.reload();
    } else if (!unblocked && lastUnblocked !== false) {
      lastUnblocked = false;
      notify('Instagram BLOCKED — no active unblock event.', '🚫 Blocked');
      blockPage();
    } else if (!unblocked) {
      blockPage(); // re-block every navigation
    }
  }

  function run() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: ICAL_URL,
      onload(resp) {
        const events = parseIcal(resp.responseText);
        const now    = new Date();
        const unblocked = events.some(ev =>
          (ev.summary || '').toLowerCase().includes(UNBLOCK_KW) &&
          isEventActiveNow(ev, now)
        );
        applyState(unblocked);
      },
      onerror(e) {
        console.warn('[IGBlocker] iCal fetch failed — keeping current state', e);
        // Fail safe: if we can't reach calendar, keep blocked
        if (lastUnblocked !== true) blockPage();
      }
    });
  }

  // Initial check + periodic + on tab focus
  run();
  setInterval(run, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

})();// ==UserScript==
// @name         Instagram iCal Blocker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Instagram is always blocked. Add an "Instagram Block" event to Google Calendar to unblock it.
// @author       You
// @match        https://www.instagram.com/*
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────
  // Google Calendar → Settings → your calendar
  // → "Secret address in iCal format" → paste below
  const ICAL_URL       = 'https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics'; // ← paste here
  const UNBLOCK_KW     = 'instagram block';    // event title keyword (case-insensitive)
  const CHECK_INTERVAL = 60000;                // recheck every 60s
  // ──────────────────────────────────────────────────────────────────────

  let lastUnblocked = null; // null = unknown, true = unblocked, false = blocked

  // ── iCal parser ───────────────────────────────────────────────────────

  function parseICalDate(str) {
    if (!str) return null;
    str = str.trim().replace(/^VALUE=DATE(-TIME)?:/, '');
    if (str.length === 8) {
      return new Date(
        parseInt(str.slice(0, 4)),
        parseInt(str.slice(4, 6)) - 1,
        parseInt(str.slice(6, 8))
      );
    }
    const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8);
    const h = str.slice(9, 11), mi = str.slice(11, 13), s = str.slice(13, 15);
    return str.endsWith('Z')
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
      : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  }

  function expandRRule(dtstart, rrule, now) {
    if (!rrule) return false;
    const freq  = (rrule.match(/FREQ=(\w+)/) || [])[1];
    const byday = (rrule.match(/BYDAY=([\w,]+)/) || [])[1];
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    if (freq === 'DAILY') return true;
    if (freq === 'WEEKLY') {
      const days = byday
        ? byday.split(',').map(d => dayMap[d.slice(-2)])
        : [dtstart.getDay()];
      return days.includes(now.getDay());
    }
    return false;
  }

  function isEventActiveNow(ev, now) {
    const { dtstart, dtend, rrule, duration } = ev;
    if (!dtstart) return false;
    const start = new Date(dtstart);
    let end = dtend ? new Date(dtend) : null;
    if (!end && duration) {
      const dh = +(duration.match(/(\d+)H/) || [,0])[1];
      const dm = +(duration.match(/(\d+)M/) || [,0])[1];
      end = new Date(start.getTime() + (dh * 3600 + dm * 60) * 1000);
    }
    if (!end) end = new Date(start.getTime() + 3600000);

    if (rrule) {
      if (!expandRRule(start, rrule, now)) return false;
      const todayStart = new Date(now);
      todayStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      const todayEnd = new Date(todayStart.getTime() + (end - start));
      return now >= todayStart && now < todayEnd;
    }
    return now >= start && now < end;
  }

  function parseIcal(text) {
    const events = [];
    const lines  = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT')      { cur = {}; }
      else if (line === 'END:VEVENT' && cur) { events.push(cur); cur = null; }
      else if (cur) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).toUpperCase();
        const val = line.slice(colon + 1);
        if      (key === 'SUMMARY')             cur.summary  = val;
        else if (key.startsWith('DTSTART'))     cur.dtstart  = parseICalDate(val);
        else if (key.startsWith('DTEND'))       cur.dtend    = parseICalDate(val);
        else if (key === 'DURATION')            cur.duration = val;
        else if (key === 'RRULE')               cur.rrule    = val;
      }
    }
    return events;
  }

  // ── Block screen ───────────────────────────────────────────────────────

function blockPage() {
  // Wait for DOM to be ready if needed
  function inject() {
    // Remove any existing overlay first
    const existing = document.getElementById('__ig_block__');
    if (existing) return;

    const div = document.createElement('div');
    div.id = '__ig_block__';
    div.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:#0d0d0d;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#fff;text-align:center;
    `;

    div.innerHTML = `
      <div style="max-width:320px;width:90%;padding:20px 0;">
        <div style="width:72px;height:72px;margin:0 auto 28px;">
          <svg viewBox="0 0 72 72" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="56" height="56" rx="16" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
            <rect x="22" y="22" width="28" height="28" rx="8" fill="none" stroke="#333" stroke-width="2"/>
            <circle cx="36" cy="36" r="7" fill="none" stroke="#444" stroke-width="2"/>
            <circle cx="44.5" cy="27.5" r="2" fill="#444"/>
            <line x1="14" y1="14" x2="58" y2="58" stroke="#c0392b" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="font-size:11px;letter-spacing:.12em;color:#555;text-transform:uppercase;margin-bottom:12px;">Access restricted</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px;line-height:1.3;">Instagram is blocked</div>
        <div style="font-size:14px;color:#666;line-height:1.7;margin-bottom:28px;">
          No screen time scheduled. Add an <span style="color:#888;font-style:italic;">Instagram Block</span> event in Google Calendar to unlock.
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
          <div style="height:1px;width:40px;background:#222;"></div>
          <div style="font-size:12px;color:#444;">next check in</div>
          <div style="height:1px;width:40px;background:#222;"></div>
        </div>
        <div id="__ig_cd__" style="font-size:38px;font-weight:700;letter-spacing:-1px;">1:00</div>
        <div style="font-size:12px;color:#444;margin-top:4px;">seconds</div>
        <div style="margin-top:32px;padding:14px 20px;background:#111;border:1px solid #1e1e1e;border-radius:12px;">
          <div style="font-size:11px;color:#444;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;">How to unblock</div>
          <div style="font-size:13px;color:#666;line-height:1.6;">
            Google Calendar → New event<br>
            Title: <span style="color:#888;font-style:italic;">"Instagram Block"</span>
          </div>
        </div>
      </div>
    `;

    // Append to body, or html if body not ready
    (document.body || document.documentElement).appendChild(div);

    // Hide everything else
    document.body && (document.body.style.overflow = 'hidden');

    // Countdown timer
    let s = 60;
    const cd = document.getElementById('__ig_cd__');
    const timer = setInterval(() => {
      s--;
      if (!document.getElementById('__ig_block__')) { clearInterval(timer); return; }
      if (s <= 0) { clearInterval(timer); cd && (cd.textContent = '0:00'); return; }
      cd && (cd.textContent = '0:' + ('0' + s).slice(-2));
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
}

  function notify(text, title) {
    GM_notification({ title, text, timeout: 5000 });
  }

  // ── Core logic ─────────────────────────────────────────────────────────

  function applyState(unblocked) {
    if (unblocked && lastUnblocked !== true) {
      lastUnblocked = true;
      notify('Instagram UNBLOCKED — calendar event is active.', '✅ Unblocked');
      // Page will load normally on next navigation; reload if currently blocked
      if (document.title === '' || document.body == null) location.reload();
    } else if (!unblocked && lastUnblocked !== false) {
      lastUnblocked = false;
      notify('Instagram BLOCKED — no active unblock event.', '🚫 Blocked');
      blockPage();
    } else if (!unblocked) {
      blockPage(); // re-block every navigation
    }
  }

  function run() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: ICAL_URL,
      onload(resp) {
        const events = parseIcal(resp.responseText);
        const now    = new Date();
        const unblocked = events.some(ev =>
          (ev.summary || '').toLowerCase().includes(UNBLOCK_KW) &&
          isEventActiveNow(ev, now)
        );
        applyState(unblocked);
      },
      onerror(e) {
        console.warn('[IGBlocker] iCal fetch failed — keeping current state', e);
        // Fail safe: if we can't reach calendar, keep blocked
        if (lastUnblocked !== true) blockPage();
      }
    });
  }

  // Initial check + periodic + on tab focus
  run();
  setInterval(run, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

})();// ==UserScript==
// @name         Instagram iCal Blocker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Instagram is always blocked. Add an "Instagram Block" event to Google Calendar to unblock it.
// @author       You
// @match        https://www.instagram.com/*
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────
  // Google Calendar → Settings → your calendar
  // → "Secret address in iCal format" → paste below
  const ICAL_URL       = 'https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics'; // ← paste here
  const UNBLOCK_KW     = 'instagram block';    // event title keyword (case-insensitive)
  const CHECK_INTERVAL = 60000;                // recheck every 60s
  // ──────────────────────────────────────────────────────────────────────

  let lastUnblocked = null; // null = unknown, true = unblocked, false = blocked

  // ── iCal parser ───────────────────────────────────────────────────────

  function parseICalDate(str) {
    if (!str) return null;
    str = str.trim().replace(/^VALUE=DATE(-TIME)?:/, '');
    if (str.length === 8) {
      return new Date(
        parseInt(str.slice(0, 4)),
        parseInt(str.slice(4, 6)) - 1,
        parseInt(str.slice(6, 8))
      );
    }
    const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8);
    const h = str.slice(9, 11), mi = str.slice(11, 13), s = str.slice(13, 15);
    return str.endsWith('Z')
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
      : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  }

  function expandRRule(dtstart, rrule, now) {
    if (!rrule) return false;
    const freq  = (rrule.match(/FREQ=(\w+)/) || [])[1];
    const byday = (rrule.match(/BYDAY=([\w,]+)/) || [])[1];
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    if (freq === 'DAILY') return true;
    if (freq === 'WEEKLY') {
      const days = byday
        ? byday.split(',').map(d => dayMap[d.slice(-2)])
        : [dtstart.getDay()];
      return days.includes(now.getDay());
    }
    return false;
  }

  function isEventActiveNow(ev, now) {
    const { dtstart, dtend, rrule, duration } = ev;
    if (!dtstart) return false;
    const start = new Date(dtstart);
    let end = dtend ? new Date(dtend) : null;
    if (!end && duration) {
      const dh = +(duration.match(/(\d+)H/) || [,0])[1];
      const dm = +(duration.match(/(\d+)M/) || [,0])[1];
      end = new Date(start.getTime() + (dh * 3600 + dm * 60) * 1000);
    }
    if (!end) end = new Date(start.getTime() + 3600000);

    if (rrule) {
      if (!expandRRule(start, rrule, now)) return false;
      const todayStart = new Date(now);
      todayStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      const todayEnd = new Date(todayStart.getTime() + (end - start));
      return now >= todayStart && now < todayEnd;
    }
    return now >= start && now < end;
  }

  function parseIcal(text) {
    const events = [];
    const lines  = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT')      { cur = {}; }
      else if (line === 'END:VEVENT' && cur) { events.push(cur); cur = null; }
      else if (cur) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).toUpperCase();
        const val = line.slice(colon + 1);
        if      (key === 'SUMMARY')             cur.summary  = val;
        else if (key.startsWith('DTSTART'))     cur.dtstart  = parseICalDate(val);
        else if (key.startsWith('DTEND'))       cur.dtend    = parseICalDate(val);
        else if (key === 'DURATION')            cur.duration = val;
        else if (key === 'RRULE')               cur.rrule    = val;
      }
    }
    return events;
  }

  // ── Block screen ───────────────────────────────────────────────────────

function blockPage() {
  // Wait for DOM to be ready if needed
  function inject() {
    // Remove any existing overlay first
    const existing = document.getElementById('__ig_block__');
    if (existing) return;

    const div = document.createElement('div');
    div.id = '__ig_block__';
    div.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:#0d0d0d;z-index:2147483647;
      display:flex;align-items:center;justify-content:center;
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
      color:#fff;text-align:center;
    `;

    div.innerHTML = `
      <div style="max-width:320px;width:90%;padding:20px 0;">
        <div style="width:72px;height:72px;margin:0 auto 28px;">
          <svg viewBox="0 0 72 72" width="72" height="72" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="8" width="56" height="56" rx="16" fill="#1a1a1a" stroke="#2a2a2a" stroke-width="1"/>
            <rect x="22" y="22" width="28" height="28" rx="8" fill="none" stroke="#333" stroke-width="2"/>
            <circle cx="36" cy="36" r="7" fill="none" stroke="#444" stroke-width="2"/>
            <circle cx="44.5" cy="27.5" r="2" fill="#444"/>
            <line x1="14" y1="14" x2="58" y2="58" stroke="#c0392b" stroke-width="2.5" stroke-linecap="round"/>
          </svg>
        </div>
        <div style="font-size:11px;letter-spacing:.12em;color:#555;text-transform:uppercase;margin-bottom:12px;">Access restricted</div>
        <div style="font-size:22px;font-weight:600;margin-bottom:10px;line-height:1.3;">Instagram is blocked</div>
        <div style="font-size:14px;color:#666;line-height:1.7;margin-bottom:28px;">
          No screen time scheduled. Add an <span style="color:#888;font-style:italic;">Instagram Block</span> event in Google Calendar to unlock.
        </div>
        <div style="display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:20px;">
          <div style="height:1px;width:40px;background:#222;"></div>
          <div style="font-size:12px;color:#444;">next check in</div>
          <div style="height:1px;width:40px;background:#222;"></div>
        </div>
        <div id="__ig_cd__" style="font-size:38px;font-weight:700;letter-spacing:-1px;">1:00</div>
        <div style="font-size:12px;color:#444;margin-top:4px;">seconds</div>
        <div style="margin-top:32px;padding:14px 20px;background:#111;border:1px solid #1e1e1e;border-radius:12px;">
          <div style="font-size:11px;color:#444;margin-bottom:6px;text-transform:uppercase;letter-spacing:.08em;">How to unblock</div>
          <div style="font-size:13px;color:#666;line-height:1.6;">
            Google Calendar → New event<br>
            Title: <span style="color:#888;font-style:italic;">"Instagram Block"</span>
          </div>
        </div>
      </div>
    `;

    // Append to body, or html if body not ready
    (document.body || document.documentElement).appendChild(div);

    // Hide everything else
    document.body && (document.body.style.overflow = 'hidden');

    // Countdown timer
    let s = 60;
    const cd = document.getElementById('__ig_cd__');
    const timer = setInterval(() => {
      s--;
      if (!document.getElementById('__ig_block__')) { clearInterval(timer); return; }
      if (s <= 0) { clearInterval(timer); cd && (cd.textContent = '0:00'); return; }
      cd && (cd.textContent = '0:' + ('0' + s).slice(-2));
    }, 1000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
}

  function notify(text, title) {
    GM_notification({ title, text, timeout: 5000 });
  }

  // ── Core logic ─────────────────────────────────────────────────────────

  function applyState(unblocked) {
    if (unblocked && lastUnblocked !== true) {
      lastUnblocked = true;
      notify('Instagram UNBLOCKED — calendar event is active.', '✅ Unblocked');
      // Page will load normally on next navigation; reload if currently blocked
      if (document.title === '' || document.body == null) location.reload();
    } else if (!unblocked && lastUnblocked !== false) {
      lastUnblocked = false;
      notify('Instagram BLOCKED — no active unblock event.', '🚫 Blocked');
      blockPage();
    } else if (!unblocked) {
      blockPage(); // re-block every navigation
    }
  }

  function run() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: ICAL_URL,
      onload(resp) {
        const events = parseIcal(resp.responseText);
        const now    = new Date();
        const unblocked = events.some(ev =>
          (ev.summary || '').toLowerCase().includes(UNBLOCK_KW) &&
          isEventActiveNow(ev, now)
        );
        applyState(unblocked);
      },
      onerror(e) {
        console.warn('[IGBlocker] iCal fetch failed — keeping current state', e);
        // Fail safe: if we can't reach calendar, keep blocked
        if (lastUnblocked !== true) blockPage();
      }
    });
  }

  // Initial check + periodic + on tab focus
  run();
  setInterval(run, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

})();// ==UserScript==
// @name         Instagram iCal Blocker
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  Instagram is always blocked. Add an "Instagram Block" event to Google Calendar to unblock it.
// @author       You
// @match        https://www.instagram.com/*
// @grant        GM_notification
// @grant        GM_xmlhttpRequest
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  // ─── CONFIG ───────────────────────────────────────────────────────────
  // Google Calendar → Settings → your calendar
  // → "Secret address in iCal format" → paste below
  const ICAL_URL       = 'https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics'; // ← paste here
  const UNBLOCK_KW     = 'instagram block';    // event title keyword (case-insensitive)
  const CHECK_INTERVAL = 60000;                // recheck every 60s
  // ──────────────────────────────────────────────────────────────────────

  let lastUnblocked = null; // null = unknown, true = unblocked, false = blocked

  // ── iCal parser ───────────────────────────────────────────────────────

  function parseICalDate(str) {
    if (!str) return null;
    str = str.trim().replace(/^VALUE=DATE(-TIME)?:/, '');
    if (str.length === 8) {
      return new Date(
        parseInt(str.slice(0, 4)),
        parseInt(str.slice(4, 6)) - 1,
        parseInt(str.slice(6, 8))
      );
    }
    const y = str.slice(0, 4), mo = str.slice(4, 6), d = str.slice(6, 8);
    const h = str.slice(9, 11), mi = str.slice(11, 13), s = str.slice(13, 15);
    return str.endsWith('Z')
      ? new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`)
      : new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  }

  function expandRRule(dtstart, rrule, now) {
    if (!rrule) return false;
    const freq  = (rrule.match(/FREQ=(\w+)/) || [])[1];
    const byday = (rrule.match(/BYDAY=([\w,]+)/) || [])[1];
    const dayMap = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 };
    if (freq === 'DAILY') return true;
    if (freq === 'WEEKLY') {
      const days = byday
        ? byday.split(',').map(d => dayMap[d.slice(-2)])
        : [dtstart.getDay()];
      return days.includes(now.getDay());
    }
    return false;
  }

  function isEventActiveNow(ev, now) {
    const { dtstart, dtend, rrule, duration } = ev;
    if (!dtstart) return false;
    const start = new Date(dtstart);
    let end = dtend ? new Date(dtend) : null;
    if (!end && duration) {
      const dh = +(duration.match(/(\d+)H/) || [,0])[1];
      const dm = +(duration.match(/(\d+)M/) || [,0])[1];
      end = new Date(start.getTime() + (dh * 3600 + dm * 60) * 1000);
    }
    if (!end) end = new Date(start.getTime() + 3600000);

    if (rrule) {
      if (!expandRRule(start, rrule, now)) return false;
      const todayStart = new Date(now);
      todayStart.setHours(start.getHours(), start.getMinutes(), start.getSeconds(), 0);
      const todayEnd = new Date(todayStart.getTime() + (end - start));
      return now >= todayStart && now < todayEnd;
    }
    return now >= start && now < end;
  }

  function parseIcal(text) {
    const events = [];
    const lines  = text.replace(/\r\n /g, '').replace(/\r\n/g, '\n').split('\n');
    let cur = null;
    for (const line of lines) {
      if (line === 'BEGIN:VEVENT')      { cur = {}; }
      else if (line === 'END:VEVENT' && cur) { events.push(cur); cur = null; }
      else if (cur) {
        const colon = line.indexOf(':');
        if (colon === -1) continue;
        const key = line.slice(0, colon).toUpperCase();
        const val = line.slice(colon + 1);
        if      (key === 'SUMMARY')             cur.summary  = val;
        else if (key.startsWith('DTSTART'))     cur.dtstart  = parseICalDate(val);
        else if (key.startsWith('DTEND'))       cur.dtend    = parseICalDate(val);
        else if (key === 'DURATION')            cur.duration = val;
        else if (key === 'RRULE')               cur.rrule    = val;
      }
    }
    return events;
  }

  // ── Block screen ───────────────────────────────────────────────────────

  function blockPage() {
    document.documentElement.innerHTML = `





🚫


Instagram is blocked



Add an "Instagram Block" event to Google Calendar to open access.


          Rechecks every 60 seconds


      `;
    window.stop();
  }

  function notify(text, title) {
    GM_notification({ title, text, timeout: 5000 });
  }

  // ── Core logic ─────────────────────────────────────────────────────────

  function applyState(unblocked) {
    if (unblocked && lastUnblocked !== true) {
      lastUnblocked = true;
      notify('Instagram UNBLOCKED — calendar event is active.', '✅ Unblocked');
      // Page will load normally on next navigation; reload if currently blocked
      if (document.title === '' || document.body == null) location.reload();
    } else if (!unblocked && lastUnblocked !== false) {
      lastUnblocked = false;
      notify('Instagram BLOCKED — no active unblock event.', '🚫 Blocked');
      blockPage();
    } else if (!unblocked) {
      blockPage(); // re-block every navigation
    }
  }

  function run() {
    GM_xmlhttpRequest({
      method: 'GET',
      url: ICAL_URL,
      onload(resp) {
        const events = parseIcal(resp.responseText);
        const now    = new Date();
        const unblocked = events.some(ev =>
          (ev.summary || '').toLowerCase().includes(UNBLOCK_KW) &&
          isEventActiveNow(ev, now)
        );
        applyState(unblocked);
      },
      onerror(e) {
        console.warn('[IGBlocker] iCal fetch failed — keeping current state', e);
        // Fail safe: if we can't reach calendar, keep blocked
        if (lastUnblocked !== true) blockPage();
      }
    });
  }

  // Initial check + periodic + on tab focus
  run();
  setInterval(run, CHECK_INTERVAL);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) run();
  });

})();
