// ==UserScript==
// @name         Multi Favicon Replacer
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Replace favicons based on website
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // Mapping: website → icon
    const siteIcons = {
        "youtube.com": "https://example.com/youtube.png",
        "facebook.com": "https://example.com/facebook.png",
        "github.com": "https://example.com/github.png"
    };

    function changeFavicon(url) {
        let link = document.querySelector("link[rel*='icon']");
        if (!link) {
            link = document.createElement("link");
            link.rel = "icon";
            document.head.appendChild(link);
        }
        link.type = "image/png";
        link.href = url;
    }

    function getMatchingIcon() {
        const host = location.hostname.replace("www.", "");

        for (const site in siteIcons) {
            if (host.includes(site)) {
                return siteIcons[site];
            }
        }
        return null;
    }

    const icon = getMatchingIcon();
    if (!icon) return;

    changeFavicon(icon);

    // Keep overriding if site resets it
    const observer = new MutationObserver(() => {
        changeFavicon(icon);
    });

    observer.observe(document.head, { childList: true, subtree: true });
})();
