> Historical Me+ deployment documentation. Retired from the mobile app in the local-first release. See [current local storage](LOCAL-STORAGE.md). This document is not a deployment instruction or permission to change production.

# Scoped Me+ integration

The existing production Me+ project is the user-approved database target. The
original 23-table migration is live. After the owner explicitly approved production deployment on 2026-10-18, the new
private tables and `bailacue-api` version 2 were deployed to the shared Me+ project.
Live verification confirms client denial on private tables/RPCs and rejection of
missing sessions and invalid credentials. Real two-user login/sync acceptance remains pending.

`supabase/functions/bailacue-api` accepts username/password against Supabase Auth,
then issues a random BailaCue-only opaque session (SHA-256 hash stored server-side,
30-day expiry and explicit revocation). It never returns Me+ Supabase access or
refresh tokens to the app. It queries only Supabase identity metadata and BailaCue
application tables. No health/domain tables are read. Existing Me+ identities can
claim a BailaCue username by verifying their existing email/password during Register.
New registration/recovery follows the shared project's existing email/password policy.
No existing Supabase auth settings or Me+ functions need changing.

The new additive migration creates service-only sessions, revisioned metadata
snapshots, rate-limit windows and collection grants. RLS is enabled and public,
anonymous and authenticated roles have no privileges on these tables/functions.
The Edge Function alone uses its automatic service-role runtime credential.
Rate limits are atomic database operations. A new BailaCue cleanup RPC removes only
BailaCue data and sessions. It never deletes `auth.users` or other Me+ application data.

## Deployed configuration and reproduction

1. Apply `20261018043447_bailacue_scoped_sessions_sync.sql` to Me+
   (`wbqnctrvxohxwiaignhg`) after reviewing the exact migration.
   Also apply `20261018043638_bailacue_gateway_service_grants.sql`: Me+ does not grant
   service access to new tables by default. This grants only BailaCue SELECT/DELETE
   and profile INSERT needed by the gateway; no Me+ grants change.
2. Deploy only the new function, with gateway JWT validation disabled because it
   validates its own scoped opaque tokens:

   ```sh
   npx supabase functions deploy bailacue-api --project-ref wbqnctrvxohxwiaignhg --no-verify-jwt
   ```

   All authenticated operations validate the session hash and expiry before deriving
   the owner ID; request bodies cannot select another user. Login/register/recover
   remain deliberately public and rate-limited. No broad JWT is accepted as a session.
3. Server runtime provides SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
   If enabling browser use, set server-only BAILACUE_WEB_ORIGIN to one exact origin.
   Do not add service keys to app config, GitHub source or EXPO_PUBLIC variables.
4. Build 5 uses the deployed URL by default on mobile. EXPO_PUBLIC_BAILACUE_API_URL
   can override it. Browser access needs a separately configured exact CORS origin.
5. Verify register/confirm/login/recovery, two real accounts, incorrect passwords,
   owner isolation, revocation, stale-revision conflicts and BailaCue-only deletion.
   Local PostgreSQL and transport-mock results do not replace this live acceptance.

## Sync and privacy

Guest and account libraries have separate storage keys and are switched by a keyed
provider, preventing accidental cross-user imports. Sync is explicit: inspect cloud,
choose Save device metadata or Use cloud metadata. Revision comparison prevents a
stale save from overwriting another device's changes. Automatic merge/background sync
is not claimed. Devices reconnect their own provider credentials. Local paths,
thumbnail files, OAuth tokens, upload sessions and device lock/reminder settings are
excluded from snapshots and rejected by the server when submitted as such fields.

Signing out deletes this account's app copies, credentials, job references, reminders
and local metadata. Original provider files and external Photos copies remain.
Changing password changes the shared Me+ identity's password, with explicit UI copy.
Session deletion prevents subsequent API use; it does not remotely erase copies
on other devices. Signing out on each device removes its app-owned copies. Provider
and collection access is checked when opening shared/remote videos online; exported
Photos/external copies remain under the user's control. Add periodic deletion of expired sessions and old rate
windows to the deployment's maintenance schedule; no existing cron is changed here.

## Collection sharing

Only an authenticated sender can send references to another BailaCue username.
Payloads are allowlisted provider/file IDs, titles/styles and collection name.
Personal notes/ratings, file paths and credentials are excluded. Recipients must
verify each file using their own connected provider account before importing.
BailaCue does not change provider permissions or make files public. The sender can
revoke its own grant. Online opens check recipient ownership and grant revocation;
provider access is still required. Offline revocation limitations are shown in-app.

## Remaining server work

New-video alerts require server-side provider consent/token vaulting, scheduled
source checks, deduplication, quiet-hours routing, FCM/APNs credentials and push-device
registration. Those are not enabled by this function. Device background execution is
not offered as an exact delivery guarantee. Local scheduled reminders work separately.
