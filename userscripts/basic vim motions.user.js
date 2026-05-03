// ==UserScript==
// @name         Vim Motions for Inputs
// @namespace    http://tampermonkey.net/
// @version      6.1
// @description  Vim motions in input/textarea/contenteditable. ` = NORMAL, v = VISUAL, i/a = INSERT.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const NORMAL_MODE_KEY = "`";

    let mode         = "insert";
    let lastKey      = null;
    let lastKeyTimer = null;
    let visualAnchor = null;  // char offset where 'v' was pressed — never moves
    let visualHead   = null;  // char offset of the moving end of selection
                              // NEVER read getCaret() for motion math in visual mode;
                              // always use visualHead so selectionStart ambiguity
                              // (which returns the LOW end, not the cursor end) can't
                              // corrupt the second+ motion in a visual selection.

    // ── HUD ───────────────────────────────────────────────────────────────────
    const hud = document.createElement("div");
    Object.assign(hud.style, {
        position:"fixed", bottom:"18px", right:"18px", zIndex:"2147483647",
        fontFamily:"monospace", fontSize:"13px", fontWeight:"700",
        letterSpacing:"0.08em", padding:"4px 10px", borderRadius:"4px",
        pointerEvents:"none", userSelect:"none", opacity:"0", transition:"opacity 0.15s",
    });
    document.documentElement.appendChild(hud);

    function updateHUD() {
        clearTimeout(hud._t);
        const cfg = {
            insert: { label:"INSERT", bg:"#98c379", fade:true  },
            normal: { label:"NORMAL", bg:"#e5c07b", fade:false },
            visual: { label:"VISUAL", bg:"#c678dd", fade:false },
        }[mode];
        hud.textContent = cfg.label;
        Object.assign(hud.style, { background:cfg.bg, color:"#1e1e1e", opacity:"1" });
        if (cfg.fade) hud._t = setTimeout(() => { hud.style.opacity = "0"; }, 1200);
    }

    // ── Block cursor ──────────────────────────────────────────────────────────
    const caretStyle = document.createElement("style");
    document.head.appendChild(caretStyle);

    const block = document.createElement("div");
    Object.assign(block.style, {
        position:"fixed", pointerEvents:"none", zIndex:"2147483646",
        display:"none", background:"rgba(229,192,123,0.9)", borderRadius:"1px", overflow:"hidden",
    });
    document.documentElement.appendChild(block);

    const blockChar = document.createElement("span");
    Object.assign(blockChar.style, {
        position:"absolute", top:"0", left:"0",
        color:"#1a1a1a", userSelect:"none", pointerEvents:"none", whiteSpace:"pre",
    });
    block.appendChild(blockChar);

    let blinkTimer = null;
    let rafId      = null;
    let blinkOn    = true;
    let cursorEl   = null;

    const COPY_PROPS = [
        "fontFamily","fontSize","fontWeight","fontStyle","fontVariant",
        "letterSpacing","wordSpacing","textTransform","textIndent",
        "lineHeight","whiteSpace","wordBreak","overflowWrap",
        "paddingTop","paddingRight","paddingBottom","paddingLeft",
        "borderTopWidth","borderRightWidth","borderBottomWidth","borderLeftWidth",
        "boxSizing","tabSize",
    ];

    function getCaretCoords(el, atPos) {
        // atPos: optional override — in visual mode pass visualHead explicitly
        // so the block tracks the moving end, not wherever selectionStart is.
        const fieldRect = el.getBoundingClientRect();
        const cs = window.getComputedStyle(el);
        const mirror = document.createElement("div");
        for (const p of COPY_PROPS) mirror.style[p] = cs[p];
        Object.assign(mirror.style, {
            position:"fixed",
            top: fieldRect.top + "px", left: fieldRect.left + "px",
            width: fieldRect.width + "px", height: fieldRect.height + "px",
            visibility:"hidden", overflow:"hidden", margin:"0",
            whiteSpace: el.tagName === "TEXTAREA" ? "pre-wrap" : "pre",
            pointerEvents:"none",
        });
        const val = getValue(el);
        const pos = atPos !== undefined ? atPos : getCaret(el);
        const ch  = val[pos];
        mirror.appendChild(document.createTextNode(val.slice(0, pos)));
        const marker = document.createElement("span");
        marker.textContent = (ch !== undefined && ch !== "\n") ? ch : "\u00a0";
        mirror.appendChild(marker);
        if (ch !== undefined) mirror.appendChild(document.createTextNode(val.slice(pos + 1)));
        document.documentElement.appendChild(mirror);
        mirror.scrollTop  = el.scrollTop;
        mirror.scrollLeft = el.scrollLeft;
        const mr = marker.getBoundingClientRect();
        document.documentElement.removeChild(mirror);
        const fontSize = parseFloat(cs.fontSize);
        return {
            x: mr.left, y: mr.top,
            w: mr.width  > 0.5 ? mr.width  : fontSize * 0.55,
            h: mr.height > 0.5 ? mr.height : fontSize * 1.2,
            ch: (ch !== undefined && ch !== "\n") ? ch : " ",
            font: `${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`,
            fx1: fieldRect.left, fy1: fieldRect.top,
            fx2: fieldRect.right, fy2: fieldRect.bottom,
        };
    }

    function renderBlock() {
        const el = cursorEl;
        if (!el || mode === "insert" || getActiveEditable() !== el) { _hideBlock(); return; }
        if (!blinkOn) { block.style.display = "none"; return; }
        // In visual mode, draw the block at visualHead (the moving end), not selectionStart
        const drawAt = (mode === "visual" && visualHead !== null) ? visualHead : undefined;
        let c;
        try { c = getCaretCoords(el, drawAt); } catch (_) { _hideBlock(); return; }
        if (c.x + c.w <= c.fx1 || c.x >= c.fx2 || c.y + c.h <= c.fy1 || c.y >= c.fy2) {
            block.style.display = "none"; return;
        }
        const bx = Math.max(c.x, c.fx1);
        const by = Math.max(c.y, c.fy1);
        const bw = Math.min(c.x + c.w, c.fx2) - bx;
        const bh = Math.min(c.y + c.h, c.fy2) - by;
        block.style.background = mode === "visual"
            ? "rgba(198,120,221,0.9)"
            : "rgba(229,192,123,0.9)";
        Object.assign(block.style, { display:"block", left:bx+"px", top:by+"px", width:bw+"px", height:bh+"px" });
        blockChar.textContent      = c.ch;
        blockChar.style.font       = c.font;
        blockChar.style.lineHeight = bh + "px";
    }

    function _hideBlock() {
        block.style.display = "none";
        cancelAnimationFrame(rafId); clearInterval(blinkTimer);
        rafId = null; blinkTimer = null;
    }

    function startBlock(el) {
        cursorEl = el;
        cancelAnimationFrame(rafId); clearInterval(blinkTimer);
        blinkOn = true;
        blinkTimer = setInterval(() => { blinkOn = !blinkOn; renderBlock(); }, 530);
        (function tick() { renderBlock(); rafId = requestAnimationFrame(tick); })();
    }

    function updateCursor(el) {
        if (!el) el = getActiveEditable();
        if ((mode === "normal" || mode === "visual") && el && isEditable(el)) {
            caretStyle.textContent =
                "input:focus,textarea:focus,[contenteditable]:focus" +
                "{caret-color:transparent!important;cursor:default!important}";
            startBlock(el);
        } else {
            caretStyle.textContent =
                "input:focus,textarea:focus,[contenteditable]:focus" +
                "{caret-color:auto!important;cursor:text!important}";
            _hideBlock();
        }
    }

    // ── Visual selection highlight ────────────────────────────────────────────
    // Paints the native selection highlight between anchor and head (inclusive).
    // Uses lo/hi so it works regardless of which direction the user extended.
    function applyVisualSelection(el, anchor, head) {
        const lo  = Math.min(anchor, head);
        const hi  = Math.max(anchor, head) + 1;        // +1: visual is end-inclusive
        const len = getValue(el).length;
        const clampedHi = Math.min(hi, len);
        if (el.setSelectionRange) {
            try { el.setSelectionRange(lo, clampedHi); } catch (_) {}
        } else {
            try {
                const s = getNodeAtOffset(el, lo);
                const e2 = getNodeAtOffset(el, clampedHi);
                if (!s || !e2) return;
                const range = document.createRange();
                range.setStart(s.node, s.offset);
                range.setEnd(e2.node, e2.offset);
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(range);
            } catch (_) {}
        }
    }

    // ── Element helpers ───────────────────────────────────────────────────────
    function getActiveEditable() {
        let el = document.activeElement;
        while (el && el.shadowRoot && el.shadowRoot.activeElement) {
            el = el.shadowRoot.activeElement;
        }
        return isEditable(el) ? el : null;
    }

    function isEditable(el) {
        if (!el) return false;
        if (el.isContentEditable) return true;
        if (el.tagName === "TEXTAREA") return true;
        if (el.tagName === "INPUT") {
            const t = (el.type || "text").toLowerCase();
            return ["text","search","url","email","password","tel"].includes(t);
        }
        return false;
    }

    function getValue(el) {
        if (el.value !== undefined) return el.value;
        return getTextContent(el);
    }

    function getTextContent(el) {
        let text = "";
        const BLOCK_TAGS = new Set(["P","DIV","LI","BR","H1","H2","H3","H4","H5","H6","TR","BLOCKQUOTE"]);
        function walk(node, isFirst) {
            if (node.nodeType === Node.TEXT_NODE) {
                text += node.nodeValue;
            } else if (node.nodeType === Node.ELEMENT_NODE) {
                const tag = node.tagName.toUpperCase();
                if (tag === "BR") { text += "\n"; return; }
                const isBlock = BLOCK_TAGS.has(tag);
                if (isBlock && !isFirst && text.length > 0 && text[text.length-1] !== "\n") text += "\n";
                let first = true;
                for (const child of node.childNodes) { walk(child, first); first = false; }
                if (isBlock && text.length > 0 && text[text.length-1] !== "\n") text += "\n";
            }
        }
        walk(el, true);
        return text.replace(/\n$/, "");
    }

    function setValue(el, val) {
        if (el.value !== undefined) {
            const desc =
                Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,  "value") ||
                Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,"value");
            if (desc && desc.set) desc.set.call(el, val); else el.value = val;
            el.dispatchEvent(new Event("input",  { bubbles:true }));
            el.dispatchEvent(new Event("change", { bubbles:true }));
        } else {
            el.innerText = val;
            el.dispatchEvent(new InputEvent("input", { bubbles:true }));
        }
    }

    // ── Caret (only used outside visual mode, or on entry/exit) ──────────────
    function getCaret(el) {
        if (el.selectionStart !== undefined) return el.selectionStart;
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return 0;
        const range = sel.getRangeAt(0);
        const preRange = document.createRange();
        preRange.selectNodeContents(el);
        preRange.setEnd(range.endContainer, range.endOffset);
        return preRange.toString().length;
    }

    function moveCaret(el, pos) {
        const len = getValue(el).length;
        pos = Math.max(0, Math.min(pos, len));
        if (el.setSelectionRange) {
            try { el.setSelectionRange(pos, pos); } catch (_) {}
            return;
        }
        const result = getNodeAtOffset(el, pos);
        if (!result) return;
        try {
            const range = document.createRange();
            range.setStart(result.node, result.offset);
            range.collapse(true);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch (_) {}
    }

    function getNodeAtOffset(root, targetOffset) {
        let remaining = targetOffset;
        const iter = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        let node;
        while ((node = iter.nextNode())) {
            const len = node.nodeValue.length;
            if (remaining <= len) return { node, offset: remaining };
            remaining -= len;
        }
        if (node) return { node, offset: node.nodeValue.length };
        return null;
    }

    function resetLastKey() { lastKey = null; clearTimeout(lastKeyTimer); }

    function copyText(text) {
        navigator.clipboard.writeText(text).catch(() => {
            const ta = document.createElement("textarea");
            ta.value = text; ta.style.cssText = "position:fixed;opacity:0";
            document.body.appendChild(ta); ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
        });
    }

    // ── Word motions ──────────────────────────────────────────────────────────
    function nextWordStart(val, pos) {
        let i = pos;
        if (/\w/.test(val[i] || "")) { while (i < val.length && /\w/.test(val[i])) i++; }
        while (i < val.length && /\W/.test(val[i])) i++;
        return i;
    }
    function prevWordStart(val, pos) {
        let i = pos - 1;
        while (i > 0 && /\W/.test(val[i])) i--;
        while (i > 0 && /\w/.test(val[i - 1])) i--;
        return Math.max(0, i);
    }
    function wordEnd(val, pos) {
        let i = pos + 1;
        while (i < val.length && /\W/.test(val[i])) i++;
        while (i < val.length - 1 && /\w/.test(val[i + 1])) i++;
        return Math.min(val.length - 1, i);
    }

    // ── Shared motion resolver ────────────────────────────────────────────────
    function resolveMotion(key, val, pos) {
        switch (key) {
            case "h": return Math.max(0, pos - 1);
            case "l": return Math.min(val.length, pos + 1);
            case "w": return nextWordStart(val, pos);
            case "b": return prevWordStart(val, pos);
            case "e": return wordEnd(val, pos);
            case "G": return val.length;
            case "0": return val.lastIndexOf("\n", pos - 1) + 1;
            case "$": { const e2 = val.indexOf("\n", pos); return e2 === -1 ? val.length : e2; }
            case "^": {
                const s  = val.lastIndexOf("\n", pos - 1) + 1;
                const e3 = val.indexOf("\n", s);
                const ln = val.slice(s, e3 === -1 ? val.length : e3);
                const nb = ln.search(/\S/);
                return s + (nb === -1 ? 0 : nb);
            }
            case "j":
            case "k": {
                const lines = val.split("\n");
                let cc = 0, cl = 0, col = 0;
                for (let i = 0; i < lines.length; i++) {
                    if (pos <= cc + lines[i].length) { cl = i; col = pos - cc; break; }
                    cc += lines[i].length + 1;
                }
                const tl = key === "j"
                    ? Math.min(lines.length - 1, cl + 1)
                    : Math.max(0, cl - 1);
                let np = 0;
                for (let i = 0; i < tl; i++) np += lines[i].length + 1;
                return np + Math.min(col, lines[tl].length);
            }
            default: return null;
        }
    }

    // ── Key handler ───────────────────────────────────────────────────────────
    function handleKey(e) {
        const el = getActiveEditable();
        if (!el) return;

        // Backtick always returns to normal from any mode
        if (e.key === NORMAL_MODE_KEY && !e.ctrlKey && !e.altKey && !e.metaKey) {
            if (mode !== "normal") {
                const collapseAt = mode === "visual" ? visualHead : getCaret(el);
                mode = "normal"; visualAnchor = null; visualHead = null;
                moveCaret(el, collapseAt);
                updateHUD(); updateCursor(el);
                e.preventDefault();
            }
            return;
        }

        if (mode === "insert") return;

        if (e.ctrlKey || e.altKey || e.metaKey) return;
        e.preventDefault();
        e.stopPropagation();

        const val = getValue(el);

        // ══════════════════════════════════════════════════════════════════════
        // VISUAL MODE
        // ══════════════════════════════════════════════════════════════════════
        if (mode === "visual") {
            const anchor = visualAnchor;
            const head   = visualHead;   // ← always use this, never getCaret()

            if (e.key === "Escape") {
                mode = "normal"; visualAnchor = null; visualHead = null;
                moveCaret(el, head);
                updateHUD(); updateCursor(el);
                return;
            }

            // Motions: move head, anchor stays fixed
            const newHead = resolveMotion(e.key, val, head);
            if (newHead !== null) {
                visualHead = newHead;
                applyVisualSelection(el, anchor, newHead);
                // renderBlock reads visualHead directly — no moveCaret needed
                return;
            }

            // Operators
            const lo = Math.min(anchor, head);
            const hi = Math.max(anchor, head) + 1;

            switch (e.key) {
                case "d":
                case "x": {
                    copyText(val.slice(lo, hi));
                    setValue(el, val.slice(0, lo) + val.slice(hi));
                    mode = "normal"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                case "y": {
                    copyText(val.slice(lo, hi));
                    mode = "normal"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                case "c": {
                    copyText(val.slice(lo, hi));
                    setValue(el, val.slice(0, lo) + val.slice(hi));
                    mode = "insert"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                case "p": {
                    navigator.clipboard.readText().then(text => {
                        const v2 = getValue(el);
                        setValue(el, v2.slice(0, lo) + text + v2.slice(hi));
                        mode = "normal"; visualAnchor = null; visualHead = null;
                        moveCaret(el, lo + text.length - 1);
                        updateHUD(); updateCursor(el);
                    }).catch(() => {});
                    return;
                }
                case "U": {
                    setValue(el, val.slice(0, lo) + val.slice(lo, hi).toUpperCase() + val.slice(hi));
                    mode = "normal"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                case "u": {
                    setValue(el, val.slice(0, lo) + val.slice(lo, hi).toLowerCase() + val.slice(hi));
                    mode = "normal"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                case "~": {
                    const tog = val.slice(lo, hi).split("").map(c =>
                        c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()
                    ).join("");
                    setValue(el, val.slice(0, lo) + tog + val.slice(hi));
                    mode = "normal"; visualAnchor = null; visualHead = null;
                    moveCaret(el, lo);
                    break;
                }
                default: break;
            }

            updateHUD(); updateCursor(el);
            return;
        }

        // ══════════════════════════════════════════════════════════════════════
        // NORMAL MODE
        // ══════════════════════════════════════════════════════════════════════
        const pos = getCaret(el);   // safe here — not in visual mode
        if (lastKey === "d" && e.key !== "d") resetLastKey();
        if (lastKey === "y" && e.key !== "y") resetLastKey();

        // Enter visual
        if (e.key === "v") {
            mode = "visual";
            visualAnchor = pos;
            visualHead   = pos;
            applyVisualSelection(el, pos, pos);
            updateHUD(); updateCursor(el);
            return;
        }

        switch (e.key) {
            case "i": { mode = "insert"; break; }
            case "a": { mode = "insert"; moveCaret(el, Math.min(val.length, pos + 1)); break; }
            case "A": {
                mode = "insert";
                const eolA = val.indexOf("\n", pos);
                moveCaret(el, eolA === -1 ? val.length : eolA);
                break;
            }
            case "I": {
                mode = "insert";
                moveCaret(el, val.lastIndexOf("\n", pos - 1) + 1);
                break;
            }
            case "o": {
                if (el.tagName === "TEXTAREA" || el.isContentEditable) {
                    const eolO = val.indexOf("\n", pos);
                    const atO  = eolO === -1 ? val.length : eolO;
                    setValue(el, val.slice(0, atO) + "\n" + val.slice(atO));
                    moveCaret(el, atO + 1);
                    mode = "insert";
                }
                break;
            }

            case "h": case "l": case "w": case "b": case "e":
            case "j": case "k": case "G": case "0": case "$": case "^": {
                const np = resolveMotion(e.key, val, pos);
                if (np !== null) moveCaret(el, np);
                break;
            }

            case "g": {
                if (lastKey === "g") { moveCaret(el, 0); resetLastKey(); return; }
                lastKey = "g";
                lastKeyTimer = setTimeout(resetLastKey, 1000);
                return;
            }

            case "x": {
                if (pos < val.length) {
                    setValue(el, val.slice(0, pos) + val.slice(pos + 1));
                    moveCaret(el, Math.min(pos, getValue(el).length));
                }
                break;
            }
            case "X": {
                if (pos > 0) {
                    setValue(el, val.slice(0, pos - 1) + val.slice(pos));
                    moveCaret(el, pos - 1);
                }
                break;
            }
            case "d": {
                if (lastKey === "d") {
                    if (el.tagName === "TEXTAREA" || el.isContentEditable) {
                        const ls = val.split("\n");
                        let cc = 0, cl = 0;
                        for (let i = 0; i < ls.length; i++) {
                            if (pos <= cc + ls[i].length) { cl = i; break; }
                            cc += ls[i].length + 1;
                        }
                        ls.splice(cl, 1);
                        setValue(el, ls.join("\n"));
                        let nc = 0;
                        const tl = Math.min(cl, ls.length - 1);
                        if (ls.length > 0) for (let i = 0; i < tl; i++) nc += ls[i].length + 1;
                        moveCaret(el, nc);
                    } else {
                        setValue(el, ""); moveCaret(el, 0);
                    }
                    resetLastKey(); return;
                }
                lastKey = "d"; lastKeyTimer = setTimeout(resetLastKey, 1000); return;
            }
            case "y": {
                if (lastKey === "y") {
                    const ls2 = val.split("\n");
                    let cc2 = 0, cl2 = 0;
                    for (let i = 0; i < ls2.length; i++) {
                        if (pos <= cc2 + ls2[i].length) { cl2 = i; break; }
                        cc2 += ls2[i].length + 1;
                    }
                    copyText(ls2[cl2] + "\n");
                    resetLastKey(); return;
                }
                lastKey = "y"; lastKeyTimer = setTimeout(resetLastKey, 1000); return;
            }
            case "p": {
                navigator.clipboard.readText().then(text => {
                    const v2 = getValue(el), p2 = getCaret(el);
                    setValue(el, v2.slice(0, p2 + 1) + text + v2.slice(p2 + 1));
                    moveCaret(el, p2 + 1 + text.length - 1);
                }).catch(() => {});
                break;
            }
            case "P": {
                navigator.clipboard.readText().then(text => {
                    const v2 = getValue(el), p2 = getCaret(el);
                    setValue(el, v2.slice(0, p2) + text + v2.slice(p2));
                    moveCaret(el, p2 + text.length - 1);
                }).catch(() => {});
                break;
            }

            default: { resetLastKey(); return; }
        }

        if (e.key !== "d" && e.key !== "g" && e.key !== "y") resetLastKey();
        updateHUD();
        updateCursor(el);
    }

    // ── Events ────────────────────────────────────────────────────────────────
    document.addEventListener("keydown", handleKey, true);
    document.addEventListener("focusin",  () => { const el = getActiveEditable(); if (el) { updateHUD(); updateCursor(el); } });
    document.addEventListener("focusout", _hideBlock);

    updateHUD();
    updateCursor(null);

})();
