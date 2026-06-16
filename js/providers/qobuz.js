// providers/qobuz.js — Qobuz search via public API (X-App-Id only, per Harmony)

export const PROVIDER_ID = 'qobuz';

export const META = {
  id:          'qobuz',
  label:       'Qobuz',
  color:       '#00B4D8',
  colorDim:    'rgba(0,180,216,0.12)',
  colorBorder: 'rgba(0,180,216,0.3)',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3a9 9 0 1 0 9 9 .5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5 11 11 0 1 1-5.865-9.738.5.5 0 0 1 .16.683l-.5.866a.5.5 0 0 1-.688.163A8.97 8.97 0 0 0 12 3z"/></svg>`,
};

const BASE = 'https://www.qobuz.com/api.json/0.2';

let _appId = '';

export function setAppId(id) {
  _appId = id;
}

export function hasCredentials() {
  return Boolean(_appId);
}

async function apiFetch(path) {
  if (!_appId) throw new Error('No Qobuz App ID configured');
  const res  = await fetch(`${BASE}/${path}`, {
    headers: { 'X-App-Id': _appId },
  });
  const data = await res.json();
  if (!res.ok || data.message) throw new Error(data.message || `Qobuz ${res.status}`);
  return data;
}

/**
 * Search tracks.
 * @returns {{ items, total, next }}
 */
export async function search(query, limit = 20, offset = 0) {
  const data   = await apiFetch(`track/search?query=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`);
  const tracks = data.tracks?.items || [];
  const total  = data.tracks?.total || 0;
  return {
    items:  tracks,
    total,
    next:   offset + tracks.length < total ? true : null,
  };
}

/**
 * Qobuz tracks include ISRC directly in search results.
 * For previews: Qobuz doesn't expose a public unauthenticated sample URL,
 * so we fall back to iTunes Search API (same approach as Spotify provider).
 * @param {Object[]} tracks  raw Qobuz track objects from search()
 * @returns {Object}         id → { isrc, previewUrl }
 */
export async function fetchDetails(tracks) {
  if (!tracks.length) return {};

  // ISRCs are already in the search response — collect them
  const isrcMap  = {}; // id → isrc
  const isrcMeta = {}; // isrc → { trackName, artistName }

  for (const track of tracks) {
    const id   = String(track.id);
    const isrc = track.isrc || null;
    isrcMap[id] = isrc;
    if (isrc) {
      isrcMeta[isrc] = {
        trackName:  track.title,
        artistName: track.performer?.name || '',
      };
    }
  }

  // iTunes Search API for previews — CORS-safe, works in browser
  const uniqueIsrcs = [...new Set(Object.values(isrcMap).filter(Boolean))];
  const previewMap  = {}; // isrc → previewUrl

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

  // Assemble
  const detailMap = {};
  for (const track of tracks) {
    const id   = String(track.id);
    const isrc = isrcMap[id] || null;
    detailMap[id] = {
      isrc,
      previewUrl: isrc ? (previewMap[isrc] || null) : null,
    };
  }
  return detailMap;
}

/**
 * Build query — Qobuz uses plain search terms, no field operators.
 */
export function buildQuery({ simple, track, artist }) {
  if (simple) return simple.trim();
  return [track, artist].filter(Boolean).map(s => s.trim()).join(' ');
}

/**
 * Normalize a Qobuz track into the common card shape.
 */
export function normalizeTrack(t) {
  const albumUrl = t.album?.url || `https://open.qobuz.com/album/${t.album?.id}`;
  return {
    id:         String(t.id),
    name:       t.title + (t.version ? ` (${t.version})` : ''),
    artists:    [t.performer?.name || ''],
    album:      t.album?.title || '',
    year:       (t.album?.release_date_original || t.release_date_original || '').slice(0, 4),
    artUrl:     t.album?.image?.large || t.album?.image?.small || null,
    popularity: null,
    trackUrl:   `https://open.qobuz.com/track/${t.id}`,
    albumUrl,
    odesliUrl:  `https://song.link/q/${t.id}`,
    provider:   PROVIDER_ID,
  };
}