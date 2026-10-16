# Setup guide — going live

Yohan, this is everything needed to turn the demo into the shared system. Plan on about 30 minutes. Do the steps in order.

---

## Step 1 · Create the Firebase project (5 min)

1. Open <https://console.firebase.google.com> and sign in with the Google account that should own the system.
2. Click **Create a project** and name it `ILP Carton Tracking`.
3. When it asks about **Google Analytics**, switch it **off** (not needed). Click **Create project**.

## Step 2 · Create the database (3 min)

1. In the left menu, open **Build → Firestore Database → Create database**.
2. **Location:** choose `asia-southeast1 (Singapore)`. It's the closest region to Vietnam. It **cannot be changed later**.
3. Choose **Start in production mode** and click **Create**.
4. Open the **Rules** tab. Delete everything there, paste the whole content of [`firestore.rules`](../firestore.rules), and click **Publish**.
   - Don't use "test mode". Test-mode rules expire after 30 days and the app would suddenly stop saving.

## Step 3 · Connect the app (3 min)

1. Click the **gear icon → Project settings**. Under **Your apps**, click the **`</>`** (Web) button.
2. Nickname: `carton-app`. Leave "Firebase Hosting" **unticked**. Click **Register app**.
3. Firebase shows a block of code containing `const firebaseConfig = { ... }`. Copy just the part inside the braces.
4. Open [`src/config.js`](../src/config.js) and replace `export const FIREBASE_CONFIG = null;` with:

   ```js
   export const FIREBASE_CONFIG = {
     apiKey: "…",
     authDomain: "…",
     projectId: "…",
     storageBucket: "…",
     messagingSenderId: "…",
     appId: "…",
   };
   ```

   (Or just paste the config into Claude Code and ask it to do this step.)

> The `apiKey` is **not a password**. Firebase web keys are meant to be public. Data is protected by the rules from Step 2.

## Step 4 · Decide on login (2 min)

Customer POs and references for brands like Prada and Lacoste will be stored here. With **open mode**, anyone who gets the link (or finds the public code) can read them.

**Recommended:** turn on login. It's a one-time sign-in per device, and after that nobody notices it.

1. Firebase → **Build → Authentication → Get started → Sign-in method → Email/Password → Enable → Save**.
2. **Users → Add user**. Create one account per warehouse, for example `printwh@idea-l-pack.com` and `packwh@idea-l-pack.com`, each with its own password. The email doesn't need a real inbox.
3. **Settings → Authorized domains → Add domain**, then add `gomayoha.github.io`.
4. In `src/config.js`, set `REQUIRE_LOGIN = true`.
5. In Firebase → Firestore → **Rules**, swap the comment marks in `allowed()` (as explained in the file), then click **Publish**.

## Step 5 · Publish the app on GitHub Pages (10 min)

This is the same way your Production Review site is published.

1. Open **GitHub Desktop → File → Add local repository**, choose this `QR WAREHOUSE` folder, and click **create a repository** when asked.
   - Name: `ILP-Carton-Tracking`. Leave the other settings as they are. Click **Create repository**.
2. **Check the file list before committing.** There must be **no** `.xlsx` files and **no** `reference/` folder. The `.gitignore` file blocks them, but look anyway: those files contain customer data.
3. Commit, then click **Publish repository**. Untick **Keep this code private** (free GitHub Pages needs a public repository; data stays in Firebase, not in the code).
4. On github.com, open the repository → **Settings → Pages**. Under **Build and deployment**, choose **Deploy from a branch → `main` → `/ (root)` → Save**.
5. After 1–2 minutes the app is live at **<https://gomayoha.github.io/ILP-Carton-Tracking/>**.
   - If you use a different repository name, update `APP_URL` in `src/config.js`. It's printed inside every QR code.

## Step 6 · First use (5 min)

1. Open the link on the warehouse PC. Go to **Items → Import from Excel**, select both **STOCK REPORT Print** and **STOCK REPORT Trading**, then click **Read files → Import**. This loads about 15,600 items.
2. **Settings → Numbering & defaults:** set **Last number used** for handoff slips to the last paper slip number actually used. The app continues from there.
3. **Settings → This device:** pick the label size for that PC's printer and click **Print a test label**. In the print dialog, set margins to **None** and scale to **100%**.
4. On each phone: open the link, then **Share → Add to Home Screen** (iPhone) or **⋮ → Install app** (Android). After that it opens like an app and works offline.

---

## Updating the app later

Ask Claude Code for the change, then commit and push in GitHub Desktop. Every device updates itself the next time the app is opened.
Claude Code should bump `VERSION` in `sw.js` on every release so phones fetch the new files.

## Free-plan limits (Firebase Spark)

50,000 reads and 20,000 writes per day, plus 1 GB storage. The app is built to stay far below this: phones only download what changed since they last synced. As a rough guide, 20 users doing a normal day's work use well under 10% of it. If you ever need more, the Blaze plan charges per use (cents per day at this volume) and needs a payment card.
