// search.js — Spotify search, batch ISRC fetch, iTunes preview lookup

import { getToken, refreshToken } from './auth.js';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(url) {
  let token = await getToken();
  let res = await fetch(url, {
    headers: { Authorization: 'Bearer ' + token },
  });

  // Auto-retry once on 401
  if (res.status === 401) {
    token = await refreshToken();
    res = await fetch(url, {
      headers: { Authorization: 'Bearer ' + token },
    });
  }

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error?.message || `Spotify error ${res.status}`);
  }
  return data;
}

/**
 * Search tracks.
 * @param {string} query  - raw query or structured "track:X artist:Y"
 * @param {number} limit
 * @param {number} offset
 * @returns {{ items, total, next }}
 */
export async function searchTracks(query, limit = 20, offset = 0) {
  const url = `${BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=${limit}&offset=${offset}`;
  const data = await spotifyFetch(url);
  return {
    items:  data.tracks.items,
    total:  data.tracks.total,
    next:   data.tracks.next,
  };
}

/**
 * Batch-fetch ISRCs from Spotify, then look up preview URLs
 * from iTunes Search API (CORS-safe, works in browser).
 * @param {string[]} ids  Spotify track IDs
 * @returns {Object}      map of id → { isrc, previewUrl }
 */
export async function fetchTrackDetails(ids) {
  if (!ids.length) return {};

  // ── Step 1: Single Spotify batch fetch — get ISRCs + track metadata ──
  const chunks = [];
  for (let i = 0; i < ids.length; i += 50) {
    chunks.push(ids.slice(i, i + 50));
  }

  const isrcMap  = {};  // spotifyId → isrc
  const isrcMeta = {};  // isrc → { trackName, artistName }

  await Promise.all(
    chunks.map(async (chunk) => {
      const url  = `${BASE}/tracks?ids=${chunk.join(',')}`;
      const data = await spotifyFetch(url);
      for (const track of data.tracks) {
        if (!track) continue;
        const isrc = track.external_ids?.isrc || null;
        isrcMap[track.id] = isrc;
        console.log(`[Spotify] ${track.name} → ISRC: ${isrc ?? 'null'}`);
        if (isrc) {
          isrcMeta[isrc] = {
            trackName:  track.name,
            artistName: track.artists[0]?.name || '',
          };
        }
      }
    })
  );

  // ── Step 2: iTunes Search API (no CORS issues, works in browser) ──────
  // Note: iTunes lookup API (/lookup?isrc=) returns empty results in browser
  // due to CORS redirect to amp-api-edge.apps.apple.com — use /search instead.
  const uniqueIsrcs = [...new Set(Object.values(isrcMap).filter(Boolean))];
  const previewMap  = {}; // isrc → previewUrl

  await Promise.all(
    uniqueIsrcs.map(async (isrc) => {
      const meta = isrcMeta[isrc];
      if (!meta) return;
      try {
        const q   = encodeURIComponent(`${meta.trackName} ${meta.artistName}`);
        const url = `https://itunes.apple.com/search?term=${q}&entity=song&limit=5`;
        console.log(`[iTunes] Searching: "${meta.trackName}" by "${meta.artistName}"`);
        const res  = await fetch(url);
        if (!res.ok) { console.warn(`[iTunes] HTTP ${res.status}`); return; }
        const data = await res.json();
        console.log(`[iTunes] ${data.resultCount} result(s) for "${meta.trackName}"`);
        const result = data.results?.find(r => r.kind === 'song' && r.previewUrl);
        if (result) {
          console.log(`[iTunes] ✓ Preview for "${meta.trackName}": ${result.previewUrl}`);
          previewMap[isrc] = result.previewUrl;
        } else {
          console.log(`[iTunes] ✗ No preview for "${meta.trackName}"`);
        }
      } catch (err) {
        console.error(`[iTunes] Error for "${meta.trackName}":`, err);
      }
    })
  );

  // ── Step 3: Assemble final detailMap ──────────────────────────────────
  const detailMap = {};
  for (const spotifyId of ids) {
    const isrc = isrcMap[spotifyId] || null;
    detailMap[spotifyId] = {
      isrc,
      previewUrl: isrc ? (previewMap[isrc] || null) : null,
    };
  }

  return detailMap;
}

/**
 * Build a structured Spotify query from simple or advanced inputs.
 * @param {{ simple?: string, track?: string, artist?: string }} params
 */
export function buildQuery({ simple, track, artist }) {
  if (simple) return simple.trim();
  const parts = [];
  if (track)  parts.push(`track:${track.trim()}`);
  if (artist) parts.push(`artist:${artist.trim()}`);
  return parts.join(' ');
}