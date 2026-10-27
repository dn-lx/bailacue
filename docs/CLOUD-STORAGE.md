# Personal video storage · 0.2.0

Each user signs in to their own Google Drive or Dropbox account and chooses folders
inside the app. No developer video repository or shared provider password is used.
The **app** still needs a one-time OAuth registration with each provider. Connecting
a ChatGPT Drive/Dropbox plugin does not register the mobile app with that provider.
The shipped preview has no invented client IDs; live sign-in requires this setup.
Local import through the phone's Files picker also works with installed cloud apps.

## Separate Salsa and Bachata folders

You can connect two or more folders. Both folders can belong to the same Drive or
Dropbox account, or you can combine sources from different providers.

1. Open **Settings → Manage video storage**, connect your account and choose the
   Salsa folder. Name it **Salsa**, select the **Salsa** style and choose its default
   labels, then press **Connect folder & find videos**.
2. The add-folder form stays available for the same account. Enter or browse to
   your Bachata folder, name it **Bachata**, set the **Bachata** style and its own
   default labels, then connect it. This adds a source alongside Salsa.
3. To put the other folder on a different provider, connect that account and add
   its folder there. Existing sources remain listed.
4. In Library, choose the **Salsa** or **Bachata** source chip, or **All storage**
   to see both. Online playback and phone-copy choices remain per video.

Each folder has independent style/label defaults and refresh controls. Refreshing
one preserves the other folder and your edited labels/ratings. These capabilities
are already in Android0.2.4/build7; no app update is needed for two folders.

Follow-up verification covers both folders on Google Drive, both on Dropbox and
a mixed Drive/Dropbox library in unit tests. The mocked browser journey connects
two Dropbox folders through the UI, filters them and confirms both survive refresh.
This verifies app behavior; live provider sign-in still needs OAuth registration.

## Google Drive registration

1. Enable the Drive API in your Google Cloud project. Configure OAuth consent,
   testing users, privacy policy and scope verification as required by Google.
2. Register Android OAuth client `app.bailacue.mobile` with the exact certificate
   SHA-1 from the APK being installed. Preview and store signing certificates differ.
   `apksigner verify --print-certs artifacts/BailaCue-*.apk` prints the preview cert.
3. Optional `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` configures an appropriate web client;
   no web client secret belongs in the app. Android native sign-in uses Google Play
   services and the registered package/certificate pair.
4. For iOS set `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` to the iOS client ID, then rebuild.
   app.config.ts registers its reversed URL scheme. No Firebase project is required.
5. Rebuild/reinstall if you changed bundled client IDs or the iOS URL scheme. Registering
   an existing Android APK's package/certificate pair does not itself require rebuilding.
   Open **Settings → Manage video storage → Connect Google Drive**.
   Choose the account, browse folders or paste a folder link, set its name/style/labels,
   and connect it. Repeat for independent Salsa/Bachata folders.

Read access uses `drive.readonly` because arbitrary existing folders cannot be listed
with `drive.file` alone. **Allow uploads to my Drive** asks for `drive` access. Drive
folder/file capabilities still control actual writes and downloads. Google’s native
SDK manages credentials. A different active Google account requires an explicit
reconnect before operating on that account; metadata and associations are retained.

### Fixing the reported DEVELOPER_ERROR / code10

The SDK's [official troubleshooting guide](https://react-native-google-signin.github.io/docs/troubleshooting#developer_error)
identifies this as a mismatch between the installed app and Google Cloud's OAuth
configuration. It is not fixed by changing a user's Drive password or connecting
a ChatGPT Drive plugin. The app now explains the setup failure and offers a Files
import action, but that recovery message cannot complete the remote registration.

For the verified preview signing identity, create an **Android** OAuth client in
[Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients):

- Package: `app.bailacue.mobile`
- Certificate SHA-1: `5E:8F:16:06:2E:A3:CD:2C:4A:0D:54:78:76:BA:A6:F3:8C:AB:F6:25`

Also enable the Drive API and configure consent/test users in that project. Store
and Play App Signing builds must use their own installed certificate fingerprints;
do not register a different signing certificate by mistake. The release workflow
prints the actual APK certificate. An optional web client ID must be a **Web** client
from the same project, not the Android client ID. Android native sign-in does not
require a web client ID for the access-token-only flow used here.

GitHub builds read public repository variables `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`,
`EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID` and `EXPO_PUBLIC_DROPBOX_APP_KEY`. Local/EAS builds
can use the same environment names. No client secret belongs in any `EXPO_PUBLIC_`
value. No Google Cloud account/project is currently connected to this build
workspace, so remote registration and a successful real-account sign-in have not
been performed. Once registration is saved and propagated, retry using your own
Google account; each user continues choosing their own folders.

