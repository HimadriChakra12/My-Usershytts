// ==UserScript==
// @name         Calendar Focus Blocker
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Block distracting websites based on Google Calendar events
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @connect      calendar.google.com
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    const CALENDAR_URL = "https://calendar.google.com/calendar/ical/himadrichakrabortydip%40gmail.com/public/basic.ics";

    const BLOCK_KEYWORDS = ["Focus", "Study", "Work"];
    const BLOCKED_SITES = ["youtube.com", "reddit.com", "twitter.com", "instagram.com"];

    const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    // -------------------
    // UTILITIES
    // -------------------

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
                const get = key => block.match(new RegExp(`${key}:(.+)`))?.[1];
                return {
                    summary: get("SUMMARY") || "",
                    start: get("DTSTART"),
                    end: get("DTEND")
                };
            })
            .filter(e => e.start && e.end)
            .map(e => ({
                summary: e.summary,
                start: toDate(e.start),
                end: toDate(e.end)
            }));
    }

    function isBlockedSite() {
        return BLOCKED_SITES.some(site => location.hostname.includes(site));
    }

    function getCurrentEvent(events) {
        const now = new Date();
        return events.find(e =>
            BLOCK_KEYWORDS.some(k =>
                e.summary.toLowerCase().includes(k.toLowerCase())
            ) && now >= e.start && now <= e.end
        );
    }

    function formatTime(ms) {
        const totalSeconds = Math.max(0, Math.floor(ms / 1000));
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2,'0')}`;
    }

    // -------------------
    // BLOCKING UI
    // -------------------

    function createBlockUI(eventEnd) {
        // Stop the page from rendering normally
        document.documentElement.innerHTML = '';

        document.documentElement.style.height = '100%';
        document.body.style.height = '100%';
        document.body.style.margin = '0';
        document.body.style.fontFamily = 'sans-serif';
        document.body.style.background = '#111';
        document.body.style.color = '#fff';
        document.body.style.display = 'flex';
        document.body.style.alignItems = 'center';
        document.body.style.justifyContent = 'center';
        document.body.style.flexDirection = 'column';
        document.body.style.textAlign = 'center';

        const title = document.createElement('h1');
        title.textContent = '🚫 Focus Time';
        title.style.marginBottom = '20px';
        document.body.appendChild(title);

        const msg = document.createElement('p');
        msg.textContent = 'This site is blocked by your calendar event.';
        msg.style.marginBottom = '40px';
        document.body.appendChild(msg);

        // Timer in corner
        const timerDiv = document.createElement('div');
        timerDiv.id = 'focus-timer';
        timerDiv.style.position = 'fixed';
        timerDiv.style.top = '20px';
        timerDiv.style.right = '20px';
        timerDiv.style.background = 'rgba(255,255,255,0.1)';
        timerDiv.style.color = '#fff';
        timerDiv.style.padding = '12px 16px';
        timerDiv.style.borderRadius = '12px';
        timerDiv.style.fontFamily = 'sans-serif';
        timerDiv.style.fontSize = '18px';
        timerDiv.style.zIndex = 9999;
        document.body.appendChild(timerDiv);

        // Emergency unblock button
        const unblockBtn = document.createElement('button');
        unblockBtn.textContent = '🚨 Emergency 30s';
        unblockBtn.style.marginTop = '20px';
        unblockBtn.style.padding = '10px 20px';
        unblockBtn.style.fontSize = '16px';
        unblockBtn.style.border = 'none';
        unblockBtn.style.borderRadius = '8px';
        unblockBtn.style.cursor = 'pointer';
        unblockBtn.onclick = () => {
            startTemporaryUnblock(30);
        };
        document.body.appendChild(unblockBtn);

        startCountdown(eventEnd, timerDiv);
    }

    function startCountdown(endTime, timerDiv) {
        const interval = setInterval(() => {
            const remaining = endTime - new Date();
            if (remaining <= 0) {
                clearInterval(interval);
                location.reload(); // allow site again
            } else {
                timerDiv.textContent = `Time left: ${formatTime(remaining)}`;
            }
        }, 1000);
    }

    // -------------------
    // TEMPORARY UNBLOCK
    // -------------------

    function startTemporaryUnblock(seconds) {
        const unblockUntil = Date.now() + seconds * 1000;
        GM_setValue('temporaryUnblockUntil', unblockUntil);
        location.reload();
    }

    function isTemporarilyUnblocked() {
        const until = GM_getValue('temporaryUnblockUntil', 0);
        return Date.now() < until;
    }

    // -------------------
    // MAIN LOGIC
    // -------------------

    function run(ics) {
        if (!isBlockedSite()) return;

        const events = parseEvents(ics);
        const currentEvent = getCurrentEvent(events);

        if (!currentEvent) return; // No current event -> do nothing
        if (isTemporarilyUnblocked()) return; // Temporary unblock active

        createBlockUI(currentEvent.end);
    }

    // -------------------
    // LOAD CALENDAR & CACHE
    // -------------------

    const cached = GM_getValue('calendarCache');
    const cachedAt = GM_getValue('calendarCacheTime', 0);

    if (cached && Date.now() - cachedAt < CACHE_TTL) {
        run(cached);
    } else {
        GM_xmlhttpRequest({
            method: "GET",
            url: CALENDAR_URL,
            onload: res => {
                GM_setValue('calendarCache', res.responseText);
                GM_setValue('calendarCacheTime', Date.now());
                run(res.responseText);
            }
        });
    }

})();
