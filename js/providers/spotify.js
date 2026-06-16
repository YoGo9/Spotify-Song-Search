// providers/spotify.js — Spotify search + ISRC/preview via batch API

export const PROVIDER_ID = 'spotify';

export const META = {
  id:          'spotify',
  label:       'Spotify',
  color:       '#1DB954',
  colorDim:    'rgba(29,185,84,0.12)',
  colorBorder: 'rgba(29,185,84,0.3)',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/></svg>`,
};

const BASE = 'https://api.spotify.com/v1';

// Token state
let _token   = '';
let _expiry  = 0;
let _clientId     = '';
let _clientSecret = '';

export function setCredentials(id, secret) {
  _clientId     = id;
  _clientSecret = secret;
  _token  = '';
  _expiry = 0;
}

export function hasCredentials() {
  return Boolean(_clientId && _clientSecret);
}

export async function getToken() {
  if (_token && Date.now() < _expiry - 60_000) return _token;
  return _fetchToken();
}

async function _fetchToken() {
  if (!_clientId || !_clientSecret) throw new Error('No Spotify credentials');
  const res  = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(_clientId + ':' + _clientSecret),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'Token fetch failed');
  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

async function apiFetch(url) {
  let token = await getToken();
  let res   = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (res.status === 401) {
    _token = ''; _expiry = 0;
    token = await _fetchToken();
    res   = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || `Spotify ${res.status}`);
  return data;
}

/**
 * Search tracks.
 * @returns {{ items, total, next }}
 * items shape: { id, name, artists:[{name}], album:{name,images,release_date,external_urls}, popularity, external_urls }
 */
export async function search(query, limit = 20, offset = 0) {
  const url  = `${BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`;
  const data = await apiFetch(url);
  return {
    items:  data.tracks.items,
    total:  data.tracks.total,
    next:   data.tracks.next,
  };
}

/**
 * Fetch ISRCs + iTunes preview URLs for a list of Spotify track IDs.
 * @returns {Object} id → { isrc, previewUrl }
 */
export async function fetchDetails(ids) {
  if (!ids.length) return {};

  // Chunk into 50s (Spotify limit)
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50));

  const isrcMap  = {};
  const isrcMeta = {};

  await Promise.all(chunks.map(async (chunk) => {
    const data = await apiFetch(`${BASE}/tracks?ids=${chunk.join(',')}`);
    for (const track of data.tracks) {
      if (!track) continue;
      const isrc = track.external_ids?.isrc || null;
      isrcMap[track.id] = isrc;
      if (isrc) {
        isrcMeta[isrc] = {
          trackName:  track.name,
          artistName: track.artists[0]?.name || '',
        };
      }
    }
  }));

  // iTunes Search API for previews (CORS-safe; /lookup endpoint is not)
  const uniqueIsrcs = [...new Set(Object.values(isrcMap).filter(Boolean))];
  const previewMap  = {};

  await Promise.all(uniqueIsrcs.map(async (isrc) => {
    const meta = isrcMeta[isrc];
    if (!meta) return;
    try {
      const q    = encodeURIComponent(`${meta.trackName} ${meta.artistName}`);
      const res  = await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=5`);
      if (!res.ok) return;
      const data = await res.json();
      const hit  = data.results?.find(r => r.kind === 'song' && r.previewUrl);
      if (hit) previewMap[isrc] = hit.previewUrl;
    } catch { /* no preview */ }
  }));

  const detailMap = {};
  for (const id of ids) {
    const isrc = isrcMap[id] || null;
    detailMap[id] = { isrc, previewUrl: isrc ? (previewMap[isrc] || null) : null };
  }
  return detailMap;
}

/**
 * Build query string from simple or advanced inputs.
 */
export function buildQuery({ simple, track, artist }) {
  if (simple) return simple.trim();
  const parts = [];
  if (track)  parts.push(`track:${track.trim()}`);
  if (artist) parts.push(`artist:${artist.trim()}`);
  return parts.join(' ');
}

/**
 * Normalize a Spotify track into the common card shape.
 */
export function normalizeTrack(t) {
  return {
    id:         t.id,
    name:       t.name,
    artists:    t.artists.map(a => a.name),
    album:      t.album.name,
    year:       t.album.release_date?.slice(0, 4) || '',
    artUrl:     t.album.images?.[0]?.url || null,
    popularity: t.popularity,
    trackUrl:   t.external_urls.spotify,
    albumUrl:   t.album.external_urls.spotify,
    odesliUrl:  'https://song.link/s/' + t.id,
    provider:   PROVIDER_ID,
  };
}
