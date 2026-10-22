// Turns a pasted video link into an embedded player.
// YouTube, Vimeo and direct video files (.mp4 etc., Dropbox links) can be "synced":
// clicking a note jumps the video there, and new notes can grab the current time.
// Google Drive links play, but Drive doesn't let other sites read the time.

export function parseVideoUrl(raw) {
  const url = String(raw || "").trim();
  if (!url) return { kind: "none" };
  let u;
  try { u = new URL(url); } catch { return { kind: "unknown", url }; }
  const host = u.hostname.replace(/^www\.|^m\./, "");

  if (host === "youtu.be") return { kind: "youtube", id: u.pathname.slice(1).split("/")[0] };
  if (host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    if (u.searchParams.get("v")) return { kind: "youtube", id: u.searchParams.get("v") };
    const m = u.pathname.match(/\/(embed|shorts|live|v)\/([\w-]{6,})/);
    if (m) return { kind: "youtube", id: m[2] };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = u.pathname.match(/(?:video\/)?(\d{5,})(?:\/([\da-f]+))?/);
    if (m) return { kind: "vimeo", id: m[1], hash: m[2] || u.searchParams.get("h") || "" };
  }
  if (host === "drive.google.com") {
    const m = u.pathname.match(/\/file\/d\/([\w-]+)/) || [null, u.searchParams.get("id")];
    if (m[1]) return { kind: "drive", id: m[1] };
  }
  if (host.endsWith("dropbox.com")) {
    u.searchParams.delete("dl"); u.searchParams.set("raw", "1");
    return { kind: "file", url: u.toString() };
  }
  if (/\.(mp4|m4v|mov|webm|ogv)$/i.test(u.pathname)) return { kind: "file", url };
  return { kind: "unknown", url };
}

const scripts = {};
function loadScript(src, readyCheck) {
  if (!scripts[src]) {
    scripts[src] = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src; s.async = true;
      s.onerror = () => reject(new Error("Player script blocked"));
      const timer = setTimeout(() => reject(new Error("Player took too long")), 12000);
      if (src.includes("youtube")) {
        const prev = window.onYouTubeIframeAPIReady;
        window.onYouTubeIframeAPIReady = () => { prev && prev(); clearTimeout(timer); resolve(); };
      } else {
        s.onload = () => { clearTimeout(timer); readyCheck() ? resolve() : reject(new Error("Player failed")); };
      }
      document.head.appendChild(s);
    });
  }
  return scripts[src];
}

/**
 * Mounts a player in `box`. Returns a controller:
 *  { kind, synced, time(), seek(t), duration() → Promise, destroy() }
 */
export function mountPlayer(box, rawUrl) {
  const info = parseVideoUrl(rawUrl);
  box.innerHTML = "";
  box.className = "player";
  let cur = null, dur = null, destroyFns = [];
  const ctl = {
    kind: info.kind, synced: false,
    time: () => cur,
    seek: () => {},
    duration: async () => dur,
    destroy: () => destroyFns.forEach((f) => { try { f(); } catch {} })
  };

  const fallback = (msg) => {
    box.innerHTML = `<div class="player-msg"><p>${msg}</p>${info.url || rawUrl ? `<a class="btn ghost" href="${encodeURI(info.url || rawUrl)}" target="_blank" rel="noopener">Open video in a new tab ↗</a>` : ""}</div>`;
    ctl.synced = false;
  };

  if (info.kind === "none") { fallback("No video link yet."); return ctl; }

  if (info.kind === "youtube") {
    const slot = document.createElement("div");
    box.appendChild(slot);
    loadScript("https://www.youtube.com/iframe_api", () => window.YT?.Player).then(() => {
      const p = new window.YT.Player(slot, {
        videoId: info.id, width: "100%", height: "100%",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            ctl.synced = true;
            dur = p.getDuration() || null;
            const iv = setInterval(() => { try { cur = p.getCurrentTime(); } catch {} }, 200);
            destroyFns.push(() => clearInterval(iv), () => p.destroy());
            ctl.seek = (t) => { p.seekTo(t, true); cur = t; };
            ctl.duration = async () => p.getDuration() || dur;
            box.dispatchEvent(new CustomEvent("playerready"));
          }
        }
      });
    }).catch(() => fallback("The YouTube player couldn't load here."));
    return ctl;
  }

  if (info.kind === "vimeo") {
    const iframe = document.createElement("iframe");
    iframe.src = `https://player.vimeo.com/video/${info.id}?${info.hash ? "h=" + info.hash + "&" : ""}playsinline=1`;
    iframe.allow = "autoplay; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    box.appendChild(iframe);
    loadScript("https://player.vimeo.com/api/player.js", () => window.Vimeo?.Player).then(() => {
      const p = new window.Vimeo.Player(iframe);
      p.on("timeupdate", (d) => { cur = d.seconds; dur = d.duration; });
      p.ready().then(async () => {
        ctl.synced = true;
        dur = await p.getDuration().catch(() => null);
        ctl.seek = (t) => { p.setCurrentTime(t); cur = t; };
        ctl.duration = async () => p.getDuration().catch(() => dur);
        box.dispatchEvent(new CustomEvent("playerready"));
      });
      destroyFns.push(() => p.destroy());
    }).catch(() => {});
    return ctl;
  }

  if (info.kind === "file") {
    const v = document.createElement("video");
    v.src = info.url; v.controls = true; v.playsInline = true; v.preload = "metadata";
    box.appendChild(v);
    const onTime = () => (cur = v.currentTime);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", () => {
      dur = isFinite(v.duration) ? v.duration : null;
      ctl.synced = true;
      box.dispatchEvent(new CustomEvent("playerready"));
    });
    v.addEventListener("error", () => fallback("This video file couldn't be played here."));
    ctl.seek = (t) => { v.currentTime = t; cur = t; };
    ctl.duration = async () => dur;
    destroyFns.push(() => { v.pause(); v.removeAttribute("src"); v.load(); });
    return ctl;
  }

  if (info.kind === "drive") {
    const iframe = document.createElement("iframe");
    iframe.src = `https://drive.google.com/file/d/${info.id}/preview`;
    iframe.allow = "autoplay; fullscreen";
    iframe.allowFullscreen = true;
    box.appendChild(iframe);
    const tip = document.createElement("p");
    tip.className = "player-tip";
    tip.textContent = "Google Drive videos can't share their time with this page — type the timestamp or click the timeline.";
    box.after?.(tip);
    destroyFns.push(() => tip.remove());
    return ctl;
  }

  fallback("This link can't be previewed here, but you can still leave notes on the timeline.");
  return ctl;
}
