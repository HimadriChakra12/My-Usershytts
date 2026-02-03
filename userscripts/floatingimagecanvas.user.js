// ==UserScript==
// @name         Floating Image Canvas Overlay
// @namespace    https://example.com/floating-image-canvas
// @version      1.0
// @description  Drag & drop images onto any website and move them around like a canvas
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // Create overlay
    const overlay = document.createElement('div');
    overlay.id = 'floating-image-overlay';
    Object.assign(overlay.style, {
        position: 'fixed',
        inset: '0',
        zIndex: '999999',
        pointerEvents: 'none'
    });
    document.body.appendChild(overlay);

    // Enable drag-drop on document
    document.addEventListener('dragover', e => e.preventDefault());
    document.addEventListener('drop', handleDrop);

    function handleDrop(e) {
        e.preventDefault();

        const files = [...e.dataTransfer.files];
        files.forEach(file => {
            if (!file.type.startsWith('image/')) return;

            const reader = new FileReader();
            reader.onload = () => {
                createFloatingImage(reader.result, e.clientX, e.clientY);
            };
            reader.readAsDataURL(file);
        });
    }

    function createFloatingImage(src, x, y) {
        const img = document.createElement('img');
        img.src = src;

        Object.assign(img.style, {
            position: 'fixed',
            left: x + 'px',
            top: y + 'px',
            maxWidth: '300px',
            cursor: 'grab',
            pointerEvents: 'auto',
            userSelect: 'none'
        });

        overlay.appendChild(img);

        makeDraggable(img);

        // Resize with mouse wheel
        img.addEventListener('wheel', e => {
            e.preventDefault();
            const scale = e.deltaY < 0 ? 1.1 : 0.9;
            img.width = img.width * scale;
        });

        // Remove on double click
        img.addEventListener('dblclick', () => img.remove());
    }

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
            dragging = false;
            el.style.cursor = 'grab';
        });
    }
})();
  
