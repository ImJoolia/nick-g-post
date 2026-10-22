// Client page: watch the cut, drop timestamped notes (with photos) on the timeline.
import { store } from "./store.js";
import { mountPlayer } from "./player.js";
import { createTimeline } from "./timeline.js";
import { createPhotoCache } from "./photos.js";
import { $, $$, esc, fmtTime, parseTime, compressImage, toast, lsGet, lsSet } from "./util.js";

let me = null;
let videos = [];
let current = null;          // selected video doc
let player = null;
let playerUrl = null;
let notes = [];
let unNotes = null;
let filter = "all";
let selectedId = null;
let composer = { mode: "new", noteId: null, newPhotos: [] };

const photoCache = createPhotoCache(() => current?.id, {
  canDelete: (noteId) => { const n = notes.find((x) => x.id === noteId); return n && n.authorUid === me?.uid && !n.done; }
});

if (store.mode === "demo") $("#demo-banner").hidden = false;

const timeline = createTimeline($("#timeline"), {
  canEdit: (n) => n.authorUid === me?.uid && !n.done,
  onCreate: ({ start, end }) => openComposer({ start, end }),
  onSelect: (n) => selectNote(n.id, true),
  onMove: async (n, { start, end }) => {
    try {
      await store.updateNote(current.id, n.id, { start, end });
      toast(`Moved to ${fmtTime(start)}${end != null ? "–" + fmtTime(end) : ""}`);
    } catch (e) { fail(e); }
  },
  onSeek: (t) => player?.synced && player.seek(t),
  getPlayhead: () => (player?.synced ? player.time() : null)
});

// ── Auth: clients sign in invisibly (anonymous) so they can edit their own notes ──
store.onAuth((u) => {
  if (!u) return store.signInClient().catch((e) => fail(e, "Couldn't connect. Ask your editor to turn on Anonymous sign-in in Firebase."));
  if (me?.uid === u.uid) return;
  me = u;
  start();
});

let started = false;
function start() {
  if (started) { renderNotes(); return; }
  started = true;
  store.watchSettings((s) => {
    $("#site-title").textContent = s.title || "Video feedback";
    $("#site-welcome").textContent = s.welcome || "";
    document.title = (s.title || "Video") + " — Feedback";
  }, (e) => fail(e));

  store.watchVideos({ admin: false }, (list) => {
    videos = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
    renderTabs();
    const wanted = new URLSearchParams(location.search).get("v");
    const pick = videos.find((v) => v.id === (current?.id || wanted)) || videos[0];
    $("#empty-state").hidden = !!pick;
    $("#review").hidden = !pick;
    if (pick) selectVideo(pick); else teardownVideo();
  }, (e) => fail(e));
}

function renderTabs() {
  const nav = $("#video-tabs");
  nav.hidden = videos.length < 2;
  nav.innerHTML = videos.map((v) =>
    `<button type="button" data-id="${v.id}" class="${v.id === current?.id ? "on" : ""}">${esc(v.title || "Untitled")}</button>`).join("");
}
$("#video-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-id]");
  if (!b) return;
  const v = videos.find((x) => x.id === b.dataset.id);
  if (v && v.id !== current?.id) {
    history.replaceState(null, "", "?v=" + v.id);
    selectVideo(v);
  }
});

function teardownVideo() {
  unNotes?.(); unNotes = null;
  player?.destroy(); player = null; playerUrl = null;
  photoCache.reset();
  current = null;
}

function selectVideo(v) {
  const switching = v.id !== current?.id;
  if (switching) { teardownVideo(); closeComposer(); selectedId = null; }
  current = v;
  renderTabs();
  $("#video-title").textContent = v.title || "Untitled video";
  const msg = $("#editor-message");
  msg.hidden = !v.message;
  msg.innerHTML = v.message ? `<b>From your editor:</b> ${esc(v.message)}` : "";

  if (v.url !== playerUrl) {
    player?.destroy();
    playerUrl = v.url;
    const box = $("#player");
    player = mountPlayer(box, v.url);
    box.addEventListener("playerready", refreshDuration, { once: true });
  }
  refreshDuration();

  if (switching) {
    unNotes = store.watchNotes(v.id, (list) => { notes = list; renderNotes(); }, (e) => fail(e));
  } else renderNotes();
}

