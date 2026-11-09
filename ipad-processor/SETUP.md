# BailaCue Processor — native iPad app

**Development branch:** `develop` only. This is a Swift Playgrounds (.swiftpm) iPadOS prototype. The BailaCue web app and production branch are unchanged.

## What this version implements

- Paste one **Google Drive folder** URL, import all its video files into an on-device selection queue, or load the existing locked Salsa and Bachata Drive collections.
- Authorize Drive with an iOS OAuth 2.0 + PKCE sign-in; use the phone/tablet Keychain for the refresh token.
- Queue and process one video at a time. Download only the active source into iPad temporary storage, preserve the Drive original, and attempt 360p/720p/1080p MP4 exports where appropriate without upscaling.
- Validate the resulting output video as H.264 and audio as AAC before accepting it for playback. Some source codecs or export presets may not produce compatible output and will be reported as errors; this version does **not** implement a separate AVAssetWriter fallback.
- Upload each accepted rendition with an 8 MiB resumable Google Drive upload to the existing optimized Salsa/Bachata folder. Check for existing files by source/quality app properties and skip completed uploads on a later run.
- Save queue + manifest after every successful quality, resume incomplete jobs, mark too-high resolutions unsupported, and reprocess a completed video when new qualities are selected.
- Optional **BailaCue owner login** to publish newly imported originals and an optimized manifest automatically through existing Supabase RLS permissions; no service-role key and no new database.
- Keep the screen awake while a batch runs in the foreground. iPadOS may still suspend or terminate work if you leave the app, force-quit it, or lock the device.
- Export a local manifest for backup/manual publication. The existing web player supports reading this exact v2 format.

## Install on the iPad (development)

1. Install Apple's **free Swift Playground** app from the App Store: https://apps.apple.com/de/app/swift-playground/id908519492
2. Download the `develop` branch ZIP of this repository from GitHub into the iPad **Files** app: https://github.com/dn-lx/bailacue/archive/refs/heads/develop.zip
3. Unzip in Files, open `bailacue-develop/ipad-processor/` and locate `BailaCueProcessor.swiftpm`.
4. Open that .swiftpm project with Swift Playground. If it doesn't appear, use **Share → Swift Playground** or copy the project into the Swift Playgrounds folder in Files and open it from the app.
5. Before Google sign-in works, perform the OAuth client configuration below, then run the app in Swift Playground. This is a **source project**, not a pre-signed .ipa or an App Store installation.

> The iOS app has not yet been built on an iPad or installed on a physical device through this conversation. The source checks only verify Swift syntax and model behavior, not iPadOS framework linking, OAuth callbacks, hardware encoding or end-to-end Drive uploads.

## One-time Google OAuth setup (required)

Google authorization requires a registered iOS OAuth client and an exact callback URL scheme. This cannot be inferred from the existing BailaCue website's **web** OAuth client ID.

1. In the existing Google Cloud project, enable the **Google Drive API** and configure the OAuth consent screen. Do not enable billing or a paid video conversion service. Ensure the sign-in account is an allowed test user if the app is in testing.
2. Create an OAuth client ID of **iOS** application type, with bundle ID **`app.bailacue.processor`** (matching `Package.swift`).
3. Copy the *iOS client ID* (example shape `12345-xyz.apps.googleusercontent.com`) into `GoogleAuth.swift` at `GoogleSetup.clientID`. This client ID is public application configuration, not a password.
4. Set the URL scheme in `AppInfo.plist` to `com.googleusercontent.apps.12345-xyz` (the segment before `.apps.googleusercontent.com`, prefixed with `com.googleusercontent.apps.`). **Both files must match the same client ID.**
5. Run the iPad app and tap **Connect Google**; authorize Drive. Then optionally sign in to **BailaCue owner publishing** using the existing BailaCue administrator credentials.

No Google client secret, Google access token, Supabase service-role key, or owner password should be committed to the repository. The OAuth client ID is safe to put in source; it is not a secret.

The app currently requests the full Google Drive scope because it reads and copies originals, lists folders, and writes new renditions. Treat authorization accordingly.

## First small-batch test

1. Connect Drive and BailaCue owner.
2. Paste a Google Drive folder link containing **two small videos**; select Salsa or Bachata for the destination.
3. Import videos. Start with **360p and 720p** checked. Leave the app visible and plugged in while it works.
4. Check the queue, Drive destination folder, the generated manifest and playback quality selection on the **develop** website.
5. Reopen the app, enable 1080p if a source supports it, and tap Start / Resume to test the saved queue.
6. After successful end-to-end validation, load the existing fixed Salsa and Bachata collections and run a larger batch.

The existing library has hundreds of videos; check Google Drive storage quota before generating multiple derived copies. The app does not delete source videos.

## Google Photos links

Pasting a Google Photos shared-album URL is **not** supported in this initial build. Google Drive folder URLs are supported. Adding Photos would require Google's supported Photos Picker authorization flow; no scraping of private shared links.

## Known limitations and next engineering steps

- **Not yet a proven signed iPad install:** an actual Swift Playground / Xcode compilation and on-device encoder test are still required.
- **H.264 output availability:** the current `AVAssetExportSession` path validates H.264/AAC after export but does not explicitly configure encoder bitrate or force H.264. Some videos can fail validation. An `AVAssetReader` + `AVAssetWriter` explicit H.264/AAC fallback is the next reliability improvement.
- **Foreground-only processing:** never promise unattended overnight conversion with the screen locked. iPadOS controls suspended tasks.
- **App-local queue:** progress is saved in this iPad's app container. Deleting the app may delete local queue state; existing Drive uploads can still be rediscovered after reinstall.
- **Resumable uploads:** data is uploaded in chunks while a session is active; interruption of an upload may restart that file on retry. Already-completed copies are rediscovered by metadata.
- **Manifest publishing:** existing BailaCue owner authentication is required. If not connected, Drive copies upload but publishing is manual.
- **Concurrent writers:** do not run desktop and iPad manifest publishing at the same time until a server-side atomic merge is implemented.
- **No video copies processed yet:** this repository change implements the app source only.

For native iPad implementation and sign-in requirements, see:
- Apple Swift Playground: https://developer.apple.com/swift-playground/
- Google Sign-In iOS app setup: https://developers.google.com/identity/sign-in/ios/start-integrating
- Google's installed-app OAuth PKCE: https://developers.google.com/identity/protocols/oauth2/native-app
