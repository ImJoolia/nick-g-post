// Editor page: manage videos, fix timestamps, reply to notes, check them off.
import { store } from "./store.js";
import { ADMIN_UID } from "./config.js";
import { mountPlayer } from "./player.js";
import { createTimeline } from "./timeline.js";
import { createPhotoCache } from "./photos.js";
import { $, $$, esc, fmtTime, parseTime, toast } from "./util.js";

let me = null;
let videos = [];
let current = null;       // selected video id, or "new"
let player = null, playerUrl = null;
let notes = [];
let unNotes = null;
let filter = "all";
let selectedId = null;
let editingId = null;     // note id being edited inline, or "new"
let draftNew = null;      // {start,end} for a new editor note
let formDirty = false;
let started = false;

if (store.mode === "demo") $("#demo-banner").hidden = false;

const photoCache = createPhotoCache(() => current, { canDelete: () => true });
const isAdmin = (u) => u && !u.isAnonymous && (store.mode === "demo" || u.uid === ADMIN_UID);

// ── Auth screens ─────────────────────────────────────────
store.onAuth((u) => {
  me = u;
  $("#login").hidden = !!(u && !u.isAnonymous);
  $("#not-admin").hidden = !(u && !u.isAnonymous && !isAdmin(u));
  $("#app").hidden = !isAdmin(u);
  if (u && !u.isAnonymous && !isAdmin(u)) $("#my-uid").textContent = u.uid;
  if (isAdmin(u)) start();
});

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("#l-err"); err.hidden = true;
  try { await store.signInAdmin($("#l-email").value.trim(), $("#l-pass").value); }
  catch (ex) {
    err.hidden = false;
    err.textContent = /invalid|wrong|user-not-found|credential/i.test(ex.code || ex.message) ? "Email or password is wrong." : ex.message;
  }
});
$$("[data-signout]").forEach((b) => b.addEventListener("click", () => store.signOut().then(() => location.reload())));
$("#copy-uid").addEventListener("click", () => copy($("#my-uid").textContent, "UID copied"));

// ── Start ────────────────────────────────────────────────
function start() {
  if (started) return;
  started = true;
  store.watchSettings((s) => {
    if (document.activeElement?.closest("#settings-form")) return;
    $("#s-title").value = s.title || "";
    $("#s-welcome").value = s.welcome || "";
  }, fail);

  store.watchVideos({ admin: true }, (list) => {
    videos = list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.createdAt - b.createdAt);
    renderVideoList();
    if (current === "new") return;
    const keep = videos.find((v) => v.id === current);
    const wanted = new URLSearchParams(location.search).get("v");
    const pick = keep || videos.find((v) => v.id === wanted) || videos[0];
    if (pick) selectVideo(pick.id, !keep); else showEmpty();
  }, fail);
}

function renderVideoList() {
  $("#video-list").innerHTML = videos.map((v) => `
    <li><button type="button" class="side-item ${v.id === current ? "on" : ""}" data-id="${v.id}">
      <span class="vis ${v.visible ? "on" : ""}" title="${v.visible ? "Shown to client" : "Hidden from client"}"></span>
      <span class="side-title">${esc(v.title || "Untitled")}</span>
      <span class="mono muted">${v.duration ? fmtTime(v.duration) : ""}</span>
    </button></li>`).join("") + (current === "new" ? `<li><button class="side-item on" type="button"><span class="vis"></span><span class="side-title">New video…</span></button></li>` : "");
}
$("#video-list").addEventListener("click", (e) => {
  const b = e.target.closest("[data-id]");
  if (!b || b.dataset.id === current) return;
  if (formDirty && !confirm("You have unsaved video changes. Leave anyway?")) return;
  selectVideo(b.dataset.id, true);
});

function showEmpty() {
  teardown();
  current = null;
  $("#video-panel").hidden = true;
  $("#no-video").hidden = false;
}

function teardown() {
  unNotes?.(); unNotes = null;
  player?.destroy(); player = null; playerUrl = null;
  photoCache.reset();
  notes = []; selectedId = null; editingId = null; draftNew = null;
}

// ── Video form ───────────────────────────────────────────
function fillForm(v) {
  $("#v-title").value = v.title || "";
  $("#v-url").value = v.url || "";
  $("#v-duration").value = v.duration ? fmtTime(v.duration) : "";
  $("#v-order").value = v.order ?? "";
  $("#v-visible").checked = !!v.visible;
  $("#v-message").value = v.message || "";
  formDirty = false;
}