async function refreshDuration() {
  let d = current?.duration || 0;
  if (!d && player?.synced) d = Math.round((await player.duration()) || 0);
  $("#video-length").textContent = d ? `Length ${fmtTime(d)}` : "";
  timeline.update({ duration: d });
  renderNotes();
}
const duration = () => current?.duration || 0;

// ── Notes list ────────────────────────────────────────────
function sortedNotes() {
  return [...notes].sort((a, b) => a.start - b.start || a.createdAt - b.createdAt).map((n, i) => ({ ...n, num: i + 1 }));
}

function renderNotes() {
  const all = sortedNotes();
  timeline.update({ notes: all, selectedId });
  const counts = { all: all.length, open: all.filter((n) => !n.done).length, done: all.filter((n) => n.done).length };
  $$(".filters button").forEach((b) => {
    b.classList.toggle("on", b.dataset.filter === filter);
    b.querySelector("span").textContent = counts[b.dataset.filter];
  });
  const shown = all.filter((n) => filter === "all" || (filter === "done" ? n.done : !n.done));
  $("#notes-empty").hidden = !!shown.length;
  $("#notes-empty").textContent = all.length ? "Nothing here." : "No notes yet. Click the timeline to add the first one.";
  $("#notes").innerHTML = shown.map(noteCard).join("");
  photoCache.sync(all);
}

function noteCard(n) {
  const mine = n.authorUid === me?.uid;
  const time = fmtTime(n.start) + (n.end != null ? "–" + fmtTime(n.end) : "");
  return `<li class="note${n.done ? " done" : ""}${n.id === selectedId ? " sel" : ""}" data-id="${n.id}">
    <div class="note-top">
      <span class="num">${n.num}</span>
      <button type="button" class="time-chip mono" data-act="seek">${time}</button>
      <span class="status ${n.done ? "is-done" : "is-open"}">${n.done ? "✓ Done" : "Open"}</span>
    </div>
    <p class="note-text">${esc(n.text)}</p>
    <div class="thumbs" data-photos="${n.id}" hidden></div>
    ${n.reply ? `<div class="reply"><b>Editor:</b> ${esc(n.reply)}</div>` : ""}
    <div class="note-foot">
      <span class="muted">${esc(n.name || "Anonymous")}${mine ? " (you)" : ""}</span>
      ${mine && !n.done ? `<span class="note-btns"><button type="button" class="link" data-act="edit">Edit</button><button type="button" class="link danger" data-act="del">Delete</button></span>` : ""}
    </div>
  </li>`;
}

$("#notes").addEventListener("click", async (e) => {
  const li = e.target.closest(".note");
  if (!li) return;
  const n = notes.find((x) => x.id === li.dataset.id);
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (act === "edit") return openComposer(n, n.id);
  if (act === "del") {
    if (!confirm("Delete this note?")) return;
    try { await store.deleteNote(current.id, n.id); toast("Note deleted"); } catch (err) { fail(err); }
    return;
  }
  if (e.target.closest(".thumbs")) return;
  selectNote(n.id, true);
});

