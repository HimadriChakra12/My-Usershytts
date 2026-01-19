// ==UserScript==
// @name         Instagram Direct Name Redirect
// @namespace    https://example.com/ig-direct-redirect
// @version      1.0
// @description  Redirect instagram.com/direct/t/name to instagram.com/direct/t/code
// @match        https://www.instagram.com/direct/t/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // Array of mappings: name -> code
    const redirects = [
        { name: "Riya", code: "17843088840319857" },
        { name: "Lokkhi", code: "17843088840319857" },
        { name: "Basement", code: "9804712362974725" },
        { name: "Barshon", code: "17849539664607285" }
        { name: "Barushu", code: "17849539664607285" }
        { name: "Shreya", code: "1421105996287938" }
        { name: "Prionto", code: "17846226593822368/" }
        { name: "Prio", code: "17846226593822368/" }
        { name: "Darling", code: "17846226593822368/" }
        { name: "Ankan", code: "105870034142833" }
        { name: "Anki", code: "105870034142833" }
        { name: "Khalid", code: "17849224223494131" }
        { name: "Khalu", code: "17849224223494131" }
        { name: "Sujoy", code: "17844082992109595" }
        { name: "Suji", code: "17844082992109595" }
        { name: "Antar", code: "17845605576211591" }
        { name: "AJ", code: "17845605576211591" }
        { name: "Bishakha", code: "17846265992645472/" }
        { name: "20", code: "17846265992645472/" }
        { name: "Bish", code: "17846265992645472/" }
        { name: "Apurbo", code: "17848945131046879" }
        { name: "Apurbo2", code: "17848945131046879" }
        { name: "Riya2", code: "17842703340524797" }
        { name: "Kitty", code: "17842703340524797" }
        { name: "Khalid2", code: "17845325259431010" }
        { name: "Shirsha", code: "17842103414112951" }
    ];

    const pathParts = window.location.pathname.split("/");
    // Expected: /direct/t/name
    const targetName = pathParts[3];

    if (!targetName) return;

    const match = redirects.find(r => r.name === targetName);

    if (match) {
        const newUrl = `https://www.instagram.com/direct/t/${match.code}/`;
        window.location.replace(newUrl);
    }
})();

