// ==UserScript==
// @name         Instagram Video Controls + Clean UI (Fixed)
// @namespace    ig-video-controls
// @version      1.2
// @description  Add controls & remove overlay reliably
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

    function removeOverlayFromVideo(video) {
        // Walk up to a reasonable container
        let container = video.closest('div');

        if (!container) return;

        // Look for overlay-like elements near video
        const possibleOverlays = container.querySelectorAll('div');

        possibleOverlays.forEach(el => {
            // Heuristic: overlay = positioned + no video inside + small depth
            if (
                el !== video &&
                !el.querySelector('video') &&
                getComputedStyle(el).position === 'absolute'
            ) {
                el.remove(); // stronger than display:none
            }
        });
    }

    function processVideo(video) {
        addControls(video);
        removeOverlayFromVideo(video);
    }

    function scan(root = document) {
        root.querySelectorAll("video").forEach(processVideo);
    }

    // Mutation observer (main engine)
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
