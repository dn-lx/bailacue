const API = 'https://photospicker.googleapis.com/v1';
const SCOPE = 'https://www.googleapis.com/auth/photospicker.mediaitems.readonly';

async function request(url, token, options = {}) {
  const response = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
  if (response.ok) return response;
  if (response.status === 401) throw new Error('Google Photos authorization expired. Choose from Google Photos again.');
  if (response.status === 403) throw new Error('Google Photos access was denied. Check that the Google Photos Picker API is enabled for BailaCue in Google Cloud.');
  throw new Error(`Google Photos returned HTTP ${response.status}. Try opening a new picker.`);
}

export async function createPhotosSession(connection) {
  const { access_token: token } = await connection.authorize(SCOPE);
  const data = await (await request(API + '/sessions', token, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  })).json();
  const url = new URL(data.pickerUri);
  if (url.protocol !== 'https:' || url.hostname !== 'photos.google.com' || !data.id) {
    throw new Error('Google Photos did not return a valid picker link.');
  }
  return { id: data.id, url: url.href, token, imported: new Set() };
}

export async function selectedPhotosVideos(session, add) {
  const details = await (await request(API + '/sessions/' + encodeURIComponent(session.id), session.token)).json();
  if (!details.mediaItemsSet) throw new Error('Finish selecting your videos and tap Done in Google Photos first.');
  let count = 0, pageToken;
  do {
    const params = new URLSearchParams({ sessionId: session.id });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await (await request(API + '/mediaItems?' + params, session.token)).json();
    for (const item of page.mediaItems || []) {
      if (item.type !== 'VIDEO' || session.imported.has(item.id)) continue;
      const media = item.mediaFile;
      if (!media?.baseUrl || !media?.filename) throw new Error('Google Photos did not provide a downloadable video. Try selecting it again.');
      const url = new URL(media.baseUrl);
      if (url.protocol !== 'https:' || !(url.hostname === 'googleusercontent.com' || url.hostname.endsWith('.googleusercontent.com'))) {
        throw new Error('Google Photos returned an unexpected video download address.');
      }
      const data = await (await request(url.href + '=dv', session.token)).blob();
      if (!data.size) throw new Error('Google Photos returned an empty video.');
      add(new File([data], media.filename, { type: media.mimeType || 'video/mp4' }));
      session.imported.add(item.id);
      count++;
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return count;
}

export async function endPhotosSession(session) {
  await request(API + '/sessions/' + encodeURIComponent(session.id), session.token, { method: 'DELETE' }).catch(() => {});
}
