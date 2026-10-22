// ─────────────────────────────────────────────────────────────
//  STEP 1 — Paste your Firebase web config here.
//  (Firebase console → Project settings → Your apps → Web app → "Config")
//
//  While apiKey is empty the site runs in DEMO MODE: everything works,
//  but data only lives in this browser. Great for trying it out.
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: ""
};

// ─────────────────────────────────────────────────────────────
//  STEP 2 — Your editor account's UID.
//  Log in on admin.html once; the page shows your UID if it's not set.
//  Paste it here AND in firestore.rules.
// ─────────────────────────────────────────────────────────────
export const ADMIN_UID = "";

export const DEMO_MODE = !firebaseConfig.apiKey;
