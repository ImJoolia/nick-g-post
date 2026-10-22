// Real backend: Firebase Auth + Cloud Firestore.
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut as fbSignOut
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, addDoc, setDoc, updateDoc, deleteDoc,
  getDocs, query, where, serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const ms = (ts) => (ts && ts.toMillis ? ts.toMillis() : Date.now());
const withId = (d) => ({ id: d.id, ...d.data(), createdAt: ms(d.data().createdAt), updatedAt: ms(d.data().updatedAt) });

export const store = {
  mode: "firebase",

  onAuth(cb) {
    return onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, isAnonymous: u.isAnonymous } : null));
  },
  signInClient() { return signInAnonymously(auth); },
  signInAdmin(email, pw) { return signInWithEmailAndPassword(auth, email, pw); },
  signOut() { return fbSignOut(auth); },

  // Site-wide text the client sees (title + welcome message)
  watchSettings(cb, onErr) {
    return onSnapshot(doc(db, "settings", "site"), (s) => cb(s.exists() ? s.data() : {}), onErr);
  },
  saveSettings(data) {
    return setDoc(doc(db, "settings", "site"), { ...data, updatedAt: serverTimestamp() }, { merge: true });
  },

  watchVideos({ admin }, cb, onErr) {
    const ref = collection(db, "videos");
    const q = admin ? ref : query(ref, where("visible", "==", true));
    return onSnapshot(q, (snap) => cb(snap.docs.map(withId)), onErr);
  },
  async saveVideo(id, data) {
    if (id) {
      await updateDoc(doc(db, "videos", id), { ...data, updatedAt: serverTimestamp() });
      return id;
    }
    const r = await addDoc(collection(db, "videos"), { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return r.id;
  },
  async deleteVideo(id) {
    const notes = await getDocs(collection(db, "videos", id, "notes"));
    for (const n of notes.docs) await this.deleteNote(id, n.id);
    await deleteDoc(doc(db, "videos", id));
  },

  watchNotes(videoId, cb, onErr) {
    return onSnapshot(collection(db, "videos", videoId, "notes"), (snap) => cb(snap.docs.map(withId)), onErr);
  },
  async addNote(videoId, data) {
    const r = await addDoc(collection(db, "videos", videoId, "notes"), {
      ...data, done: false, reply: "", createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    });
    return r.id;
  },
  updateNote(videoId, noteId, patch) {
    return updateDoc(doc(db, "videos", videoId, "notes", noteId), { ...patch, updatedAt: serverTimestamp() });
  },
  async deleteNote(videoId, noteId) {
    const photos = await getDocs(collection(db, "videos", videoId, "notes", noteId, "photos"));
    if (photos.size) {
      const b = writeBatch(db);
      photos.docs.forEach((p) => b.delete(p.ref));
      await b.commit();
    }
    await deleteDoc(doc(db, "videos", videoId, "notes", noteId));
  },

  watchPhotos(videoId, noteId, cb, onErr) {
    return onSnapshot(collection(db, "videos", videoId, "notes", noteId, "photos"), (snap) => cb(snap.docs.map(withId)), onErr);
  },
  addPhoto(videoId, noteId, photo) {
    return addDoc(collection(db, "videos", videoId, "notes", noteId, "photos"), { ...photo, createdAt: serverTimestamp() });
  },
  deletePhoto(videoId, noteId, photoId) {
    return deleteDoc(doc(db, "videos", videoId, "notes", noteId, "photos", photoId));
  },

  stamp: () => serverTimestamp()
};