function selectVideo(id, fresh) {
  const v = videos.find((x) => x.id === id);
  if (!v) return;
  if (fresh || current !== id) {
    teardown();
    current = id;
    history.replaceState(null, "", "?v=" + id);
    unNotes = store.watchNotes(id, (list) => { notes = list; renderNotes(); }, fail);
    formDirty = false;
  }
  $("#no-video").hidden = true;
  $("#settings-panel").hidden = true;
  $("#video-panel").hidden = false;
  $("#review-area").hidden = false;
  $("#v-delete").hidden = false;
  $("#v-copy").hidden = false;
  $("#vf-heading").textContent = "Video details";
  if (!formDirty) fillForm(v);
  renderVideoList();

  if (v.url !== playerUrl) {
    player?.destroy();
    playerUrl = v.url;
    const box = $("#player");
    player = mountPlayer(box, v.url);
    box.addEventListener("playerready", async () => {
      // Fill in the length automatically if it's blank
      const d = Math.round((await player.duration()) || 0);
      if (d && !videoDoc()?.duration && !$("#v-duration").value) {
        $("#v-duration").value = fmtTime(d);
        formDirty = true;
        toast(`Detected length ${fmtTime(d)} — hit Save to keep it`);
      }
    }, { once: true });
  }
  timeline.update({ duration: v.duration || 0 });
  renderNotes();
}
const videoDoc = () => videos.find((v) => v.id === current);

$("#new-video").addEventListener("click", () => {
  if (formDirty && !confirm("You have unsaved video changes. Leave anyway?")) return;
  teardown();
  current = "new";
  history.replaceState(null, "", location.pathname);
  fillForm({ visible: true, order: (videos.at(-1)?.order ?? videos.length) + 1 });
  $("#vf-heading").textContent = "New video";
  $("#no-video").hidden = true;
  $("#settings-panel").hidden = true;
  $("#video-panel").hidden = false;
  $("#review-area").hidden = true;
  $("#v-delete").hidden = true;
  $("#v-copy").hidden = true;
  renderVideoList();
  $("#v-title").focus();
});

$("#video-form").addEventListener("input", () => (formDirty = true));

$("#v-detect").addEventListener("click", async () => {
  const url = $("#v-url").value.trim();
  if (!url) return toast("Paste a video link first", "bad");
  if (url !== playerUrl) {
    // load a preview so we can read its length
    $("#review-area").hidden = false;
    player?.destroy();
    playerUrl = url;
    player = mountPlayer($("#player"), url);
    await new Promise((r) => { $("#player").addEventListener("playerready", r, { once: true }); setTimeout(r, 8000); });
  }
  const d = player?.synced ? Math.round((await player.duration()) || 0) : 0;
  if (d) { $("#v-duration").value = fmtTime(d); formDirty = true; toast(`Length: ${fmtTime(d)}`, "good"); }
  else toast("Couldn't read the length from this link — type it in (e.g. 2:45)", "bad");
});

$("#video-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const durRaw = $("#v-duration").value.trim();
  const duration = durRaw ? parseTime(durRaw) : 0;
  if (durRaw && duration == null) return toast("Length should look like 2:45 or 1:02:30", "bad");
  const data = {
    title: $("#v-title").value.trim(),
    url: $("#v-url").value.trim(),
    duration: duration || 0,
    order: $("#v-order").value === "" ? 0 : Number($("#v-order").value),
    visible: $("#v-visible").checked,
    message: $("#v-message").value.trim()
  };
  // Warn if the new length cuts off existing notes
  const past = notes.filter((n) => data.duration && (n.end ?? n.start) > data.duration);
  if (past.length && !confirm(`${past.length} note(s) are past ${fmtTime(data.duration)}. Save anyway? (You can drag them back onto the timeline.)`)) return;

  const btn = $("#v-save"); btn.disabled = true;
  try {
    const id = await store.saveVideo(current === "new" ? null : current, data);
    formDirty = false;
    toast("Saved", "good");
    if (current === "new") { current = id; selectVideo(id, true); }
  } catch (ex) { fail(ex); }
  finally { btn.disabled = false; }
});

$("#v-delete").addEventListener("click", async () => {
  const v = videoDoc();
  if (!v || !confirm(`Delete “${v.title}” and all ${notes.length} of its notes? This can't be undone.`)) return;
  try { const id = current; teardown(); current = null; await store.deleteVideo(id); toast("Video deleted"); }
  catch (ex) { fail(ex); }
});

const clientUrl = (id) => new URL("index.html" + (id ? "?v=" + id : ""), location.href).href;
$("#v-copy").addEventListener("click", () => copy(clientUrl(current), "Video link copied"));
$("#copy-client").addEventListener("click", () => copy(clientUrl(), "Client link copied"));

