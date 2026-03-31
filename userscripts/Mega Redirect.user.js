// ==UserScript==
// @name         Mega Search Redirect
// @namespace    https://example.com/
// @version      2.2.2
// @match        https://mega.nz/fm/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const redirects = {
        "home": "ZE0WRSKb",
        "lokkhi": "AJ9F1BwY",
    };

    const parts = location.pathname.split("/");
    const name = parts[2]?.toLowerCase(); // FIXED index

    if (name && redirects[name]) {
        location.replace("https://mega.nz/fm/" + redirects[name] + "/");
    }
})();
