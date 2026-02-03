// ==UserScript==
// @name         Image Sidebar Asset Manager
// @namespace    image-sidebar-assets
// @version      1.4.2
// @description  Drag & drop image sidebar with persistent storage (IndexedDB)
// @match        *://*/*
// @grant        none
// ==/UserScript==

(() => {
    const DB_NAME = "ImageSidebarDB";
    const STORE_NAME = "images";

    /* ------------------ DB ------------------ */
    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, 1);
            req.onupgradeneeded = e => {
                e.target.result.createObjectStore(STORE_NAME, { keyPath: "id" });
            };
            req.onsuccess = e => resolve(e.target.result);
            req.onerror = reject;
        });
    }

    async function getAllImages() {
        const db = await openDB();
        return new Promise(resolve => {
            const tx = db.transaction(STORE_NAME, "readonly");
            const store = tx.objectStore(STORE_NAME);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
        });
    }

    async function saveImage(img) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).put(img);
    }

    async function deleteImage(id) {
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(id);
    }

    /* ------------------ Helpers ------------------ */
    async function saveImageToDisk(dataUrl, filename) {
        const a = document.createElement("a");
        a.href = dataUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
    }

    async function fetchImageAsDataURL(url) {
        const res = await fetch(url, { mode: "cors" });
        const blob = await res.blob();
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsDataURL(blob);
        });
    }

    function showNotification(msg) {
        const n = document.createElement("div");
        n.textContent = msg;
        n.style.cssText = `
            position:fixed;top:20px;right:240px;
            background:#2196f3;color:#fff;
            padding:10px 16px;border-radius:6px;
            z-index:1000000;
        `;
        document.body.appendChild(n);
        setTimeout(() => n.remove(), 2500);
    }

    /* ------------------ UI ------------------ */
    const sidebar = document.createElement("div");
    sidebar.id = "img-sidebar";
    sidebar.classList.add("hidden"); // 👈 auto-hide on start
    sidebar.innerHTML = `
        <h3>📁 Images</h3>
        <div style="font-size:10px;color:#888;text-align:center;margin-bottom:8px;">
            💾 Click to save • 🖱️ Drag from web
        </div>
        <div id="img-list"></div>
    `;
    document.body.appendChild(sidebar);

    const toggleBtn = document.createElement("div");
    toggleBtn.id = "img-sidebar-toggle";
    toggleBtn.textContent = "🖼️";
    document.body.appendChild(toggleBtn);

    const style = document.createElement("style");
    style.textContent = `
        #img-sidebar {
            position:fixed;right:0;top:0;width:220px;height:100vh;
            background:#111;color:#fff;z-index:999999;
            padding:8px;font-family:sans-serif;
            overflow-y:auto;transition:transform .3s;
        }
        #img-sidebar.hidden { transform:translateX(100%); }
        .img-item { margin-bottom:6px; cursor:pointer; position:relative; }
        .img-item img { width:100%; border-radius:4px; }
        .img-item button {
            position:absolute;top:4px;right:4px;
            background:red;color:white;border:none;
            font-size:10px;padding:2px 6px;
            cursor:pointer;opacity:0;
        }
        .img-item:hover button { opacity:1; }
        #img-sidebar-toggle {
            position:fixed;right:-25px;top:20px;
            width:42px;height:42px;border-radius:10px;
            background:#0000002e;color:#fff;
            display:flex;align-items:center;justify-content:center;
            cursor:pointer;z-index:1000000;
        }
    `;
    document.head.appendChild(style);

    let sidebarVisible = false;
    let autoOpenedByDrag = false; // 👈 track why it opened

    toggleBtn.onclick = () => {
        sidebarVisible = !sidebarVisible;
        autoOpenedByDrag = false;
        sidebar.classList.toggle("hidden", !sidebarVisible);
    };

    const list = sidebar.querySelector("#img-list");

    /* ------------------ Render ------------------ */
    async function render() {
        list.innerHTML = "";
        const images = await getAllImages();

        images.forEach(img => {
            const wrap = document.createElement("div");
            wrap.className = "img-item";

            const im = document.createElement("img");
            im.src = img.data;

            wrap.onclick = e => {
                if (e.target.tagName === "BUTTON") return;
                saveImageToDisk(img.data, `image-${img.id}.png`);
                showNotification("💾 Image saved");
            };

            const del = document.createElement("button");
            del.textContent = "✕";
            del.onclick = async e => {
                e.stopPropagation();
                await deleteImage(img.id);
                render();
            };

            wrap.append(im, del);
            list.appendChild(wrap);
        });
    }

    /* ------------------ AUTO OPEN ON EDGE DRAG ------------------ */
    document.addEventListener("dragover", e => {
        if (window.innerWidth - e.clientX < 40 && !sidebarVisible) {
            sidebarVisible = true;
            autoOpenedByDrag = true;
            sidebar.classList.remove("hidden");
        }
    });

    /* ------------------ DRAG FROM WEB → SIDEBAR ------------------ */
    sidebar.addEventListener("dragover", e => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
    });

    sidebar.addEventListener("drop", async e => {
        e.preventDefault();

        let didSave = false;

        // FILES
        if (e.dataTransfer.files.length) {
            for (const file of e.dataTransfer.files) {
                if (!file.type.startsWith("image/")) continue;
                const r = new FileReader();
                r.onload = async () => {
                    await saveImage({ id: crypto.randomUUID(), data: r.result });
                    render();
                };
                r.readAsDataURL(file);
                didSave = true;
            }
        } else {
            // IMAGE FROM WEB
            const url =
                e.dataTransfer.getData("text/uri-list") ||
                e.dataTransfer.getData("text/plain") ||
                e.dataTransfer.getData("text/html")?.match(/src=["']([^"']+)/)?.[1];

            if (url) {
                try {
                    const dataUrl = await fetchImageAsDataURL(url);
                    await saveImage({ id: crypto.randomUUID(), data: dataUrl });
                    render();
                    didSave = true;
                } catch {}
            }
        }

        // 👈 auto-hide again ONLY if it auto-opened
        if (didSave && autoOpenedByDrag) {
            setTimeout(() => {
                sidebarVisible = false;
                autoOpenedByDrag = false;
                sidebar.classList.add("hidden");
            }, 800); // 👈 CHANGE THIS NUMBER (milliseconds)
        }
    });

    render();
})();
