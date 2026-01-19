// ==UserScript==
// @name         Instagram Direct Name Redirect
// @namespace    https://example.com/ig-direct-redirect
// @version      1.1
// @description  Redirect instagram.com/direct/t/name to instagram.com/direct/t/code
// @match        https://www.instagram.com/*
// @run-at       document-end
// ==/UserScript==

(function () {
    'use strict';

    const redirects = [
        { name: "Riya", code: "17843088840319857" },
        { name: "Lokkhi", code: "17843088840319857" },
        { name: "Basement", code: "9804712362974725" },
        { name: "Barshon", code: "17849539664607285" },
        { name: "Barushu", code: "17849539664607285" },
        { name: "Shreya", code: "1421105996287938" },
        { name: "Prionto", code: "17846226593822368" },
        { name: "Prio", code: "17846226593822368" },
        { name: "Darling", code: "17846226593822368" },
        { name: "Ankan", code: "105870034142833" },
        { name: "Anki", code: "105870034142833" },
        { name: "Khalid", code: "17849224223494131" },
        { name: "Khalu", code: "17849224223494131" },
        { name: "Sujoy", code: "17844082992109595" },
        { name: "Suji", code: "17844082992109595" },
        { name: "Antar", code: "17845605576211591" },
        { name: "AJ", code: "17845605576211591" },
        { name: "Bishakha", code: "17846265992645472" },
        { name: "20", code: "17846265992645472" },
        { name: "Bish", code: "17846265992645472" },
        { name: "Apurbo", code: "17848945131046879" },
        { name: "Apurbo2", code: "17848945131046879" },
        { name: "Riya2", code: "17842703340524797" },
        { name: "Kitty", code: "17842703340524797" },
        { name: "Khalid2", code: "17845325259431010" },
        { name: "Shirsha", code: "17842103414112951" }
    ];

    function checkRedirect() {
        const match = location.pathname.match(/^\/direct\/t\/([^/]+)/);
        if (!match) return;

        const targetName = match[1];
        const found = redirects.find(r => r.name === targetName);

        if (found) {
            const newUrl = `https://www.instagram.com/direct/t/${found.code}/`;
            if (location.href !== newUrl) {
                location.replace(newUrl);
            }
        }
    }

    // Initial check
    checkRedirect();

    // Watch SPA navigation
    let lastUrl = location.href;
    setInterval(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            checkRedirect();
        }
    }, 500);
})();
