// ==UserScript==
// @name         Google Calendar Site Blocker with Timer
// @namespace    https://calendar-blocker.local
// @version      1.1
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      calendar.google.com
// ==/UserScript==

(function () {
  const CALENDAR_URL =
    "https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics";

  const BLOCK_KEYWORDS = ["Focus", "Study", "Work"];
  const BLOCKED_SITES = ["youtube.com", "reddit.com", "twitter.com", "instagram.com"];
  const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

  function isBlockedSite() {
    return BLOCKED_SITES.some(site =>
      location.hostname.includes(site)
    );
  }

  function toDate(icsTime) {
    return new Date(
      icsTime.replace(
        /(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/,
        "$1-$2-$3T$4:$5:$6Z"
      )
    );
  }

  function parseEvents(ics) {
    return ics
      .split("BEGIN:VEVENT")
      .slice(1)
      .map(block => {
        const get = key =>
          block.match(new RegExp(`${key}:(.+)`))?.[1];
        return {
          summary: get("SUMMARY") || "",
          start: get("DTSTART"),
          end: get("DTEND")
        };
      })
      .filter(e => e.start && e.end);
  }

  // Temporary unblock functions
  function getUnblockKey() {
    return `unblockUntil:${location.hostname}`;
  }

  function isTemporarilyUnblocked() {
    const until = GM_getValue(getUnblockKey(), 0);
    return Date.now() < until;
  }

  function unblockForEvent(endTime) {
    GM_setValue(getUnblockKey(), endTime.getTime());
  }

  function blockPage(currentEvent) {
    const endTime = toDate(currentEvent.end);

    document.documentElement.innerHTML = `
      <body style="
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        font-family:sans-serif;
        background:#111;
        color:#fff;
        position:relative;">
        <div style="text-align:center">
          <h1>🚫 Focus Time</h1>
          <p>This site is blocked by your calendar.</p>
          <button id="unblockBtn" style="
            margin-top:20px;
            padding:10px 18px;
            font-size:16px;
            cursor:pointer;
            border:none;
            border-radius:6px;
          ">
            Unblock for this event
          </button>
        </div>
        <div id="timer" style="
          position:absolute;
          top:10px;
          right:10px;
          font-size:18px;
          background:#222;
          padding:5px 10px;
          border-radius:6px;
          color:#fff;
        "></div>
      </body>`;

    function updateTimer() {
      const now = new Date();
      const diff = endTime - now;
      if (diff <= 0) {
        location.reload(); // Event ended → reload page
        return;
      }
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      document.getElementById("timer").innerText =
        `Time until event ends: ${minutes}m ${seconds}s`;
    }

    document.getElementById("unblockBtn").addEventListener("click", () => {
      unblockForEvent(endTime);
      updateTimer();
    });

    updateTimer();
    setInterval(updateTimer, 1000);
    window.stop();
  }

  function run(ics) {
    if (!isBlockedSite()) return;

    const events = parseEvents(ics);
    const now = new Date();

    // Find the current event matching keywords
    const currentEvent = events.find(e => {
      const start = toDate(e.start);
      const end = toDate(e.end);
      return (
        BLOCK_KEYWORDS.some(k =>
          e.summary.toLowerCase().includes(k.toLowerCase())
        ) &&
        now >= start &&
        now <= end
      );
    });

    if (!currentEvent) return;
    if (isTemporarilyUnblocked()) return;

    blockPage(currentEvent);
  }

  // Cache calendar to avoid too many requests
  const cached = GM_getValue("calendarCache");
  const cachedAt = GM_getValue("calendarCacheTime", 0);

  if (cached && Date.now() - cachedAt < CACHE_TTL) {
    run(cached);
  } else {
    GM_xmlhttpRequest({
      method: "GET",
      url: CALENDAR_URL,
      onload: res => {
        GM_setValue("calendarCache", res.responseText);
        GM_setValue("calendarCacheTime", Date.now());
        run(res.responseText);
      }
    });
  }
})();
