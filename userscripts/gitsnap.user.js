// ==UserScript==
// @name         GitHub Turbo Mode
// @namespace    github-turbo
// @version      2.0
// @description  Reduce GitHub UI overhead and improve perceived responsiveness
// @match        https://github.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    // -------------------------
    // Kill animations ASAP
    // -------------------------
    const css = document.createElement('style');
    css.textContent = `
        *,
        *::before,
        *::after {
            animation: none !important;
            transition: none !important;
            scroll-behavior: auto !important;
        }

        /* Hide expensive UI blocks */
        .js-yearly-contributions,
        .js-profile-timeline-year-list,
        .js-contribution-graph,
        .contribution-activity-listing,
        .js-pinned-items-reorder-container,
        .dashboard-sidebar,
        .feed-item-container,
        .js-notice,
        .js-sticky,
        .js-calendar-graph {
            display: none !important;
        }

        /* Reduce rendering cost */
        img {
            content-visibility: auto;
        }

        /* Faster scrolling */
        .Layout,
        .application-main {
            contain: layout style paint;
        }
    `;

    document.documentElement.appendChild(css);

    // -------------------------
    // Defer image loading
    // -------------------------
    const optimizeImages = () => {
        document.querySelectorAll('img').forEach(img => {
            img.loading = 'lazy';
            img.decoding = 'async';
        });
    };

    // -------------------------
    // Remove heavy elements
    // -------------------------
    const removeHeavyStuff = () => {

        const selectors = [
            '.js-yearly-contributions',
            '.js-profile-timeline-year-list',
            '.js-calendar-graph',
            '.contribution-activity-listing',

            // Home feed junk
            '.feed-item-container',

            // Extra side widgets
            '.dashboard-sidebar',

            // Marketing banners
            '.js-notice'
        ];

        selectors.forEach(selector => {
            document.querySelectorAll(selector).forEach(el => {
                el.remove();
            });
        });
    };

    // -------------------------
    // Stop auto-playing videos
    // -------------------------
    const stopVideos = () => {
        document.querySelectorAll('video').forEach(v => {
            v.pause();
            v.autoplay = false;
            v.preload = 'none';
        });
    };

    // -------------------------
    // Mutation observer
    // -------------------------
    const observer = new MutationObserver(() => {
        optimizeImages();
        removeHeavyStuff();
        stopVideos();
    });

    const startObserver = () => {
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    };

    // -------------------------
    // Page ready
    // -------------------------
    const init = () => {
        optimizeImages();
        removeHeavyStuff();
        stopVideos();
        startObserver();

        console.log('[GitHub Turbo] Active');
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
