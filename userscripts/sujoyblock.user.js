// ==UserScript==
// @name         Instagram Hard Remove sagnik_om_
// @namespace    http://tampermonkey.net/
// @version      2.0
// @match        https://www.instagram.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TARGET = "sagnik_om_";

    function nuke() {

        // 1. Remove anything linking to the profile
        document.querySelectorAll(`a[href*="/${TARGET}/"]`).forEach(a => {
            const el = a.closest("li, article, div");
            if (el) el.remove();
        });

        // 2. Remove story bubbles (aria-label)
        document.querySelectorAll(`div[aria-label*="${TARGET}"]`).forEach(el => {
            const li = el.closest("li");
            if (li) li.remove();
        });

        // 3. Remove username text occurrences
        document.querySelectorAll("span, div").forEach(el => {
            if (el.textContent.trim() === TARGET) {
                const container = el.closest("li, article, div");
                if (container) container.remove();
            }
        });

        // 4. Extra: images with alt text (profile pic, etc.)
        document.querySelectorAll(`img[alt*="${TARGET}"]`).forEach(img => {
            const el = img.closest("li, article, div");
            if (el) el.remove();
        });
    }

    // Run once
    nuke();

    // Observe dynamic changes (important for Instagram)
    const observer = new MutationObserver(() => {
        nuke();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
