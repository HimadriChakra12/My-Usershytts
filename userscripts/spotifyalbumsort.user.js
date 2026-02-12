// ==UserScript==
// @name         Spotify Album Grouping (Fixed + Collapse)
// @namespace    spotify-album-group
// @version      5.0
// @description  Album grouping with collapse and auto sort
// @match        https://open.spotify.com/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function () {
"use strict";

const HEADER = "album-section-header";
let groupingEnabled = true;

/* ---------- STYLE ---------- */
const style = document.createElement("style");
style.textContent = `
.${HEADER}{
    padding:8px 16px;
    font-weight:bold;
    background:rgba(255,255,255,.06);
    border-bottom:1px solid rgba(255,255,255,.2);
    cursor:pointer;
    user-select:none;
}

/* Restore normal row size everywhere */
[data-testid="tracklist-row"]{
    min-height: 56px !important;
}

[data-testid="tracklist-row"] *{
    font-size: inherit !important;
    line-height: normal !important;
}

/* Make playlist taller so Recommended stays lower */
[data-testid="playlist-tracklist"]{
    min-height: 2200px !important;
}
`;
document.head.appendChild(style);

/* ---------- HELPERS ---------- */
function rows() {
    return Array.from(
        document.querySelectorAll('[data-testid="tracklist-row"]')
    );
}

function album(row) {
    const a = row.querySelector('a[href*="/album/"]');
    return a ? a.textContent.trim() : "";
}

function trackNo(row) {
    const c = row.querySelector('[aria-colindex="1"]');
    const n = parseInt(c?.textContent);
    return isNaN(n) ? 0 : n;
}

function containerFromRows(r) {
    return r.length ? r[0].parentElement : null;
}

function clearHeaders(container) {
    container.querySelectorAll("." + HEADER)
        .forEach(e => e.remove());
}

/* ---------- COLLAPSE ---------- */
function toggleCollapse(header) {
    let el = header.nextSibling;
    const collapsed = header.dataset.closed === "1";

    header.dataset.closed = collapsed ? "0" : "1";
    header.firstChild.textContent = collapsed ? "▼ " : "▶ ";

    while (el && !el.classList?.contains(HEADER)) {
        if (el.style)
            el.style.display = collapsed ? "" : "none";
        el = el.nextSibling;
    }
}

/* ---------- SORT + GROUP ---------- */
function sortAndGroup() {
    if (!groupingEnabled) return;

    const r = rows();
    if (!r.length) return;

    const container = containerFromRows(r);
    if (!container) return;

    r.sort((a, b) => {
        const A = album(a);
        const B = album(b);
        if (A < B) return -1;
        if (A > B) return 1;
        return trackNo(a) - trackNo(b);
    });

    r.forEach(row => container.appendChild(row));
    clearHeaders(container);

    let last = null;

    r.forEach(row => {
        const alb = album(row);
        if (!alb || alb === last) return;
        last = alb;

        const h = document.createElement("div");
        h.className = HEADER;
        h.dataset.closed = "0";

        const arrow = document.createElement("span");
        arrow.textContent = "▼ ";

        h.appendChild(arrow);
        h.appendChild(
            document.createTextNode(`[${alb}] ---------------------`)
        );

        h.onclick = () => toggleCollapse(h);

        container.insertBefore(h, row);
    });
}

/* ---------- TOGGLE ---------- */
function toggleGrouping() {
    groupingEnabled = !groupingEnabled;

    const r = rows();
    if (!r.length) return;

    const container = containerFromRows(r);
    if (!container) return;

    if (!groupingEnabled) {
        clearHeaders(container);
        r.forEach(row => row.style.display = "");
    } else {
        sortAndGroup();
    }
}

/* ---------- ALBUM HEADER BUTTON ---------- */
function addHeaderArrowButton() {
    const headerCells = document.querySelectorAll('[role="columnheader"]');

    headerCells.forEach(cell => {
        if (!cell.textContent.includes("Album")) return;
        if (cell.querySelector(".album-arrow-btn")) return;

        const btn = document.createElement("span");
        indicating();

        function indicating(){
            btn.textContent = groupingEnabled ? " ▼" : " ▲";
        }

        btn.className = "album-arrow-btn";
        btn.style.cursor = "pointer";
        btn.onclick = () => {
            toggleGrouping();
            indicating();
        };

        cell.appendChild(btn);
    });
}

/* ---------- AUTO SORT ON LOAD ---------- */
function autoSort() {
    let tries = 0;

    const wait = setInterval(() => {
        const r = rows();

        if (r.length > 10) {
            clearInterval(wait);
            setTimeout(sortAndGroup, 1500);
        }

        if (++tries > 25) clearInterval(wait);
    }, 500);
}

/* ---------- INIT ---------- */
setInterval(addHeaderArrowButton, 2000);
autoSort();

})();

