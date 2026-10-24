# Drive-only playback · 0.4

The default player streams shared Drive originals through the same-origin Netlify
function `/api/drive-video/:fileId`. No Cloudflare account, video copies, viewer
Google sign-in or streaming-provider secrets are required. Drive folder permissions
are unchanged. Only IDs already in the deployed Salsa/Bachata catalogue are served.
The server never accepts an upstream URL or forwards browser cookies or tokens.

The endpoint reads public Drive download byte ranges, validates MIME, exact range,
file size and byte count, and returns at most 4 MiB per request. The browser requests
subsequent ranges while playing or seeking. This works within Netlify's function
payload limit instead of buffering a whole original. Downloads time out after 18
seconds; the player stops waiting for metadata after 22 seconds. Google errors,
HTML confirmation pages and quota responses are not relayed as video content.

Drive public-download behavior is an integration tested against the real library,
not a guaranteed streaming-service SLA. Changes to Google's download flow, download
restrictions, quotas, private files or unsupported original codecs can prevent
playback. The player leaves an explicit Use Drive preview/Open original fallback.
Original resolution is retained; there is no transcoding or adaptive quality ladder.
Netlify still meters requests and bandwidth.

Connected upload and live-folder refresh retain the existing browser Google OAuth
flow. That still needs a public Google web client ID; see GOOGLE-SETUP.md. Connected
playback uses the existing memory-only service-worker bridge so freshly uploaded
files can play before being added to the deployed catalogue. Guests see new files
after the catalogue is updated and develop redeployed. There is no scheduled sync
or automatic copy job. The retired Cloudflare workflow and integration are removed.

Checks: `cd web && npm run lint && npm run typecheck && npm test && npm run build`.
Serve the function as well as the static build when testing guest playback locally.

References:
- https://developers.google.com/workspace/drive/api/guides/manage-downloads
- https://docs.netlify.com/build/functions/overview/
