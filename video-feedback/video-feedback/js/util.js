// Small helpers shared by both pages.

/** 83 → "1:23", 3723 → "1:02:03" */
export function fmtTime(sec) {
  if (sec == null || isNaN(sec)) return "–";
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** "1:23" → 83, "1:02:03" → 3723, "90" → 90. Returns null if it can't read it. */
export function parseTime(str) {
  if (str == null) return null;
  str = String(str).trim();
  if (!str) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(str)) return null;
  const parts = str.split(":").map(Number);
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec;
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function $(sel, root = document) { return root.querySelector(sel); }
export function $$(sel, root = document) { return [...root.querySelectorAll(sel)]; }

export function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }

/** Shrink a photo so it fits comfortably in the database (free Firebase plan, no Storage needed). */
export function compressImage(file, maxSide = 1600, maxBytes = 850_000) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) return reject(new Error("Not an image"));
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let side = maxSide, quality = 0.82, out = null, w = 0, h = 0;
      for (let i = 0; i < 8; i++) {
        const scale = Math.min(1, side / Math.max(img.width, img.height));
        w = Math.round(img.width * scale); h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);
        out = c.toDataURL("image/jpeg", quality);
        if (out.length <= maxBytes) break;
        quality = Math.max(0.5, quality - 0.1);
        side = Math.round(side * 0.8);
      }
      resolve({ data: out, w, h });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that image")); };
    img.src = url;
  });
}

let toastTimer;
export function toast(msg, kind = "") {
  let el = document.getElementById("toast");
  if (!el) {
    el = document.createElement("div");
    el.id = "toast";
    el.setAttribute("role", "status");
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.className = "show " + kind;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.className = ""), 2600);
}

/** Simple full-screen photo viewer. */
export function openLightbox(src) {
  const box = document.createElement("div");
  box.className = "lightbox";
  box.innerHTML = `<img alt="Attached photo"><button class="lightbox-x" aria-label="Close">×</button>`;
  box.querySelector("img").src = src;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  const onKey = (e) => { if (e.key === "Escape") close(); };
  box.addEventListener("click", close);
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
}

export function lsGet(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch {} }
