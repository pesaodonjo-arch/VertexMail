# Vertex Mail → Android app with real notifications
### Complete beginner guide (no experience needed)

You will do 5 things, in this order:

| Part | What | Time |
|------|------|------|
| 1 | Create a free Firebase project (this is what delivers notifications to phones) | 10 min |
| 2 | Update your website (Supabase + GitHub + Vercel) | 15 min |
| 3 | Prepare the Android app zip | 5 min |
| 4 | Build the APK with your builder | 10 min |
| 5 | Install and test on your phone | 5 min |

**How it works:** your website stays on Vercel. The Android app is a real installed app (its own icon, its own notifications) that shows your website inside it. When a new email arrives, your server tells Google's Firebase service, and Firebase wakes your phone and shows a notification – even when the app is closed.

You need: a Google account, your Vercel/GitHub/Supabase logins, and the two zip files:
`vertex-mail-web-updated.zip` (website) and `vertex-mail-android-app.zip` (Android app).

---

## PART 1 — Firebase (free)

### 1A. Create the project
1. Go to https://console.firebase.google.com and sign in with Google.
2. Click **Create a project** (or "Add project"). Name it `vertex-mail`. Click Continue.
3. Turn Google Analytics **off** (not needed). Click **Create project**, then **Continue**.

### 1B. Register the Android app → get `google-services.json`
1. On the project home page click the **Android icon** (or **Add app → Android**).
2. **Android package name:** type exactly `com.vertextech.mail`  (copy/paste – it must match exactly, no spaces).
3. App nickname: `Vertex Mail`. Leave the SHA-1 box empty. Click **Register app**.
4. Click **Download google-services.json**. Save it somewhere you can find (e.g. Desktop). **Do not change it.**
5. Click Next / Next / **Continue to console** (ignore the code they show – already done for you).

### 1C. Create the server key (lets your website send notifications)
1. Click the ⚙️ gear (top-left) → **Project settings**.
2. Open the **Service accounts** tab.
3. Click **Generate new private key** → **Generate key**. A `.json` file downloads.
4. Keep it safe. **This file is a password.** Never put it inside the app zip, never share it publicly.

> If the Service accounts tab shows "Cloud Messaging API (V1)" is disabled, click the link it shows and press **Enable**.

---

## PART 2 — Update the website

### 2A. Supabase (1 minute)
1. Open your project at https://supabase.com → left menu **SQL Editor** → **New query**.
2. Open the file `supabase/migration_004_native_push.sql` (from the web zip) in Notepad, copy everything, paste into Supabase, click **Run**. It should say "Success".

### 2B. Upload the new website files to GitHub
1. Unzip `vertex-mail-web-updated.zip`.
2. Go to your `vertex-mail` repository on GitHub → **Add file → Upload files**.
3. Open the unzipped `vertex-mail` folder, select **everything inside** (`src`, `supabase`, `package.json`, …) and drag it into the GitHub page.
   GitHub will replace the old versions of the same files.
4. Click **Commit changes**.

*(Files that changed: `src/lib/fcm.ts`, `src/lib/native-push.ts`, `src/lib/accounts.ts`, `src/lib/inbound/store-message.ts`, `src/components/mail/NativePushRegister.tsx`, `src/app/api/mail/push-subscribe/route.ts`, `src/app/(mail)/layout.tsx`, `src/app/(mail)/account/page.tsx`, `supabase/migration_004_native_push.sql`, `.env.example`.)*

### 2C. Add the Firebase key to Vercel
1. Open the service-account `.json` file from step 1C in Notepad. Select all, copy.
2. Vercel → your project → **Settings → Environment Variables**.
3. **Key:** `FIREBASE_SERVICE_ACCOUNT`  **Value:** paste the whole file contents. Choose all environments. **Save**.
4. Go to **Deployments** → the newest one → **⋯ → Redeploy**. Wait until it says Ready.
5. Write down your website address, e.g. `https://vertex-mail.vercel.app`.

---

## PART 3 — Prepare the Android app zip

1. Unzip `vertex-mail-android-app.zip` into a folder.
2. **Set your website address.** Open `capacitor.config.ts` in Notepad. Change:
   `const APP_URL = 'https://YOUR-APP.vercel.app';`
   to your real address. Must start with `https://` and have **no `/` at the end**. Save.
3. Open `android\app\src\main\assets\capacitor.config.json` in Notepad and change the `"url"` line the same way (keep `/inbox` at the end). Save.
4. **Add the Firebase file:** copy the `google-services.json` from step 1B into the folder `android\app\` (next to `build.gradle`).
5. Select everything inside the folder (`android`, `www`, `capacitor.config.ts`, `package.json`, …) → right-click → **Send to → Compressed (zipped) folder**.
   ✔ `capacitor.config.ts` must be at the top level of your new zip (not inside an extra folder).
   ✘ Do **not** add the service-account key or `node_modules`.

---

## PART 4 — Build the APK

1. On the PC that runs your builder, open a terminal in the folder containing `server.js` and run:
   `node server.js`
2. Open your web2apk site → choose the **Source / ZIP** upload → select your new zip → start the build.
3. Wait (first build can take 5–15 minutes; Gradle downloads a lot). Keep the terminal open.
4. When it says completed, download the APK.

If the build stops with a message starting with `>>> MISSING FILE` or `>>> google-services.json is for…`, the Firebase file is missing or was created with the wrong package name (must be `com.vertextech.mail`). Fix and rebuild.

---

## PART 5 — Install and test

1. Send the APK to your phone (USB, WhatsApp, Drive) and tap it. Allow "Install unknown apps" if asked.
2. Open **Vertex Mail** and log in.
3. On Android 13+ a popup asks **"Allow Vertex Mail to send you notifications?"** → tap **Allow**.
4. **Test:** from another email account (e.g. Gmail) send a message to your Vertex address. Within a few seconds you should get a notification. Try it with the app closed and the screen locked.
5. Tap the notification → it opens that conversation.

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| No permission popup | Android Settings → Apps → Vertex Mail → Notifications → turn on. Then close the app fully and reopen. |
| Email arrives but no notification | (a) `FIREBASE_SERVICE_ACCOUNT` missing/typo in Vercel, or you forgot to redeploy. (b) Migration in 2A not run. (c) You must open the app and log in at least once so the phone registers. Check Vercel → Logs for lines starting `[fcm]` or `[push]`. |
| Works, then stops after some hours (Xiaomi, Huawei, Oppo, Samsung) | Battery saver kills apps. Settings → Battery → Vertex Mail → **Unrestricted**, and enable "Autostart" if your phone has it. |
| White screen / "can't reach server" | The address in `capacitor.config.ts` is wrong or the site is down. Open it in your phone's browser to check. |
| "Could not detect project type" | Extra folder layer in the zip. Re-zip so `capacitor.config.ts` is at the top. |
| Gradle / Java errors | Builder PC needs JDK 17 and the Android SDK. Copy the red error text and ask for help. |
| Signed out but still get notifications | Sign out inside the app (it unregisters the phone). Uninstalling also stops them automatically after the next failed delivery. |

## Good to know
- Updating the **website** later never needs a new APK – the app just shows the latest site.
- You only rebuild the APK to change the app name, icon, address, or package name.
- This APK is a **debug** build for your own use. For Google Play you need a signed release build.
- Notification text shows the sender and subject + a short preview. If you'd rather hide previews on the lock screen, say so and it's a one-line change.
