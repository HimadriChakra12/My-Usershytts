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
