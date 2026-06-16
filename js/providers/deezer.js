// providers/deezer.js — Deezer search via public API (no auth, no key, JSONP for CORS)
//
// Deezer's REST API doesn't send CORS headers, so we use JSONP which works from any browser.
// Search is completely free and public — no registration needed.
// Tracks include ISRC and a 30-second preview MP3 directly in the response.

export const PROVIDER_ID = 'deezer';

export const META = {
  id:          'deezer',
  label:       'Deezer',
  color:       '#A238FF',
  colorDim:    'rgba(162,56,255,0.12)',
  colorBorder: 'rgba(162,56,255,0.3)',
  icon: `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M18.81 4.16v3.03H24V4.16h-5.19zM6.27 8.38v3.03h5.19V8.38H6.27zm6.27 0v3.03h5.19V8.38h-5.19zm6.27 0v3.03H24V8.38h-5.19zM6.27 12.6v3.04h5.19V12.6H6.27zm6.27 0v3.04h5.19V12.6h-5.19zm6.27 0v3.04H24V12.6h-5.19zM0 16.81v3.04h5.19v-3.04H0zm6.27 0v3.04h5.19v-3.04H6.27zm6.27 0v3.04h5.19v-3.04h-5.19zm6.27 0v3.04H24v-3.04h-5.19z"/></svg>`,
};

const BASE = 'https://api.deezer.com';

// JSONP helper — Deezer supports ?output=jsonp&callback=fn
let _cbCounter = 0;

function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = `__dz_${_cbCounter++}`;
    const script = document.createElement('script');
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Deezer request timed out'));
    }, 10_000);

    function cleanup() {
      clearTimeout(timer);
      delete window[cb];
      if (script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = (data) => {
      cleanup();
      if (data.error) {
        reject(new Error(data.error.message || `Deezer error ${data.error.code}`));
      } else {
        resolve(data);
      }
    };

    const sep = url.includes('?') ? '&' : '?';
    script.src = `${url}${sep}output=jsonp&callback=${cb}`;
    script.onerror = () => { cleanup(); reject(new Error('Deezer script load failed')); };
    document.head.appendChild(script);
  });
}

export function hasCredentials() {
  return true; // No credentials needed
}

export function setCredentials() {} // No-op

/**
 * Search tracks.
 * GET /search/track?q=...&limit=25&index=0
 * Returns { data: [...], total, next }
 * Each track includes: id, title, isrc, preview (mp3 url), artist, album, duration, rank
 */
export async function search(query, limit = 20, offset = 0) {
  const url = `${BASE}/search/track?q=${encodeURIComponent(query)}&limit=${limit}&index=${offset}`;
  const data = await jsonp(url);

  return {
    items:  data.data || [],
    total:  data.total || 0,
    next:   data.next ? true : null,
  };
}

/**
 * Deezer returns ISRC and preview URL directly in search results — no extra calls needed.
 * @param {Object[]} tracks  raw items from search()
 * @returns {Object}         id → { isrc, previewUrl }
 */
export async function fetchDetails(tracks) {
  const detailMap = {};
  for (const track of tracks) {
    detailMap[String(track.id)] = {
      isrc:       track.isrc       || null,
      previewUrl: track.preview    || null,
    };
  }
  return detailMap;
}

/**
 * Build query — Deezer supports field operators: track:"name" artist:"name"
 */
export function buildQuery({ simple, track, artist }) {
  if (simple) return simple.trim();
  const parts = [];
  if (track)  parts.push(`track:"${track.trim()}"`);
  if (artist) parts.push(`artist:"${artist.trim()}"`);
  return parts.join(' ');
}

/**
 * Normalize a Deezer track into the common card shape.
 * Deezer shape: { id, title, isrc, preview, duration, rank,
 *                 artist:{id,name,link}, album:{id,title,cover_xl,release_date},
 *                 link }
 */
export function normalizeTrack(t) {
  return {
    id:         String(t.id),
    name:       t.title || '',
    artists:    [t.artist?.name || ''],
    album:      t.album?.title || '',
    year:       t.album?.release_date?.slice(0, 4) || '',
    artUrl:     t.album?.cover_xl || t.album?.cover_big || t.album?.cover || null,
    popularity: t.rank ? Math.round(t.rank / 10000) : null,
    trackUrl:   t.link || `https://www.deezer.com/track/${t.id}`,
    albumUrl:   `https://www.deezer.com/album/${t.album?.id}`,
    odesliUrl:  `https://song.link/d/${t.id}`,
    provider:   PROVIDER_ID,
  };
}
