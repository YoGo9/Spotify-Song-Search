// app.js — init, provider switching, search orchestration

import { getSettings, saveActiveProvider, initSettingsPanel } from './settings.js';
import * as Spotify from './providers/spotify.js';
import * as Qobuz   from './providers/qobuz.js';
import * as Deezer  from './providers/deezer.js';
import { renderTracks, injectTrackDetails, showError, setLoading, setResultsMeta, setLoadMore } from './ui.js';

// ── Provider registry ───────────────────────────────────────────────────
const PROVIDERS = { spotify: Spotify, qobuz: Qobuz, deezer: Deezer };
let activeProvider = null;

function setProvider(id) {
  activeProvider = PROVIDERS[id] || PROVIDERS.spotify;
  saveActiveProvider(id);

  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.provider === id);
  });

  updateCredsNotice();

  document.getElementById('results').innerHTML = '';
  setResultsMeta(0, 0);
  setLoadMore(false);
  currentOffset = 0;
  currentQuery  = '';
}

// ── Search state ────────────────────────────────────────────────────────
let currentOffset = 0;
let currentQuery  = '';
let totalResults  = 0;
let hasMore       = false;
let isSearching   = false;
let debounceTimer = null;
let lastItems     = [];

// ── Boot ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const s = getSettings();

  Spotify.setCredentials(s.spotifyClientId, s.spotifyClientSecret);
  Qobuz.setAppId(s.qobuzAppId);
  // Deezer needs no credentials

  initSettingsPanel({
    onSpotifyCredentialsSaved: async (id, sec) => {
      Spotify.setCredentials(id, sec);
      await Spotify.getToken();
      if (activeProvider === Spotify) updateCredsNotice();
    },
    onQobuzAppIdSaved: async (appId) => {
      Qobuz.setAppId(appId);
      await Qobuz.search('test', 1, 0);
      if (activeProvider === Qobuz) updateCredsNotice();
    },
  });

  setProvider(s.activeProvider || 'deezer');

  document.querySelectorAll('.provider-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.provider !== activeProvider.PROVIDER_ID) {
        setProvider(btn.dataset.provider);
      }
    });
  });

  const searchInput  = document.getElementById('search-input');
  const searchClear  = document.getElementById('search-clear');
  const modeSimple   = document.getElementById('mode-simple');
  const modeAdvanced = document.getElementById('mode-advanced');
  const advFields    = document.getElementById('advanced-fields');
  const advTrack     = document.getElementById('adv-track');
  const advArtist    = document.getElementById('adv-artist');
  const loadMoreBtn  = document.getElementById('load-more');

  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.style.display = val ? '' : 'none';
    clearTimeout(debounceTimer);
    if (val.length < 2) return;
    debounceTimer = setTimeout(() => triggerSearch(true), 350);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { clearTimeout(debounceTimer); triggerSearch(true); }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    document.getElementById('results').innerHTML = '';
    setResultsMeta(0, 0);
    setLoadMore(false);
    searchInput.focus();
  });

  [advTrack, advArtist].forEach(el => {
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') triggerSearch(true); });
  });

  modeSimple.addEventListener('click', () => {
    modeSimple.classList.add('active');
    modeAdvanced.classList.remove('active');
    advFields.style.display = 'none';
  });
  modeAdvanced.addEventListener('click', () => {
    modeAdvanced.classList.add('active');
    modeSimple.classList.remove('active');
    advFields.style.display = '';
  });

  loadMoreBtn.addEventListener('click', () => triggerSearch(false));

  document.getElementById('settings-overlay').addEventListener('click', updateCredsNotice);
  document.getElementById('settings-close').addEventListener('click', updateCredsNotice);
});

// ── Search orchestration ────────────────────────────────────────────────
async function triggerSearch(fresh) {
  if (isSearching) return;

  const isAdvanced = document.getElementById('mode-advanced').classList.contains('active');
  const query = activeProvider.buildQuery(
    isAdvanced
      ? { track: document.getElementById('adv-track').value.trim(),
          artist: document.getElementById('adv-artist').value.trim() }
      : { simple: document.getElementById('search-input').value }
  );

  if (!query) return;

  if (!activeProvider.hasCredentials()) {
    showError(`Configure ${activeProvider.META.label} credentials in Settings ⚙ to search.`);
    return;
  }

  if (fresh) {
    currentOffset = 0;
    currentQuery  = query;
    lastItems     = [];
  }

  const { perPage } = getSettings();
  isSearching = true;
  setLoading(true);
  setLoadMore(false);

  try {
    const { items, total, next } = await activeProvider.search(currentQuery, perPage, currentOffset);

    setLoading(false);

    if (fresh && items.length === 0) {
      showError('No tracks found.');
      setResultsMeta(0, 0);
      return;
    }

    totalResults   = total;
    currentOffset += items.length;
    hasMore        = next !== null;
    lastItems      = [...lastItems, ...items];

    const included   = items._included || [];
    const normalized = items.map(t => activeProvider.normalizeTrack(t, included));

    const cardMap = renderTracks(normalized, !fresh, activeProvider.META);
    setResultsMeta(currentOffset, totalResults);
    setLoadMore(hasMore);

    const ids       = items.map(t => String(t.id));
    const detailMap = await activeProvider.fetchDetails(
      activeProvider.PROVIDER_ID === 'spotify' ? ids : items
    );

    injectTrackDetails(cardMap, detailMap);

  } catch (err) {
    setLoading(false);
    showError(err.message || 'Something went wrong.');
    console.error('[app] search error:', err);
  } finally {
    isSearching = false;
  }
}

function updateCredsNotice() {
  const notice = document.getElementById('no-creds-notice');
  notice.style.display = activeProvider?.hasCredentials() ? 'none' : 'flex';
}
