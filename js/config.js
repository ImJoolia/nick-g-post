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
//  STEP 2 — Editor account UIDs (one per person who can use admin.html).
//  Find them in Firebase → Authentication → Users → "User UID".
//  Paste them here AND in firestore.rules. Delete the second line if only one editor.
// ─────────────────────────────────────────────────────────────
export const ADMIN_UIDS = [
  "HEXRUwfmshRpa0Rv61w6JUQYSy53",
  "v8LbsgRjwFgNNFnWhXVs0IczvSQ2"
];

export const DEMO_MODE = !firebaseConfig.apiKey;
