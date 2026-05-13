// ==UserScript==
// @name         Instagram Lite Stable
// @namespace    https://github.com/userscripts/instagram-lite
// @version      3.0.0
// @description  Lightweight Instagram optimization without breaking reels, images, DMs, or profiles
// @match        https://www.instagram.com/*
// @match        https://instagram.com/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(() => {
  'use strict';

  const settings = {
    hideAds: true,
    hideStories: false,
    hideReels: false,
    disableAnimations: true,
    reduceVideoPreload: true,
    pauseBackgroundVideo: true,
    virtualizeFeed: true,
  };

  const styleRules = `
    ${settings.hideReels ? `
      a[href="/reels/"],
      a[href^="/reels"],
      svg[aria-label="Reels"] {
        display: none !important;
      }
    ` : ''}

    ${settings.hideStories ? `
      section ul[role="menu"],
      section canvas {
        display: none !important;
      }
    ` : ''}

    ${settings.hideAds ? `
      article:has(span[dir="auto"]) {
        contain: content;
      }
    ` : ''}

    ${settings.disableAnimations ? `
      *,
      *::before,
      *::after {
        animation-duration: 0.001ms !important;
        animation-delay: 0ms !important;
        transition-duration: 0.001ms !important;
        transition-delay: 0ms !important;
        scroll-behavior: auto !important;
      }
    ` : ''}

    ${settings.virtualizeFeed ? `
      main article,
      main section {
        content-visibility: auto;
        contain-intrinsic-size: 1000px;
      }
    ` : ''}

    video {
      will-change: auto !important;
    }
  `;

  if (typeof GM_addStyle !== 'undefined') {
    GM_addStyle(styleRules);
  } else {
    const styleElement = document.createElement('style');
    styleElement.textContent = styleRules;
    document.documentElement.appendChild(styleElement);
  }

  function optimizeVideo(videoElement) {
    if (videoElement.dataset.igLiteReady) return;

    videoElement.dataset.igLiteReady = '1';

    if (settings.reduceVideoPreload) {
      videoElement.preload = 'metadata';
    }

    if (
      settings.pauseBackgroundVideo &&
      document.hidden &&
      !videoElement.paused
    ) {
      videoElement.pause();
    }
  }

  function hideSponsoredPost(postElement) {
    if (!settings.hideAds) return;
    if (postElement.dataset.igLiteChecked) return;

    postElement.dataset.igLiteChecked = '1';

    const textNodes = postElement.querySelectorAll('span, div');

    for (const node of textNodes) {
      if (node.textContent?.trim() === 'Sponsored') {
        postElement.style.display = 'none';
        return;
      }
    }
  }

  function optimizeNode(rootNode) {
    if (!(rootNode instanceof Element)) return;

    if (rootNode.tagName === 'VIDEO') {
      optimizeVideo(rootNode);
    }

    rootNode.querySelectorAll?.('video').forEach(optimizeVideo);

    rootNode.querySelectorAll?.('article').forEach(hideSponsoredPost);
  }

  const domObserver = new MutationObserver(mutationList => {
    for (const mutation of mutationList) {
      for (const addedNode of mutation.addedNodes) {
        optimizeNode(addedNode);
      }
    }
  });

  function pauseVisibleVideos() {
    if (!settings.pauseBackgroundVideo) return;
    if (!document.hidden) return;

    document.querySelectorAll('video').forEach(videoElement => {
      videoElement.pause();
    });
  }

  document.addEventListener('visibilitychange', pauseVisibleVideos);

  domObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });

  optimizeNode(document);

  console.log(
    '%cInstagram Lite Stable',
    'background:#111;color:#4ade80;padding:4px 8px;border-radius:4px;font-weight:bold'
  );
})();