// ── Site settings ────────────────────────────────────────
$("#open-settings").addEventListener("click", () => {
  const p = $("#settings-panel");
  p.hidden = !p.hidden;
  if (!p.hidden) { p.scrollIntoView({ behavior: "smooth", block: "start" }); $("#s-title").focus(); }
});
$("#settings-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await store.saveSettings({ title: $("#s-title").value.trim(), welcome: $("#s-welcome").value.trim() });
    toast("Client page updated", "good");
    $("#settings-panel").hidden = true;
  } catch (ex) { fail(ex); }
});

// ── Timeline ─────────────────────────────────────────────
const timeline = createTimeline($("#timeline"), {
  canEdit: () => true,
  onCreate: ({ start, end }) => { draftNew = { start, end }; editingId = "new"; filter = "all"; renderNotes(); focusEditor(); },
  onSelect: (n) => selectNote(n.id),
  onMove: async (n, { start, end }) => {
    try { await store.updateNote(current, n.id, { start, end }); toast(`Moved to ${fmtTime(start)}${end != null ? "–" + fmtTime(end) : ""}`); }
    catch (ex) { fail(ex); }
  },
  onSeek: (t) => player?.synced && player.seek(t),
  getPlayhead: () => (player?.synced ? player.time() : null)
});

// ── Checklist ────────────────────────────────────────────
function sortedNotes() {
  return [...notes].sort((a, b) => a.start - b.start || a.createdAt - b.createdAt).map((n, i) => ({ ...n, num: i + 1 }));
}

function renderNotes() {
  if (!current || current === "new") return;
  const all = sortedNotes();
  timeline.update({ notes: all, selectedId, duration: videoDoc()?.duration || 0 });

  const done = all.filter((n) => n.done).length;
  const counts = { all: all.length, open: all.length - done, done };
  $$(".check-head .filters button").forEach((b) => {
    b.classList.toggle("on", b.dataset.filter === filter);
    b.querySelector("span").textContent = counts[b.dataset.filter];
  });
  $("#progress-text").textContent = all.length ? `${done} of ${all.length} done${done === all.length ? " — nice!" : ""}` : "";
  $("#progress-bar").style.width = all.length ? (done / all.length) * 100 + "%" : "0";

  // Keep any half-typed reply/edit text when live updates come in
  const keep = {};
  $$("#checklist [data-keep]").forEach((el) => (keep[el.dataset.keep] = { v: el.value, focus: el === document.activeElement }));

  const shown = all.filter((n) => filter === "all" || (filter === "done" ? n.done : !n.done));
  let html = editingId === "new" ? editorRow({ id: "new", num: "+", ...draftNew, text: "" }) : "";
  html += shown.map((n) => (n.id === editingId ? editorRow(n) : row(n))).join("");
  $("#checklist").innerHTML = html;
  $("#check-empty").hidden = !!html;
  $("#check-empty").textContent = all.length ? "Nothing here." : "No feedback yet.";

  for (const [k, { v, focus }] of Object.entries(keep)) {
    const el = $(`#checklist [data-keep="${k}"]`);
    if (el) { el.value = v; if (focus) el.focus(); }
  }
  photoCache.sync(all);
}

function row(n) {
  const time = fmtTime(n.start) + (n.end != null ? "–" + fmtTime(n.end) : "");
  const late = videoDoc()?.duration && (n.end ?? n.start) > videoDoc().duration;
  return `<li class="check${n.done ? " done" : ""}${n.id === selectedId ? " sel" : ""}" data-id="${n.id}">
    <label class="box" title="Mark done"><input type="checkbox" data-act="done" ${n.done ? "checked" : ""}><span></span></label>
    <div class="check-body">
      <div class="note-top">
        <span class="num">${n.num}</span>
        <button type="button" class="time-chip mono" data-act="seek">${time}</button>
        ${late ? `<span class="status is-warn">Past end</span>` : ""}
        <span class="muted small">${esc(n.name || "Anonymous")}</span>
        <span class="row-end note-btns">
          <button type="button" class="link" data-act="edit">Edit</button>
          <button type="button" class="link danger" data-act="del">Delete</button>
        </span>
      </div>
      <p class="note-text">${esc(n.text)}</p>
      <div class="thumbs" data-photos="${n.id}" hidden></div>
      <div class="reply-edit">
        <textarea rows="1" data-keep="reply-${n.id}" data-reply="${n.id}" placeholder="Reply to client (optional) — e.g. Fixed, swapped the shot">${esc(n.reply || "")}</textarea>
      </div>
    </div>
  </li>`;
}

