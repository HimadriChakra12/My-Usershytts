// ==UserScript==
// @name         Floating Image Canvas Overlay (Persistent)
// @namespace    https://example.com/floating-image-canvas
// @version      1.1
// @description  Drag & drop images onto any website and move them around like a canvas (with persistence)
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const STORAGE_KEY = 'floating-image-overlay-state';

    // ---------- Overlay ----------
    const overlay = document.createElement('div');
    overlay.id = 'floating-image-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '999999',
        pointerEvents: 'none'
    });
    document.body.appendChild(overlay);

    // ---------- Persistence ----------
    function loadState() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
        } catch {
            return [];
        }
    }

    function saveState(state) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }

    function updateImageState(id, data) {
        const state = loadState();
        const img = state.find(i => i.id === id);
        if (!img) return;
        Object.assign(img, data);
        saveState(state);
    }

    function removeImageState(id) {
        const state = loadState().filter(i => i.id !== id);
        saveState(state);
    }

    // ---------- Restore on load ----------
    loadState().forEach(img =>
        createFloatingImage(img.src, img.x, img.y, img.width, img.id)
    );

    // ---------- Drag & drop ----------
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', handleDrop);

    function handleDrop(e) {
        e.preventDefault();

        [...e.dataTransfer.files].forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = () => {
                const id = crypto.randomUUID();
                const x = e.clientX;
                const y = e.clientY;

                const state = loadState();
                state.push({ id, src: reader.result, x, y, width: 300 });
                saveState(state);

                createFloatingImage(reader.result, x, y, 300, id);
            };
            reader.readAsDataURL(file);
        });
    }

    // ---------- Image ----------
    function createFloatingImage(src, x, y, width = 300, id) {
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

        // Resize with wheel
        img.addEventListener('wheel', e => {
            e.preventDefault();
            const scale = e.deltaY < 0 ? 1.1 : 0.9;
            img.width *= scale;

            updateImageState(id, { width: img.width });
        });

        // Remove
        img.addEventListener('dblclick', () => {
            removeImageState(id);
            img.remove();
        });
    }

    // ---------- Dragging ----------
    function makeDraggable(el) {
        let offsetX = 0;
        let offsetY = 0;
        let dragging = false;

        el.addEventListener('mousedown', e => {
            dragging = true;
            el.style.cursor = 'grabbing';
            offsetX = e.clientX - el.getBoundingClientRect().left;
            offsetY = e.clientY - el.getBoundingClientRect().top;
            e.preventDefault();
        });

        document.addEventListener('mousemove', e => {
            if (!dragging) return;
            el.style.left = e.clientX - offsetX + 'px';
            el.style.top = e.clientY - offsetY + 'px';
        });

        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;
            el.style.cursor = 'grab';

            updateImageState(el.dataset.id, {
                x: parseFloat(el.style.left),
                y: parseFloat(el.style.top)
            });
        });
    }
})();
