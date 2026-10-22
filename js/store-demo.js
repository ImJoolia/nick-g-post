// Demo backend: same functions as store-firebase.js, but saves to this browser only.
// Used automatically while js/config.js has no Firebase apiKey.

const KEY = "cutnotes-demo-v1";
const chan = "BroadcastChannel" in window ? new BroadcastChannel(KEY) : null;
const listeners = new Set();
const uid = () => Math.random().toString(36).slice(2, 12);

function seed() {
  const vid = "demo-video";
  return {
    settings: { title: "Your Project", welcome: "Watch each cut, then click the timeline to drop a note at the exact moment you want changed." },
    videos: {
      [vid]: {
        title: "Promo cut v1", url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ", duration: 634,
        visible: true, message: "First pass — music is temp.", order: 1,
        createdAt: Date.now(), updatedAt: Date.now(),
        notes: {
          n1: { start: 12, end: null, text: "Can the logo pop in a little faster here?", name: "Client", authorUid: "someone-else",
                done: false, reply: "", photoCount: 0, createdAt: Date.now() - 5000, updatedAt: Date.now() - 5000, photos: {} },
          n2: { start: 95, end: 130, text: "This whole section drags — trim it down.", name: "Client", authorUid: "someone-else",
                done: true, reply: "Cut 12 seconds out of the middle.", photoCount: 0, createdAt: Date.now() - 4000, updatedAt: Date.now() - 4000, photos: {} }
        }
      }
    }
  };
}

let state;
function load() {
  try { state = JSON.parse(localStorage.getItem(KEY)) || seed(); } catch { state = seed(); }
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { throw new Error("Demo storage is full — photos are big. Connect Firebase for real use."); }
  chan?.postMessage("changed");
  emit();
}
function emit() { listeners.forEach((fn) => fn()); }
function watch(fn) {
  const run = () => fn();
  listeners.add(run);
  queueMicrotask(run);
  return () => listeners.delete(run);
}
load();
chan && (chan.onmessage = () => { load(); emit(); });
window.addEventListener("storage", (e) => { if (e.key === KEY) { load(); emit(); } });

let authUser = null;
const authCbs = new Set();
function setAuth(u) { authUser = u; authCbs.forEach((cb) => cb(u)); }

const strip = (obj, ...keys) => { const o = { ...obj }; keys.forEach((k) => delete o[k]); return o; };
const tick = () => new Promise((r) => setTimeout(r, 60));

export const store = {
  mode: "demo",

  onAuth(cb) {
    authCbs.add(cb);
    if (!authUser) {
      const saved = sessionStorage.getItem(KEY + "-admin");
      if (saved) authUser = JSON.parse(saved);
    }
    queueMicrotask(() => cb(authUser));
    return () => authCbs.delete(cb);
  },
  async signInClient() {
    let id = localStorage.getItem(KEY + "-client");
    if (!id) { id = "client-" + uid(); localStorage.setItem(KEY + "-client", id); }
    setAuth({ uid: id, email: null, isAnonymous: true });
  },
  async signInAdmin(email, pw) {
    if (!email || !pw) throw new Error("Enter any email and password (demo mode).");
    const u = { uid: "demo-admin", email, isAnonymous: false };
    sessionStorage.setItem(KEY + "-admin", JSON.stringify(u));
    setAuth(u);
  },
  async signOut() { sessionStorage.removeItem(KEY + "-admin"); setAuth(null); },

  watchSettings(cb) { return watch(() => cb({ ...state.settings })); },
  async saveSettings(data) { await tick(); state.settings = { ...state.settings, ...data }; save(); },

  watchVideos({ admin }, cb) {
    return watch(() => cb(Object.entries(state.videos)
      .filter(([, v]) => admin || v.visible)
      .map(([id, v]) => ({ id, ...strip(v, "notes") }))));
  },
  async saveVideo(id, data) {
    await tick();
    if (id) Object.assign(state.videos[id], data, { updatedAt: Date.now() });
    else { id = uid(); state.videos[id] = { ...data, notes: {}, createdAt: Date.now(), updatedAt: Date.now() }; }
    save();
    return id;
  },
  async deleteVideo(id) { await tick(); delete state.videos[id]; save(); },

  watchNotes(videoId, cb) {
    return watch(() => {
      const v = state.videos[videoId];
      cb(v ? Object.entries(v.notes || {}).map(([id, n]) => ({ id, ...strip(n, "photos") })) : []);
    });
  },
  async addNote(videoId, data) {
    await tick();
    const id = uid();
    state.videos[videoId].notes[id] = { ...data, done: false, reply: "", photos: {}, createdAt: Date.now(), updatedAt: Date.now() };
    save();
    return id;
  },
  async updateNote(videoId, noteId, patch) {
    await tick();
    const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => typeof v !== "object" || v === null));
    Object.assign(state.videos[videoId].notes[noteId], clean, { updatedAt: Date.now() });
    if ("doneAt" in patch) state.videos[videoId].notes[noteId].doneAt = patch.doneAt ? Date.now() : null;
    save();
  },
  async deleteNote(videoId, noteId) { await tick(); delete state.videos[videoId].notes[noteId]; save(); },

  watchPhotos(videoId, noteId, cb) {
    return watch(() => {
      const n = state.videos[videoId]?.notes?.[noteId];
      cb(n ? Object.entries(n.photos || {}).map(([id, p]) => ({ id, ...p })) : []);
    });
  },
  async addPhoto(videoId, noteId, photo) {
    await tick();
    const n = state.videos[videoId].notes[noteId];
    n.photos[uid()] = { ...photo, createdAt: Date.now() };
    try { save(); } catch (e) { delete n.photos[Object.keys(n.photos).pop()]; throw e; }
  },
  async deletePhoto(videoId, noteId, photoId) {
    await tick();
    delete state.videos[videoId].notes[noteId].photos[photoId];
    save();
  },

  stamp: () => Date.now()
};
