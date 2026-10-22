// ─────────────────────────────────────────────────────────────
//  STEP 1 — Paste your Firebase web config here.
//  (Firebase console → Project settings → Your apps → Web app → "Config")
//
//  While apiKey is empty the site runs in DEMO MODE: everything works,
//  but data only lives in this browser. Great for trying it out.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyC8xbPJ7M7ftMhOiIGm0ZoRoWhA0gHsWU8",
  authDomain: "nick-g-post.firebaseapp.com",
  projectId: "nick-g-post",
  storageBucket: "nick-g-post.firebasestorage.app",
  messagingSenderId: "921187562560",
  appId: "1:921187562560:web:0372e7210f58b8d2c61ba5"
};

// ─────────────────────────────────────────────────────────────
//  STEP 2 — Your editor account's UID.
//  Log in on admin.html once; the page shows your UID if it's not set.
//  Paste it here AND in firestore.rules.
// ─────────────────────────────────────────────────────────────
export const ADMIN_UID = "";

export const DEMO_MODE = !firebaseConfig.apiKey;
