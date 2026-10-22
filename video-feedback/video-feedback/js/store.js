// Picks the real Firebase backend, or the in-browser demo if Firebase isn't set up yet.
import { DEMO_MODE } from "./config.js";

export const store = DEMO_MODE
  ? (await import("./store-demo.js")).store
  : (await import("./store-firebase.js")).store;
