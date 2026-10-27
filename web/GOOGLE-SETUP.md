# Google Drive connection setup

Browsing, shared-original playback, labels, YouTube and local previews require no BailaCue account. Uploads
and connected Drive playback require the visitor's Google authorization.
No client secret is used in the browser.

## Owner configuration

1. Enable Google Drive API in the intended Google Cloud project. Configure its
   OAuth consent screen with the intended owner/audience. For Testing, add the
   intended accounts as test users.
2. Create a Web application OAuth client. Register these Authorized JavaScript
   origins exactly, without paths:
   - `https://develop--bailacue.netlify.app`
   - `https://bailacue.netlify.app`
   Register localhost only if local testing is intended. Ephemeral preview hosts
   require their own origin; Google does not accept wildcard origins.
3. Set Netlify build variable `BAILACUE_GOOGLE_CLIENT_ID` to the PUBLIC client ID
   ending `.apps.googleusercontent.com`, then redeploy develop. Alternatively use
   Connection setup in Add videos to save the public ID in this browser only.
4. Choose Connect Google and review Google's consent screen. The selected Google
   account must be able to add files to the selected fixed destination folder.
5. Test a small intended upload, confirm its exact number in Drive, then verify
   pause/resume, connected playback and Refresh both collections.

The token model requires no redirect callback route. Google may require OAuth
verification for public distribution of the requested scope; follow the actual
project/audience requirements shown by Google.

## Permission boundaries

The requested scope is `https://www.googleapis.com/auth/drive`, needed to inspect
arbitrary existing files in the two pre-existing folders and stream originals.
`drive.file` does not automatically grant access to this existing catalogue.
Application code restricts writes to the two fixed folder IDs and uses files.create;
it does not rename or delete existing files. Google's scope is broader than this
application restriction, so review it in Google's consent screen.

Tokens expire and stay in memory only. Disconnect clears the memory token. Closing
the tab loses local file handles and resumable sessions; it does not delete an
already-created Drive file. Never put a password, client secret, refresh token or
service-account credential in the frontend.

## Current status

No BailaCue web client ID was available in the repository or Netlify configuration.
Google Cloud Console could not be opened in the available browser. No OAuth client
or permission change was created. Live Google consent, cloud upload and connected
streaming are therefore unverified. Protocol tests use controlled provider responses;
actual local preview and YouTube controls were tested in the browser.

Official references:
- https://developers.google.com/drive/api/guides/manage-uploads
- https://developers.google.com/identity/oauth2/web/guides/use-token-model
- https://developers.google.com/youtube/iframe_api_reference
