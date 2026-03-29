// ==UserScript==
// @name         Remove Adblock Popup (stevenuniverse.best)
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Bypass and remove adblock popup automatically
// @author       You
// @match        https://stevenuniverse.best/*
// @match        http://stevenuniverse.best/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';
    const style = document.createElement('style');
    style.textContent = `
        #adblock-popup {
            display: none !important;
            visibility: hidden !important;
            opacity: 0 !important;
            pointer-events: none !important;
        }
    `;
    document.documentElement.appendChild(style);
    function createBait() {
        const bait = document.createElement("div");
        bait.className = "adsbox pub_300x250 ad-banner ad-placement";
        bait.style.cssText = "width:1px;height:1px;position:absolute;left:-9999px;";
        document.documentElement.appendChild(bait);
    }
    function removePopup() {
        const popup = document.getElementById("adblock-popup");
        if (popup) {
            popup.remove();
        }
    }
    const originalSetAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function(name, value) {
        if (this.id === "adblock-popup" && name === "style") {
            return;
        }
        return originalSetAttribute.apply(this, arguments);
    };
    const observer = new MutationObserver(() => {
        removePopup();
    });
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
    setInterval(removePopup, 500);
    createBait();
    removePopup();

})();
