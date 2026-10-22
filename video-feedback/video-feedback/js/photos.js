// Keeps photo thumbnails for each note in sync, shared by both pages.
import { store } from "./store.js";
import { openLightbox } from "./util.js";

export function createPhotoCache(getVideoId, { canDelete } = {}) {
  const subs = new Map();   // noteId → unsubscribe
  const photos = new Map(); // noteId → [photos]

  function paint(noteId) {
    document.querySelectorAll(`[data-photos="${noteId}"]`).forEach((box) => {
      const list = photos.get(noteId) || [];
      box.innerHTML = "";
      box.hidden = !list.length;
      for (const p of list) {
        const fig = document.createElement("div");
        fig.className = "thumb";
        const img = document.createElement("img");
        img.src = p.data; img.alt = "Attached photo"; img.loading = "lazy";
        img.addEventListener("click", () => openLightbox(p.data));
        fig.appendChild(img);
        if (canDelete?.(noteId)) {
          const x = document.createElement("button");
          x.type = "button"; x.className = "thumb-x"; x.textContent = "×";
          x.setAttribute("aria-label", "Remove photo");
          x.addEventListener("click", async (e) => {
            e.stopPropagation();
            if (!confirm("Remove this photo?")) return;
            await store.deletePhoto(getVideoId(), noteId, p.id);
          });
          fig.appendChild(x);
        }
        box.appendChild(fig);
      }
    });
  }

  return {
    /** Call after rendering notes. Subscribes to any note that has photos. */
    sync(notes) {
      const want = new Set(notes.filter((n) => n.photoCount > 0).map((n) => n.id));
      for (const [id, un] of subs) if (!want.has(id)) { un(); subs.delete(id); photos.delete(id); }
      for (const id of want) {
        if (!subs.has(id)) {
          subs.set(id, store.watchPhotos(getVideoId(), id, (list) => {
            photos.set(id, list.sort((a, b) => a.createdAt - b.createdAt));
            paint(id);
          }, () => {}));
        } else paint(id);
      }
    },
    count: (id) => (photos.get(id) || []).length,
    reset() { subs.forEach((u) => u()); subs.clear(); photos.clear(); }
  };
}
