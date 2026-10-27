# YouTube sources

Add video → Add from YouTube, or Settings → Manage YouTube playlists. Public single
videos and multiple public playlists are supported. Combined links ask whether to
add the video or playlist. Preview the embedded player, choose dance/labels and
select lessons before saving. Add selected videos sits with setup, before the player.
Completion appears only after the device Library write succeeds, with Open Library
and a source filter that clears unrelated old filters. A failed save retains the
selection for retry. Playlist order is retained in its source preview.
Refresh is explicit and preserves personal ratings, labels, notes and stable IDs.
Overlapping playlists share a single video entry. Disconnecting never modifies YouTube.

The optional beginner catalog is versioned in src/core/youtube.ts. Its one supplied
entry is Bachata Tutorials by Roberto & Magdalena Bachata. Language has not been
specified. Catalog changes do not enroll existing users. No Salsa playlist was invented.

YouTube inclusion in Daily Picks and Practice is opt-in independently. YouTube stays
online, is excluded from phone-only sessions, and uses YouTube's official iframe
player (react-native-webview on phones). Supported playback rates come from that
player; autoplay/embedding restrictions show a visible action or Open in YouTube.
There is no media extraction, download, native trim, source rename or cloud upload.

For full playlist pagination, enable YouTube Data API v3 in your own Google Cloud
project, create an API key restricted to that API, and save it under Advanced setup.
The optional EXPO_PUBLIC_YOUTUBE_API_KEY build variable is also supported. Client API
keys are public configuration, not a substitute for a trusted server if quotas need
protection; this preview keeps entered keys on the device and excludes them from sync.
Never commit private credentials. Without a key, the visible embedded player's
getPlaylist list can seed an import; YouTube may limit this list. The app explicitly
cues the playlist and does not require starting playback to discover IDs. It avoids
pausing an unplayed cue, offers bounded retry/setup when no IDs arrive, and marks
player-list imports as limited. A partial refresh preserves old memberships. An
invalid/restricted API key can fall back to the player list. The UI discloses
that limitation. Metadata retrieval uses official oEmbed and imports in cancellable
batches. Failed API requests do not replace existing memberships or personal data.

Official references reviewed:

- https://developers.google.com/youtube/iframe_api_reference
- https://developers.google.com/youtube/v3/docs/playlistItems/list
- https://developers.google.com/youtube/v3/docs/playlists/list
- https://docs.expo.dev/versions/v58.0.0/sdk/webview/

Browser tests mock official endpoints and the iframe bridge. Actual creator-specific
embedding, Android WebView integrity/referrer policies, network/quota limits and iOS
playback need live-device acceptance. A fallback is not proof of a successful stream.

The YouTube detail page uses a compact two-line title with Show full title. Its
resize grip supports keyboard/screen-reader adjustments. Full screen expands the
same mounted WebView/iframe within the app's safe area; Exit and Android Back
return to details without reopening the video. Supported rate, position and playing
state survive those layout changes. Browser tests exercise the actual iframe
bridge with controlled YouTube responses; live-device results remain separately
recorded in VERIFICATION.md.
