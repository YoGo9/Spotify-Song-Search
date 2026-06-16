// providers/tidal.js — Tidal search via unofficial v1 API
// The official v2 openapi.tidal.com searchresults endpoint is unreliable (returns 404).
// The v1 API at api.tidal.com is what all working community projects use.
// It requires a token from the official auth flow — same Client ID/Secret.

export const PROVIDER_ID = 'tidal';

export const META = {
  id:          'tidal',
  label:       'Tidal',
  color:       '#E5EAED',
  colorDim:    'rgba(229,234,237,0.08)',
  colorBorder: 'rgba(229,234,237,0.2)',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5L8.5 6 5 2.5 1.5 6 5 9.5 8.5 6 12 9.5 15.5 6 19 9.5 22.5 6 19 2.5 15.5 6 12 2.5ZM8.5 14.5L5 11l-3.5 3.5L5 18l3.5-3.5ZM15.5 14.5L12 11l-3.5 3.5L12 18l3.5-3.5ZM22.5 14.5L19 11l-3.5 3.5L19 18l3.5-3.5Z"/></svg>`,
};

const TOKEN_URL = 'https://auth.tidal.com/v1/oauth2/token';
const BASE      = 'https://api.tidal.com/v1';
const COUNTRY   = 'US';

let _token        = '';
let _expiry       = 0;
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
  if (!_clientId || !_clientSecret) throw new Error('No Tidal credentials configured');
  const res  = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(_clientId + ':' + _clientSecret),
    },
    body: 'grant_type=client_credentials',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || 'Tidal token fetch failed');
  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

async function apiFetch(path) {
  let token = await getToken();
  let res   = await fetch(`${BASE}/${path}`, {
    headers: { 'Authorization': `Bearer ${token}` },
  });
  if (res.status === 401) {
    _token = ''; _expiry = 0;
    token = await _fetchToken();
    res   = await fetch(`${BASE}/${path}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.userMessage || data.error || `Tidal ${res.status}`);
  return data;
}

/**
 * Search tracks via v1 API.
 * GET /v1/search/tracks?query=...&countryCode=US&limit=20&offset=0
 * Returns { items: [...], totalNumberOfItems, limit, offset }
 * Each track includes: id, title, duration, isrc, artist, album, url, popularity
 */
export async function search(query, limit = 20, offset = 0) {
  const params = new URLSearchParams({
    query,
    countryCode: COUNTRY,
    limit,
    offset,
  });

  const data  = await apiFetch(`search/tracks?${params}`);
  const items = data.items || [];
  const total = data.totalNumberOfItems || items.length;
  const hasMore = offset + items.length < total;

  return { items, total, next: hasMore ? true : null };
}

/**
 * ISRC is in v1 search results directly — no extra call needed.
 * Previews via iTunes Search API (same fallback as other providers).
 * @param {Object[]} tracks  raw items from search()
 * @returns {Object}         id → { isrc, previewUrl }
 */
export async function fetchDetails(tracks) {
  if (!tracks.length) return {};

  const isrcMap  = {};
  const isrcMeta = {};

  for (const track of tracks) {
    const id   = String(track.id);
    const isrc = track.isrc || null;
    isrcMap[id] = isrc;
    if (isrc) {
      isrcMeta[isrc] = {
        trackName:  track.title,
        artistName: track.artist?.name || '',
      };
    }
  }

  // iTunes Search API for previews
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
  for (const track of tracks) {
    const id   = String(track.id);
    const isrc = isrcMap[id] || null;
    detailMap[id] = { isrc, previewUrl: isrc ? (previewMap[isrc] || null) : null };
  }
  return detailMap;
}

/**
 * Build query — plain search terms.
 */
export function buildQuery({ simple, track, artist }) {
  if (simple) return simple.trim();
  return [track, artist].filter(Boolean).map(s => s.trim()).join(' ');
}

/**
 * Normalize a Tidal v1 track into the common card shape.
 * v1 shape: { id, title, isrc, artist:{name}, album:{title,cover}, url, popularity }
 */
export function normalizeTrack(t) {
  // Album art: Tidal v1 uses a UUID cover that maps to a CDN URL
  const cover  = t.album?.cover?.replace(/-/g, '/');
  const artUrl = cover
    ? `https://resources.tidal.com/images/${cover}/640x640.jpg`
    : null;

  const albumUrl = t.album?.id
    ? `https://tidal.com/browse/album/${t.album.id}`
    : '';

  return {
    id:         String(t.id),
    name:       t.title + (t.version ? ` (${t.version})` : ''),
    artists:    [t.artist?.name || ''],
    album:      t.album?.title || '',
    year:       t.streamStartDate?.slice(0, 4) || t.album?.releaseDate?.slice(0, 4) || '',
    artUrl,
    popularity: t.popularity ?? null,
    trackUrl:   `https://tidal.com/browse/track/${t.id}`,
    albumUrl,
    odesliUrl:  `https://song.link/t/${t.id}`,
    provider:   PROVIDER_ID,
  };
}
