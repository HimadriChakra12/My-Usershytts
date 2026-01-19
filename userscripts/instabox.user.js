// ==UserScript==
// @name         Instagram Direct Instant Redirect
// @namespace    https://example.com/ig-direct-instant
// @version      2.0
// @description  Redirect /direct/t/name BEFORE Instagram loads
// @match        https://www.instagram.com/direct/t/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const redirects = {
        "Riya": "17843088840319857",
        "Basement": "9804712362974725",
        "Barshon": "17849539664607285",
        "Barushu": "17849539664607285",
        "Shreya": "1421105996287938",
        "Prionto": "17846226593822368",
        "Prio": "17846226593822368",
        "Darling": "17846226593822368",
        "Ankan": "105870034142833",
        "Anki": "105870034142833",
        "Khalid": "17849224223494131",
        "Khalu": "17849224223494131",
        "Sujoy": "17844082992109595",
        "Suji": "17844082992109595",
        "Antar": "17845605576211591",
        "AJ": "17845605576211591",
        "Lokkhi": "17843088840319857",
        "Bishakha": "17846265992645472",
        "20": "17846265992645472",
        "Bish": "17846265992645472",
        "Apurbo": "17848945131046879",
        "Apurbo2": "17848945131046879",
        "Riya2": "17842703340524797",
        "Kitty": "17842703340524797",
        "Khalid2": "17845325259431010",
        "Shirsha": "17842103414112951"
    };

    const parts = location.pathname.split("/");
    const name = parts[3]; // /direct/t/NAME

    if (name && redirects[name]) {
        location.replace(
            "https://www.instagram.com/direct/t/" + redirects[name] + "/"
        );
    }
})();