## Dropbox registration

1. Create a Dropbox scoped app with **Full Dropbox** access if users must select
   arbitrary existing folders. App-folder apps can see only their own app folder.
2. Enable `account_info.read`, `files.metadata.read`, `files.content.read` and
   `files.content.write`. Register `bailacue://oauth/dropbox` as a redirect URI.
   For browser testing also register the exact origin + `/oauth/dropbox` callback.
3. Set public `EXPO_PUBLIC_DROPBOX_APP_KEY` before building, or enter the public app
   key in **Storage → App connection setup**. Never enter a client secret or password.
4. Each user presses Connect Dropbox and authorises their own account in the provider
   browser. The public-client flow uses PKCE, state validation and offline tokens.

Native refresh tokens and upload sessions use Expo SecureStore. Browser previews
keep credentials in memory and require reconnect after reload. Access tokens, media
URLs, headers and local paths are never stored in metadata sync. Dropbox media links
are requested fresh instead of retaining expiring links in library data.

## Files, labels and ratings

A source scans video files directly inside its folder, paging until complete.
Subfolders are independent sources; choose a nested Dropbox path explicitly.
Stable IDs combine provider/account/file identity, so refreshes and reconnects do not
replace users' notes, edited titles, labels or ratings. One file in several folders
has one library identity. Labels initially use source defaults; importance initially
uses 3 stars. This is not AI video-content analysis or automatic quality scoring.

Refresh manually using **Refresh videos**. A failed scan does not mark files deleted.
A complete scan removes missing memberships; the metadata stays available for recovery.
Moving a file outside all selected folders makes it unavailable until its new folder
is connected. Provider permission changes are checked when opening online videos.

## Online versus phone copy

Videos start online. Open a video and choose **Download to phone**, **Stream online**,
**Use phone copy**, or **Remove phone download**. Wi-Fi-only downloads are enabled by
default. Progress, cancellation, size validation, storage checks, partial-file cleanup
and native media validation precede registering a phone copy. An interrupted download
can be restarted; download progress does not currently survive process termination.

Copies are in app-private storage. Android backups are disabled; iOS owned media is
excluded from backup and protected by the native media module. Provider restrictions
are respected. Access is checked online; denied/missing access removes BailaCue's
phone copy. Downloaded files cannot be remotely revoked while the device is offline.
Photos/shared external copies are outside that cleanup. Save to Photos is explicit.

## Uploads and editing

On import/record, choose **This phone** or **Online storage** before saving. For online
storage, select the exact source folder and whether to keep a phone copy, then press
**Upload & add to library**. Multiple folders on one account (for example Salsa and
Bachata) are independent destinations. Labels and dance style never route a file.
An existing local video also has **Upload to my storage**. The folder's name is shown
before uploading and after confirmation. Enable **Allow uploads to my Drive** on the
account when needed; refreshing its token retains upload scopes.

Online-only saves upload first, register the confirmed cloud file and then delete
BailaCue's temporary phone file. Failures/pauses keep that file for retry. Choosing a
phone save performs no upload. Streaming an already-cloud video uses the existing
file; it does not create a duplicate upload.

Drive uses reserved provider IDs and resumable sessions. Dropbox uses stable unique
paths, strict conflicts and no automatic renaming. Both reconcile completed files
before retrying. Native reads use bounded 2 MiB chunks. Jobs persist securely with
the original folder/account/provider; resume cannot silently switch Salsa/Bachata or
accounts. Legacy jobs remain readable. Registration follows confirmed size and
preserves current labels, notes, ratings and library references.

To edit an online video, download it first. Choose **Trim on timeline**, drag its two
handles and **Save selected clip**, or use numeric times and **Export new trimmed
video**. Choose phone storage or the exact cloud folder before saving; an online
parent's single source is preselected, while multiple memberships require a choice.
Every trim creates a new MP4 entry and preserves the original. Phone clips also
have Save to Photos / Share / Save file. Drag the grip below the picture to resize
it, or use Compact / Standard / Large presets.

## Verification boundary

Provider adapters, PKCE UI, scans, online playback and refresh preservation are covered
by unit/mock HTTP and browser tests. Live OAuth, provider quotas, revoked real accounts,
large-file transfers and physical-device behaviour require registered OAuth apps and
real accounts; they must not be inferred from mocked tests. See VERIFICATION.md.
