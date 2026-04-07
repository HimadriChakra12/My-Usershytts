// ==UserScript==
// @name         Instagram Video Controls + Clean UI
// @namespace    ig-video-controls
// @version      1.1
// @description  Add native controls & remove overlay UI from Instagram videos
// @match        https://www.instagram.com/*
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    function addControls(video) {
        if (!video) return;

        if (!video.hasAttribute("controls")) {
            video.setAttribute("controls", "");
        }

        video.autoplay = false;
        video.muted = false;
    }

    function removeOverlay(container) {
        // Equivalent of:
        // div[class="x5yr21d x1uhb9sk xh8yej3"]:has(video)
        if (!container.matches('div.x5yr21d.x1uhb9sk.xh8yej3')) return;
        if (!container.querySelector('video')) return;

        // Target:
        // > div > div[class="x5yr21d x10l6tqk x13vifvy xh8yej3"]
        const overlays = container.querySelectorAll(
            ':scope > div > div.x5yr21d.x10l6tqk.x13vifvy.xh8yej3'
        );

        overlays.forEach(el => {
            el.style.display = 'none';
        });
    }

    function scan(root = document) {
        // Add controls
        root.querySelectorAll("video").forEach(addControls);

        // Remove overlays
        root.querySelectorAll('div.x5yr21d.x1uhb9sk.xh8yej3')
            .forEach(removeOverlay);
    }

    // Initial run
    document.addEventListener("DOMContentLoaded", () => scan());

    // Observe dynamic DOM
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (!(node instanceof Element)) continue;

                // Direct video
                if (node.tagName === "VIDEO") {
                    addControls(node);
                }

                // Scan subtree
                scan(node);
            }
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

})();