function selectNote(id, seek) {
  selectedId = id;
  const n = notes.find((x) => x.id === id);
  if (seek && n && player?.synced) player.seek(n.start);
  if (filter !== "all" && n && (filter === "done") !== !!n.done) filter = "all";
  renderNotes();
  $(`.note[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

$(".filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (b) { filter = b.dataset.filter; renderNotes(); }
});

// ── Composer (new + edit) ─────────────────────────────────
const form = $("#composer");
$("#c-name").value = lsGet("cutnotes-name", "");

function openComposer(vals, editId = null) {
  composer = { mode: editId ? "edit" : "new", noteId: editId, newPhotos: [] };
  $("#composer-title").textContent = editId ? "Edit note" : "New note";
  $("#c-start").value = vals.start != null ? fmtTime(vals.start) : "";
  $("#c-end").value = vals.end != null ? fmtTime(vals.end) : "";
  $("#c-text").value = vals.text || "";
  if (vals.name) $("#c-name").value = vals.name;
  $("#c-grab").hidden = !player?.synced;
  renderPreviews();
  form.hidden = false;
  form.scrollIntoView({ block: "nearest", behavior: "smooth" });
  setTimeout(() => (vals.start != null ? $("#c-text") : $("#c-start")).focus(), 150);
}
function closeComposer() { form.hidden = true; composer.newPhotos = []; form.reset?.(); $("#c-name").value = lsGet("cutnotes-name", ""); }
$$("[data-cancel]", form).forEach((b) => b.addEventListener("click", closeComposer));

$("#add-now").addEventListener("click", () => {
  const t = player?.synced ? Math.round(player.time() || 0) : null;
  openComposer({ start: t, end: null });
});
$("#c-grab").addEventListener("click", () => {
  if (!player?.synced) return;
  const t = Math.round(player.time() || 0);
  const s = $("#c-start");
  if (s.value && !$("#c-end").value && parseTime(s.value) < t) $("#c-end").value = fmtTime(t);
  else s.value = fmtTime(t);
});

$("#c-photos").addEventListener("change", async (e) => {
  const files = [...e.target.files];
  e.target.value = "";
  for (const f of files) {
    try { composer.newPhotos.push(await compressImage(f)); }
    catch (err) { toast(err.message, "bad"); }
  }
  renderPreviews();
});
function renderPreviews() {
  const box = $("#c-previews");
  box.innerHTML = composer.newPhotos.map((p, i) =>
    `<div class="thumb"><img src="${p.data}" alt="New photo ${i + 1}"><button type="button" class="thumb-x" data-i="${i}" aria-label="Remove">×</button></div>`).join("");
}
$("#c-previews").addEventListener("click", (e) => {
  const x = e.target.closest(".thumb-x");
  if (x) { composer.newPhotos.splice(+x.dataset.i, 1); renderPreviews(); }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const start = parseTime($("#c-start").value);
  const endRaw = $("#c-end").value.trim();
  const end = endRaw ? parseTime(endRaw) : null;
  const text = $("#c-text").value.trim();
  const name = $("#c-name").value.trim();
  const d = duration();
  if (start == null) return toast("Start time should look like 1:23", "bad");
  if (endRaw && end == null) return toast("End time should look like 1:45", "bad");
  if (end != null && end <= start) return toast("End time needs to be after the start", "bad");
  if (d && (start > d || (end ?? 0) > d)) return toast(`The video is only ${fmtTime(d)} long`, "bad");
  if (!text) return toast("Write what you'd like changed", "bad");
  lsSet("cutnotes-name", name);

  const btn = $("#c-save");
  btn.disabled = true; btn.textContent = "Saving…";
  try {
    let id = composer.noteId;
    const existing = id ? photoCache.count(id) : 0;
    const total = existing + composer.newPhotos.length;
    if (composer.mode === "edit") {
      await store.updateNote(current.id, id, { start, end, text, name, photoCount: total });
    } else {
      id = await store.addNote(current.id, { start, end, text, name, authorUid: me.uid, photoCount: composer.newPhotos.length });
    }
    let failed = 0;
    for (const p of composer.newPhotos) {
      try { await store.addPhoto(current.id, id, p); } catch (err) { failed++; console.error(err); }
    }
    if (failed) await store.updateNote(current.id, id, { photoCount: total - failed }).catch(() => {});
    closeComposer();
    selectedId = id;
    renderNotes();
    toast(failed ? `Saved, but ${failed} photo(s) didn't upload` : composer.mode === "edit" ? "Note updated" : "Note added", failed ? "bad" : "good");
  } catch (err) { fail(err); }
  finally { btn.disabled = false; btn.textContent = "Save note"; }
});

// Show where the video is right now
setInterval(() => {
  const t = player?.synced ? player.time() : null;
  $("#now-time").textContent = t != null ? `Video at ${fmtTime(t)}` : "";
}, 300);

function fail(err, friendly) {
  console.error(err);
  const msg = friendly || (String(err?.code || "").includes("permission") ? "That action isn't allowed." : err?.message || "Something went wrong");
  toast(msg, "bad");
}
