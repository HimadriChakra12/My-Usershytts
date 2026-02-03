// ==UserScript==
// @name         Instagram DM Floating Image Canvas (Per Inbox)
// @namespace    https://example.com/ig-floating-canvas
// @version      2.0
// @description  Persistent floating images per Instagram DM inbox
// @match        https://www.instagram.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ---------------- CONFIG ----------------
    const INBOX_IDS = {
        riya: "17843088840319857",
        basement: "9804712362974725",
        barshon: "17849539664607285",
        shreya: "1421105996287938",
        prionto: "17846226593822368",
        ankan: "105870034142833",
        khalid: "17849224223494131",
        sujoy: "17844082992109595",
        antar: "17845605576211591",
        bishakha: "17846265992645472",
        apurbo: "17848945131046879",
        riya2: "17842703340524797",
        khalid2: "17845325259431010",
        shirsha: "17842103414112951",
        rick: "17849831711501991",
        shrabonti: "17848657521425015"
    };

    const VALID_THREAD_IDS = new Set(Object.values(INBOX_IDS));

    // ---------------- STATE ----------------
    let currentThreadId = null;
    let overlay = null;

    // ---------------- HELPERS ----------------
    function getThreadIdFromURL() {
        const match = location.pathname.match(/\/direct\/t\/(\d+)/);
        return match ? match[1] : null;
    }

    function storageKey() {
        return `floating-image-overlay-state::${currentThreadId}`;
    }

    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(storageKey())) || [];
        } catch {
            return [];
        }
    }

    function saveState(state) {
        localStorage.setItem(storageKey(), JSON.stringify(state));
    }

    // ---------------- OVERLAY ----------------
    function createOverlay() {
        if (overlay) overlay.remove();

        overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            zIndex: '999999',
            pointerEvents: 'none'
        });

        document.body.appendChild(overlay);
    }

    function restoreImages() {
        overlay.innerHTML = '';
        loadState().forEach(img =>
            createFloatingImage(img)
        );
    }

    // ---------------- IMAGE ----------------
    function createFloatingImage({ id, src, x, y, width }) {
        const img = document.createElement('img');
        img.src = src;
        img.dataset.id = id;
        img.width = width;

        Object.assign(img.style, {
            position: 'fixed',
            left: x + 'px',
            top: y + 'px',
            cursor: 'grab',
            pointerEvents: 'auto',
            userSelect: 'none'
        });

        overlay.appendChild(img);
        makeDraggable(img);

        img.addEventListener('wheel', e => {
            e.preventDefault();
            img.width *= e.deltaY < 0 ? 1.1 : 0.9;
            updateImage(id, { width: img.width });
        });

        img.addEventListener('dblclick', () => {
            removeImage(id);
            img.remove();
        });
    }

    function updateImage(id, data) {
        const state = loadState();
        const img = state.find(i => i.id === id);
        if (!img) return;
        Object.assign(img, data);
        saveState(state);
    }

    function removeImage(id) {
        saveState(loadState().filter(i => i.id !== id));
    }

    // ---------------- DRAGGING ----------------
    function makeDraggable(el) {
        let dragging = false, ox = 0, oy = 0;

        el.addEventListener('mousedown', e => {
            dragging = true;
            ox = e.clientX - el.getBoundingClientRect().left;
            oy = e.clientY - el.getBoundingClientRect().top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            el.style.left = e.clientX - ox + 'px';
            el.style.top = e.clientY - oy + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            updateImage(el.dataset.id, {
                x: parseFloat(el.style.left),
                y: parseFloat(el.style.top)
            });
        });
    }

    // ---------------- DROP ----------------
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', e => {
        if (!currentThreadId) return;

        [...e.dataTransfer.files].forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = () => {
                const img = {
                    id: crypto.randomUUID(),
                    src: reader.result,
                    x: e.clientX,
                    y: e.clientY,
                    width: 300
                };

                const state = loadState();
                state.push(img);
                saveState(state);
                createFloatingImage(img);
            };
            reader.readAsDataURL(file);
        });
    });

    // ---------------- URL / DOM WATCH ----------------
    function checkInboxChange() {
        const threadId = getThreadIdFromURL();

        if (
            threadId &&
            threadId !== currentThreadId &&
            VALID_THREAD_IDS.has(threadId)
        ) {
            currentThreadId = threadId;
            createOverlay();
            restoreImages();
        }
    }

    const observer = new MutationObserver(checkInboxChange);
    observer.observe(document.body, { childList: true, subtree: true });

    checkInboxChange();
})();
