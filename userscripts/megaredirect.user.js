// ==UserScript==
// @name        Mega.nz Redirector
// @namespace   Violentmonkey Scripts
// @match       https://mega.nz/*
// @grant       none
// @version     1.2
// @author      -
// @description Redirect certain Mega.nz paths to specific folders
// ==/UserScript==

(function () {
    'use strict';

    const redirects = {
        "riya": "AJ9F1BwY",
        "lokkhi": "AJ9F1BwY",
        "bishakha": "ZVVUkbrK",
        "20": "ZVVUkbrK",
        "bish": "ZVVUkbrK",
        "simp": "1RVVSJhD"
    };

    // Get all path segments
    const parts = location.pathname.split("/").filter(Boolean);

    // Look for any keyword in the path
    const keyword = parts.find(p => redirects[p.toLowerCase()]);

    if (keyword) {
        const targetID = redirects[keyword.toLowerCase()];
        // Prevent redirect loop
        if (!location.pathname.includes(`/fm/${targetID}`)) {
            location.replace(`https://mega.nz/fm/${targetID}/`);
        }
    }
})();

