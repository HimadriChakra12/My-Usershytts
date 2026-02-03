// ==UserScript==
// @name         Instagram DM Floating Image Canvas (Final)
// @namespace    https://example.com/ig-floating-canvas
// @version      2.2
// @description  Persistent floating images per Instagram DM inbox (SPA-safe, no file-open bug)
// @match        https://www.instagram.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ---------------- CONFIG ----------------
    const VALID_THREAD_IDS = new Set([
        "17843088840319857",
        "9804712362974725",
        "17849539664607285",
        "1421105996287938",
        "17846226593822368",
        "105870034142833",
        "17849224223494131",
        "17844082992109595",
        "17845605576211591",
        "17846265992645472",
        "17848945131046879",
        "17842703340524797",
        "17845325259431010",
        "17842103414112951",
        "17849831711501991",
        "17848657521425015"
    ]);

    // ---------------- STATE ----------------
    let currentThreadId = null;
    let overlay = null;

    // ---------------- HELPERS ----------------
    function getThreadId() {
        const match = location.pathname.match(/\/direct\/t\/(\d+)/);
        return match ? match[1] : null;
    }

    function storageKey() {
        return `floating-canvas::instagram::${currentThreadId}`;
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
        loadState().forEach(createFloatingImage);
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
            e.stopPropagation();
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
            e.stopPropagation();
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

    // ---------------- DROP (HARD BLOCK) ----------------
    function blockEvent(e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
    }

    document.addEventListener('dragover', blockEvent, true);

    document.addEventListener('drop', e => {
        blockEvent(e);
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
    }, true);

    // Absolute safety net (prevents browser navigation)
    window.addEventListener('drop', e => e.preventDefault(), true);

    // ---------------- SPA WATCH ----------------
    function checkThreadChange() {
        const threadId = getThreadId();

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

    ['pushState', 'replaceState'].forEach(fn => {
        const original = history[fn];
        history[fn] = function () {
            original.apply(this, arguments);
            checkThreadChange();
        };
    });

    window.addEventListener('popstate', checkThreadChange);

    const observer = new MutationObserver(checkThreadChange);
    observer.observe(document.body, { childList: true, subtree: true });

    // Init
    checkThreadChange();
})();
