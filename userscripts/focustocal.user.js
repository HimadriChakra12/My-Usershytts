// ==UserScript==
// @name         Google Calendar Site Blocker
// @namespace    https://calendar-blocker.local
// @version      1.0
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

  function shouldBlock(events) {
    const now = new Date();

    return events.some(e => {
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
  }

  function blockPage() {
    document.documentElement.innerHTML = `
      <body style="
        display:flex;
        justify-content:center;
        align-items:center;
        height:100vh;
        font-family:sans-serif;
        background:#111;
        color:#fff;">
        <div style="text-align:center">
          <h1>🚫 Focus Time</h1>
          <p>This site is blocked by your calendar.</p>
        </div>
      </body>`;
    window.stop();
  }

  function run(ics) {
    if (!isBlockedSite()) return;
    const events = parseEvents(ics);
    if (shouldBlock(events)) blockPage();
  }

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

