// ==UserScript==
// @name         Universal Video Speed Controller (Fixed)
// @namespace    vid-speed
// @version      1.1
// @match        *://*/*
// @match        file:///*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    function enhance(video) {
        if (video.dataset.speedEnhanced) return;
        video.dataset.speedEnhanced = "true";

        video.playbackRate = 1;

        const box = document.createElement("div");
        box.style.position = "fixed"; // 🔥 key fix
        box.style.zIndex = 9999999;
        box.style.background = "rgba(0,0,0,0.7)";
        box.style.color = "#fff";
        box.style.padding = "6px 10px";
        box.style.fontSize = "13px";
        box.style.borderRadius = "8px";
        box.style.bottom = "20px";
        box.style.right = "20px";
        box.style.cursor = "pointer";
        box.style.userSelect = "none";

        box.textContent = "1x";

        function update() {
            box.textContent = video.playbackRate.toFixed(2) + "x";
        }

        box.onclick = () => {
            let r = video.playbackRate;
            r = r >= 3 ? 1 : r + 0.5;
            video.playbackRate = r;
            update();
        };

        document.body.appendChild(box);

        // keyboard
        document.addEventListener("keydown", (e) => {
            if (e.key === "]") {
                video.playbackRate += 0.25;
                update();
            }
            if (e.key === "[") {
                video.playbackRate -= 0.25;
                update();
            }
        });

        update();
    }

    function scan() {
        document.querySelectorAll("video").forEach(enhance);
    }

    new MutationObserver(scan).observe(document, {
        childList: true,
        subtree: true
    });

    scan();
})();
