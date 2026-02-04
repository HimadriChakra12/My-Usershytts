// ==UserScript==
// @name         Spotify Custom Cover Art
// @namespace    https://yoursite.com/
// @version      1.0.0.1
// @description  Replace Spotify cover art with a custom image for all songs
// @match        https://open.spotify.com/*
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const MY_IMAGE = 'https://github.com/HimadriChakra12/.dotfiles/blob/master/i3/Wallpaper/Himadri/Riya%20hands.png?raw=true'; // 👈 change this

  function replaceCoverArt() {
    document
      .querySelectorAll('img[data-testid="cover-art-image"]')
      .forEach(img => {
        if (img.src !== MY_IMAGE) {
          img.src = MY_IMAGE;
        }
      });
  }

  // Run once immediately
  replaceCoverArt();

  // Watch for Spotify re-renders
  const observer = new MutationObserver(() => {
    replaceCoverArt();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

})();

