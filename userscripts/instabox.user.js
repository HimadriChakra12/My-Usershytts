// ==UserScript==
// @name         Instagram Direct Instant Redirect
// @namespace    https://example.com/ig-direct-instant
// @version      2.1
// @description  Redirect /direct/t/name BEFORE Instagram loads (case-insensitive)
// @match        https://www.instagram.com/direct/t/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const redirects = {
        "riya": "17843088840319857",
        "lokkhi": "17843088840319857",
        "basement": "9804712362974725",
        "barshon": "17849539664607285",
        "barushu": "17849539664607285",
        "shreya": "1421105996287938",
        "prionto": "17846226593822368",
        "prio": "17846226593822368",
        "darling": "17846226593822368",
        "ankan": "105870034142833",
        "anki": "105870034142833",
        "khalid": "17849224223494131",
        "khalu": "17849224223494131",
        "sujoy": "17844082992109595",
        "suji": "17844082992109595",
        "antar": "17845605576211591",
        "aj": "17845605576211591",
        "bishakha": "17846265992645472",
        "20": "17846265992645472",
        "bish": "17846265992645472",
        "apurbo": "17848945131046879",
        "apurbo2": "17848945131046879",
        "riya2": "17842703340524797",
        "kitty": "17842703340524797",
        "khalid2": "17845325259431010",
        "shirsha": "17842103414112951"
    };

    const parts = location.pathname.split("/");
    const name = parts[3]?.toLowerCase(); // normalize case

    if (name && redirects[name]) {
        location.replace(
            "https://www.instagram.com/direct/t/" + redirects[name] + "/"
        );
    }
})();