function editorRow(n) {
  const isNew = n.id === "new";
  return `<li class="check editing" data-id="${n.id}">
    <span class="num">${n.num}</span>
    <div class="check-body stack">
      <div class="time-row">
        <label>Start <input class="mono" data-keep="es-${n.id}" data-f="start" value="${n.start != null ? fmtTime(n.start) : ""}" placeholder="0:00"></label>
        <label>End <input class="mono" data-keep="ee-${n.id}" data-f="end" value="${n.end != null ? fmtTime(n.end) : ""}" placeholder="—"></label>
      </div>
      <textarea rows="3" data-keep="et-${n.id}" data-f="text" placeholder="Note text">${esc(n.text || "")}</textarea>
      <div class="row-end">
        <button type="button" class="btn ghost small" data-act="cancel">Cancel</button>
        <button type="button" class="btn primary small" data-act="save">${isNew ? "Add note" : "Save"}</button>
      </div>
    </div>
  </li>`;
}

function focusEditor() { setTimeout(() => $('#checklist .editing [data-f="text"]')?.focus(), 50); }

$("#checklist").addEventListener("click", async (e) => {
  const li = e.target.closest("li[data-id]");
  if (!li) return;
  const id = li.dataset.id;
  const act = e.target.closest("[data-act]")?.dataset.act;
  const n = notes.find((x) => x.id === id);
  try {
    if (act === "seek") return selectNote(id);
    if (act === "edit") { editingId = id; draftNew = null; renderNotes(); return focusEditor(); }
    if (act === "cancel") { editingId = null; draftNew = null; return renderNotes(); }
    if (act === "del") {
      if (!confirm("Delete this note for good?")) return;
      await store.deleteNote(current, id); toast("Note deleted"); return;
    }
    if (act === "save") return saveEditor(li, id);
  } catch (ex) { fail(ex); }
  if (!act && n && !e.target.closest("textarea, .thumbs, label")) selectNote(id);
});

$("#checklist").addEventListener("change", async (e) => {
  if (e.target.dataset.act !== "done") return;
  const id = e.target.closest("li").dataset.id;
  const done = e.target.checked;
  try {
    await store.updateNote(current, id, { done, doneAt: done ? store.stamp() : null });
    toast(done ? "Checked off ✓" : "Moved back to to-do");
  } catch (ex) { e.target.checked = !done; fail(ex); }
});

// Save replies when you click away
$("#checklist").addEventListener("focusout", async (e) => {
  const id = e.target.dataset?.reply;
  if (!id) return;
  const n = notes.find((x) => x.id === id);
  const val = e.target.value.trim();
  if (!n || (n.reply || "") === val) return;
  try { await store.updateNote(current, id, { reply: val }); toast("Reply saved", "good"); } catch (ex) { fail(ex); }
});
$("#checklist").addEventListener("input", (e) => {
  if (e.target.dataset.reply != null) { e.target.style.height = "auto"; e.target.style.height = e.target.scrollHeight + "px"; }
});

async function saveEditor(li, id) {
  const get = (f) => $(`[data-f="${f}"]`, li).value.trim();
  const start = parseTime(get("start"));
  const endRaw = get("end");
  const end = endRaw ? parseTime(endRaw) : null;
  const text = get("text");
  if (start == null) return toast("Start time should look like 1:23", "bad");
  if (endRaw && end == null) return toast("End time should look like 1:45", "bad");
  if (end != null && end <= start) return toast("End needs to be after start", "bad");
  if (!text) return toast("Note can't be empty", "bad");
  if (id === "new") {
    const nid = await store.addNote(current, { start, end, text, name: "Editor", authorUid: me.uid, photoCount: 0 });
    selectedId = nid;
  } else {
    await store.updateNote(current, id, { start, end, text });
  }
  editingId = null; draftNew = null;
  renderNotes();
  toast("Saved", "good");
}

function selectNote(id) {
  selectedId = id;
  const n = notes.find((x) => x.id === id);
  if (n && player?.synced) player.seek(n.start);
  if (filter !== "all" && n && (filter === "done") !== !!n.done) filter = "all";
  renderNotes();
  $(`#checklist li[data-id="${id}"]`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

$(".check-head .filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]");
  if (b) { filter = b.dataset.filter; renderNotes(); }
});

// ── Helpers ──────────────────────────────────────────────
async function copy(text, msg) {
  try { await navigator.clipboard.writeText(text); toast(msg, "good"); }
  catch { prompt("Copy this:", text); }
}
function fail(err) {
  console.error(err);
  toast(String(err?.code || "").includes("permission") ? "Permission denied — check your UID in firestore.rules" : err?.message || "Something went wrong", "bad");
}

window.addEventListener("beforeunload", (e) => { if (formDirty) { e.preventDefault(); e.returnValue = ""; } });
