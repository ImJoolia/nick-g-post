// The editable timeline bar.
//  • Click the bar → note at that second.  • Drag across the bar → note for a time range.
//  • Drag a pin/range you're allowed to edit → move it.  • Drag a range's ends → resize it.
//  • Click the ruler → jump the video there.
import { fmtTime, clamp } from "./util.js";

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600];

export function createTimeline(root, opts) {
  let state = { duration: 0, notes: [], selectedId: null };
  root.classList.add("tl");
  root.innerHTML = `
    <div class="tl-ruler" title="Click to jump the video here"></div>
    <div class="tl-track" tabindex="0" aria-label="Video timeline. Click to add a note, drag to mark a range.">
      <div class="tl-ranges"></div>
      <div class="tl-pins"></div>
      <div class="tl-draft" hidden></div>
      <div class="tl-playhead" hidden></div>
      <div class="tl-hover" hidden><span></span></div>
    </div>
    <div class="tl-empty" hidden>Video length isn't set yet.</div>`;
  const ruler = root.querySelector(".tl-ruler");
  const track = root.querySelector(".tl-track");
  const rangesEl = root.querySelector(".tl-ranges");
  const pinsEl = root.querySelector(".tl-pins");
  const draft = root.querySelector(".tl-draft");
  const playhead = root.querySelector(".tl-playhead");
  const hover = root.querySelector(".tl-hover");
  const empty = root.querySelector(".tl-empty");

  const pct = (t) => (state.duration ? (t / state.duration) * 100 : 0);
  const timeAt = (clientX) => {
    const r = track.getBoundingClientRect();
    return Math.round(clamp((clientX - r.left) / r.width, 0, 1) * state.duration);
  };

  function renderRuler() {
    const d = state.duration;
    if (!d) { ruler.innerHTML = ""; return; }
    const width = track.clientWidth || 600;
    const maxLabels = Math.max(2, Math.floor(width / 70));
    const step = STEPS.find((s) => d / s <= maxLabels) || 3600;
    let html = "";
    for (let t = 0; t <= d + 0.001; t += step) {
      const p = pct(t);
      const edge = p > 96 ? " end" : "";
      html += `<span class="tick${edge}" style="left:${p}%"><i></i>${fmtTime(t)}</span>`;
    }
    ruler.innerHTML = html;
  }

  function renderMarkers() {
    const d = state.duration;
    rangesEl.innerHTML = ""; pinsEl.innerHTML = "";
    if (!d) return;
    // Stack overlapping ranges into lanes so they stay readable
    const lanes = [];
    const ranges = state.notes.filter((n) => n.end != null).sort((a, b) => a.start - b.start);
    const laneOf = {};
    for (const n of ranges) {
      let i = lanes.findIndex((end) => end <= n.start);
      if (i === -1) { i = lanes.length; lanes.push(0); }
      lanes[i] = n.end; laneOf[n.id] = Math.min(i, 2);
    }
    for (const n of state.notes) {
      const editable = opts.canEdit?.(n);
      const cls = `${n.done ? " done" : ""}${n.id === state.selectedId ? " sel" : ""}${editable ? " editable" : ""}`;
      const label = `Note ${n.num}, ${fmtTime(n.start)}${n.end != null ? "–" + fmtTime(n.end) : ""}${n.done ? ", done" : ""}`;
      if (n.end != null) {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "tl-range" + cls;
        el.dataset.id = n.id;
        el.style.left = pct(n.start) + "%";
        el.style.width = Math.max(0.6, pct(n.end) - pct(n.start)) + "%";
        el.style.setProperty("--lane", laneOf[n.id]);
        el.setAttribute("aria-label", label);
        el.innerHTML = `<b>${n.done ? "✓" : n.num}</b>${editable ? '<span class="h h-l" data-edge="start"></span><span class="h h-r" data-edge="end"></span>' : ""}`;
        rangesEl.appendChild(el);
      }
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "tl-pin" + cls + (n.end != null ? " is-range" : "");
      pin.dataset.id = n.id;
      pin.style.left = pct(n.start) + "%";
      pin.setAttribute("aria-label", label);
      pin.innerHTML = `<b>${n.done ? "✓" : n.num}</b>`;
      pin.title = `${fmtTime(n.start)} — ${n.text.slice(0, 60)}`;
      pinsEl.appendChild(pin);
    }
  }

  function render() {
    empty.hidden = !!state.duration;
    track.classList.toggle("disabled", !state.duration);
    renderRuler();
    renderMarkers();
  }

  // ── Dragging ───────────────────────────────────────────
  let drag = null;

  track.addEventListener("pointerdown", (e) => {
    if (!state.duration || e.button > 0) return;
    const markEl = e.target.closest(".tl-pin, .tl-range");
    const edge = e.target.dataset?.edge;
    const t = timeAt(e.clientX);
    if (markEl) {
      const note = state.notes.find((n) => n.id === markEl.dataset.id);
      if (!note) return;
      drag = { type: "move", note, edge, x0: e.clientX, t0: t, start: note.start, end: note.end, moved: false, el: markEl, editable: opts.canEdit?.(note) };
    } else {
      if (opts.readOnlyTrack) return;
      drag = { type: "new", x0: e.clientX, t0: t, t1: t, moved: false };
    }
    track.setPointerCapture(e.pointerId);
    e.preventDefault();
  });

  track.addEventListener("pointermove", (e) => {
    if (state.duration) {
      const t = timeAt(e.clientX);
      hover.hidden = false;
      hover.style.left = pct(t) + "%";
      hover.firstElementChild.textContent = fmtTime(t);
    }
    if (!drag) return;
    if (Math.abs(e.clientX - drag.x0) > 5) drag.moved = true;
    if (!drag.moved) return;
    const t = timeAt(e.clientX);
    if (drag.type === "new") {
      drag.t1 = t;
      const a = Math.min(drag.t0, t), b = Math.max(drag.t0, t);
      draft.hidden = false;
      draft.style.left = pct(a) + "%";
      draft.style.width = pct(b) - pct(a) + "%";
      draft.dataset.label = `${fmtTime(a)}–${fmtTime(b)}`;
    } else if (drag.editable) {
      const dt = t - drag.t0;
      let s = drag.start, en = drag.end;
      if (drag.edge === "start") s = clamp(drag.start + dt, 0, en - 1);
      else if (drag.edge === "end") en = clamp(drag.end + dt, s + 1, state.duration);
      else if (en != null) {
        const len = en - s;
        s = clamp(drag.start + dt, 0, state.duration - len); en = s + len;
      } else s = clamp(drag.start + dt, 0, state.duration);
      drag.ns = s; drag.ne = en;
      // live preview
      const n = state.notes.find((x) => x.id === drag.note.id);
      n.start = s; n.end = en;
      renderMarkers();
      hover.style.left = pct(s) + "%";
      hover.firstElementChild.textContent = fmtTime(s) + (en != null ? "–" + fmtTime(en) : "");
    }
  });

  const endDrag = (e) => {
    if (!drag) return;
    const d = drag; drag = null;
    draft.hidden = true;
    if (d.type === "new") {
      if (d.moved && d.t0 !== d.t1) opts.onCreate?.({ start: Math.min(d.t0, d.t1), end: Math.max(d.t0, d.t1) });
      else opts.onCreate?.({ start: d.t0, end: null });
    } else if (d.moved && d.editable && d.ns != null && (d.ns !== d.start || d.ne !== d.end)) {
      opts.onMove?.(d.note, { start: d.ns, end: d.ne ?? null });
    } else if (!d.moved) {
      opts.onSelect?.(d.note);
    } else {
      render(); // snapped back (not allowed to edit)
    }
  };
  track.addEventListener("pointerup", endDrag);
  track.addEventListener("pointercancel", () => { drag = null; draft.hidden = true; render(); });
  track.addEventListener("pointerleave", () => { if (!drag) hover.hidden = true; });

  // Keyboard: Enter on a marker selects it
  track.addEventListener("keydown", (e) => {
    const m = e.target.closest?.(".tl-pin, .tl-range");
    if (m && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      const note = state.notes.find((n) => n.id === m.dataset.id);
      note && opts.onSelect?.(note);
    }
  });

  ruler.addEventListener("click", (e) => {
    if (!state.duration) return;
    const r = ruler.getBoundingClientRect();
    opts.onSeek?.(Math.round(clamp((e.clientX - r.left) / r.width, 0, 1) * state.duration));
  });

  // Playhead follows the video
  let raf;
  const loop = () => {
    const t = opts.getPlayhead?.();
    if (t != null && state.duration) {
      playhead.hidden = false;
      playhead.style.left = clamp(pct(t), 0, 100) + "%";
    } else playhead.hidden = true;
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);

  const ro = new ResizeObserver(() => renderRuler());
  ro.observe(track);

  return {
    update(next) {
      if (drag && drag.type === "move" && drag.moved) return; // don't fight an active drag
      state = { ...state, ...next, notes: (next.notes ?? state.notes).map((n) => ({ ...n })) };
      render();
    },
    destroy() { cancelAnimationFrame(raf); ro.disconnect(); root.innerHTML = ""; }
  };
}

