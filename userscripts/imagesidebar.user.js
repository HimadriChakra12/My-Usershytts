// ==UserScript==
// @name         Image Sidebar Asset Manager
// @namespace    image-sidebar-assets
// @version      1.2
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

    /* ------------------ Helper: Convert URL to Blob ------------------ */
    async function urlToBlob(url) {
        try {
            const response = await fetch(url);
            return await response.blob();
        } catch (e) {
            console.error("Failed to fetch image:", e);
            return null;
        }
    }

    /* ------------------ UI ------------------ */
    const sidebar = document.createElement("div");
    sidebar.id = "img-sidebar";
    sidebar.innerHTML = `<h3>📁 Images</h3><div id="img-list"></div>`;
    document.body.appendChild(sidebar);

    const style = document.createElement("style");
    style.textContent = `
        #img-sidebar {
            position: fixed;
            right: 0;
            top: 0;
            width: 220px;
            height: 100vh;
            background: #111;
            color: #fff;
            z-index: 999999;
            font-family: sans-serif;
            padding: 8px;
            overflow-y: auto;
            box-shadow: -2px 0 8px rgba(0,0,0,0.3);
        }
        #img-sidebar h3 {
            margin: 0 0 8px;
            font-size: 14px;
            text-align: center;
        }
        .img-item {
            margin-bottom: 6px;
            cursor: grab;
            position: relative;
            border: 2px solid transparent;
            border-radius: 4px;
            transition: border-color 0.2s;
        }
        .img-item:hover {
            border-color: #4caf50;
        }
        .img-item.dragging {
            opacity: 0.5;
            cursor: grabbing;
        }
        .img-item img {
            width: 100%;
            border-radius: 4px;
            display: block;
            pointer-events: none;
            user-select: none;
        }
        .img-item button {
            position: absolute;
            top: 4px;
            right: 4px;
            background: red;
            color: white;
            border: none;
            cursor: pointer;
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 3px;
            z-index: 10;
        }
        .img-item button:hover {
            background: #c00;
        }
        #img-sidebar.dragover {
            outline: 3px dashed #4caf50;
            background: #1a1a1a;
        }
    `;
    document.head.appendChild(style);

    const list = sidebar.querySelector("#img-list");

    /* ------------------ Render ------------------ */
    async function render() {
        list.innerHTML = "";
        const images = await getAllImages();

        images.forEach(img => {
            const wrap = document.createElement("div");
            wrap.className = "img-item";
            wrap.draggable = true;

            const image = document.createElement("img");
            image.src = img.data;
            image.alt = "Draggable image";

            // DRAG FROM SIDEBAR TO WEBSITE
            wrap.addEventListener("dragstart", async (e) => {
                wrap.classList.add("dragging");

                e.dataTransfer.effectAllowed = "copy";

                // Convert data URL to blob for file upload compatibility
                let blob;
                if (img.data.startsWith('data:')) {
                    // Convert data URL to blob
                    const response = await fetch(img.data);
                    blob = await response.blob();
                } else {
                    // Try to fetch external URL
                    blob = await urlToBlob(img.data);
                }

                if (blob) {
                    // Create a File object (required for most file inputs)
                    const file = new File([blob], `image-${img.id}.${blob.type.split('/')[1] || 'png'}`, {
                        type: blob.type
                    });

                    // Set file data (for file inputs and upload areas)
                    e.dataTransfer.items.add(file);
                }

                // Also set URL formats (for regular drag/drop)
                e.dataTransfer.setData("text/uri-list", img.data);
                e.dataTransfer.setData("text/html", `<img src="${img.data}" alt="Image">`);
                e.dataTransfer.setData("text/plain", img.data);

                // Create drag preview
                const dragImage = image.cloneNode();
                dragImage.style.width = "100px";
                dragImage.style.height = "100px";
                dragImage.style.objectFit = "cover";
                dragImage.style.position = "absolute";
                dragImage.style.top = "-9999px";
                document.body.appendChild(dragImage);
                e.dataTransfer.setDragImage(dragImage, 50, 50);
                setTimeout(() => dragImage.remove(), 0);
            });

            wrap.addEventListener("dragend", () => {
                wrap.classList.remove("dragging");
            });

            const del = document.createElement("button");
            del.textContent = "✕";
            del.onclick = async (e) => {
                e.stopPropagation();
                await deleteImage(img.id);
                render();
            };

            wrap.append(image, del);
            list.appendChild(wrap);
        });
    }

    /* ------------------ DRAG FROM WEBSITE TO SIDEBAR ------------------ */

    // Intercept all image drag starts on the page
    document.addEventListener("dragstart", (e) => {
        // Check if dragging an image element
        if (e.target.tagName === "IMG") {
            const imgSrc = e.target.src || e.target.currentSrc;
            if (imgSrc) {
                // Store the image source for later
                e.dataTransfer.setData("text/uri-list", imgSrc);
                e.dataTransfer.setData("text/html", e.target.outerHTML);
                e.dataTransfer.effectAllowed = "copy";
            }
        }
    }, true);

    sidebar.addEventListener("dragover", (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "copy";
        sidebar.classList.add("dragover");
    });

    sidebar.addEventListener("dragleave", (e) => {
        if (e.target === sidebar || !sidebar.contains(e.relatedTarget)) {
            sidebar.classList.remove("dragover");
        }
    });

    sidebar.addEventListener("drop", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        sidebar.classList.remove("dragover");

        // Priority 1: Handle file drops (from file manager)
        if (e.dataTransfer.files.length > 0) {
            for (const file of e.dataTransfer.files) {
                if (!file.type.startsWith("image/")) continue;

                const reader = new FileReader();
                reader.onload = async () => {
                    await saveImage({
                        id: crypto.randomUUID(),
                        data: reader.result
                    });
                    render();
                };
                reader.readAsDataURL(file);
            }
            return;
        }

        // Priority 2: Handle image URL drops (from websites)
        const imageUrl = e.dataTransfer.getData("text/uri-list") ||
                        e.dataTransfer.getData("text/html")?.match(/src=["']([^"']+)["']/)?.[1] ||
                        e.dataTransfer.getData("text/plain");

        if (imageUrl) {
            try {
                // Check if it's already a data URL
                if (imageUrl.startsWith('data:image/')) {
                    await saveImage({
                        id: crypto.randomUUID(),
                        data: imageUrl
                    });
                    render();
                    return;
                }

                // Try to fetch and convert to data URL for storage
                const response = await fetch(imageUrl);
                const blob = await response.blob();

                if (blob.type.startsWith('image/')) {
                    const reader = new FileReader();
                    reader.onload = async () => {
                        await saveImage({
                            id: crypto.randomUUID(),
                            data: reader.result
                        });
                        render();
                    };
                    reader.readAsDataURL(blob);
                }
            } catch (error) {
                // If fetch fails (CORS, etc), store the URL directly
                console.warn("Could not fetch image, storing URL:", error);
                await saveImage({
                    id: crypto.randomUUID(),
                    data: imageUrl
                });
                render();
            }
        }
    });

    render();
})();
