# Video Feedback

A two-page site for client video reviews.

- **`index.html` — client page.** They watch the cut, click the timeline to drop a note at that exact second (or drag to mark a section), add photos, and see when you've fixed things.
- **`admin.html` — your editor page (login required).** Add/edit videos, set the length, choose what the client sees, drag notes to fix their times, reply, and check items off.

Works right away in **demo mode** (saves to your browser only). Follow the steps below to make it live.

---

## 1. Set up Firebase (free plan is fine)

1. Go to **console.firebase.google.com** → **Create a project**. Skip Google Analytics.
2. **Add a web app:** on the project home page click the **`</>`** icon → give it a nickname → **Register app**. Copy the `firebaseConfig` values into **`js/config.js`**.
3. **Turn on sign-in:** left menu → **Build → Authentication → Get started**. Under **Sign-in method**, enable:
   - **Email/Password** (for you)
   - **Anonymous** (lets clients edit their own notes without an account)
4. **Make your login:** Authentication → **Users** tab → **Add user** → your email + a strong password.
   Copy the **User UID** shown in that list.
5. **Paste your UID in two places:**
   - `js/config.js` → `ADMIN_UID: "..."`
   - `firestore.rules` → replace `PASTE_YOUR_UID_HERE`
6. **Create the database:** **Build → Firestore Database → Create database** → pick a location near you → start in **production mode**.
7. **Lock it down:** in Firestore, open the **Rules** tab → delete what's there → paste the whole `firestore.rules` file → **Publish**.

## 2. Put it on GitHub Pages

1. Create a new repo on GitHub (public is fine — see the safety note below).
2. **Add file → Upload files** → drag in everything from this folder (keep the `css`, `fonts` and `js` folders) → **Commit**.
3. Repo **Settings → Pages** → Source: **Deploy from a branch** → Branch: **main**, folder **/ (root)** → **Save**.
4. In a minute your site is at `https://YOUR-USERNAME.github.io/REPO-NAME/`
5. Back in Firebase: **Authentication → Settings → Authorized domains → Add domain** → `YOUR-USERNAME.github.io`

**Your links**
- Client: `https://YOUR-USERNAME.github.io/REPO-NAME/` (or use **Copy client link** on the editor page)
- You: `https://YOUR-USERNAME.github.io/REPO-NAME/admin.html`

## 3. Using it

1. Sign in on `admin.html` → **⚙ Page title & welcome** to set what the client sees up top.
2. **+ New** → title, paste the video link, hit **Detect** (or type the length like `4:32`), turn on **Shown to client**, **Save**.
3. Send the client link. Their notes show up live in your **Checklist**.
4. Check items off as you fix them. Add a reply if you want — the client sees "✓ Done" plus your reply.
5. New cut? Paste the new link and update the length on the same video, or add a new video (e.g. "Promo v2") and hide the old one.

**Video links that work best**
| Link | Plays | Notes jump to the right spot |
|---|---|---|
| YouTube (set to **Unlisted**) | ✅ | ✅ |
| Vimeo | ✅ | ✅ |
| Direct `.mp4` / Dropbox | ✅ | ✅ |
| Google Drive (shared "Anyone with the link") | ✅ | ❌ — clients type or click the time instead |

## Good to know

- **Is it safe that the code is public?** Yes. The Firebase config isn't a password. The Firestore rules are what protect things: only your UID can edit videos, check off notes, or reply. Clients can only add, move, or delete *their own* notes until you check them off.
- **Photos** are shrunk automatically and stored in the database, so you don't need Firebase's paid Storage plan.
- **Free plan limits** (1 GB stored, 50k reads a day) are way more than one client will use.
- **Clients and devices:** clients can edit their notes on the same browser they wrote them on. You can edit any note.
- **Testing locally:** the pages use JavaScript modules, so double-clicking `index.html` won't work. Use the GitHub Pages link, or run `npx serve` in this folder.

## Files

```
index.html          client page
admin.html          editor page
css/style.css       all styling
fonts/              The Inquisition (headings + buttons)
js/config.js        ← your Firebase settings + UID go here
js/client.js        client page logic
js/admin.js         editor page logic
js/timeline.js      the draggable timeline bar
js/player.js        YouTube / Vimeo / Drive / mp4 player
js/photos.js        photo thumbnails
js/store*.js        saving data (Firebase, or demo mode)
firestore.rules     ← paste into Firebase, with your UID
```
