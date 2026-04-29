// ==UserScript==
// @name         Instagram Reels Controls
// @namespace    ig-video-controls
// @version      1.4
// @description  Your original controls + overlay removal, but ONLY on Reels
// @match        https://www.instagram.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    // 🔥 Reels detection (same as second script)
    function isReelVideo(video) {
        return video.closest('div[class*="x5yr21d"][class*="x1uhb9sk"]');
    }

    function addControls(video) {
        if (!video) return;

        if (!video.hasAttribute("controls")) {
            video.setAttribute("controls", "");
        }

        video.autoplay = false;
        video.muted = false;
    }

  function processVideo(video) {
    if (!isReelVideo(video)) return;

    addControls(video);
    controlAccess(video);
  }

    function scan(root = document) {
        root.querySelectorAll("video").forEach(processVideo);
    }

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;

                if (node.tagName === "VIDEO") {
                    processVideo(node);
                } else {
                    scan(node);
                }
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
