// app.js — init, event wiring, search orchestration

import { getSettings, initSettingsPanel } from './settings.js';
import { setCredentials, hasCredentials, getToken } from './auth.js';
import { searchTracks, fetchTrackDetails, buildQuery } from './search.js';
import { renderTracks, injectTrackDetails, showError, setLoading, setResultsMeta, setLoadMore } from './ui.js';

// ── State ──────────────────────────────────────────────────────────────
let currentOffset  = 0;
let currentQuery   = '';
let totalResults   = 0;
let hasMore        = false;
let isSearching    = false;
let debounceTimer  = null;

// ── Boot ───────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Load saved credentials into auth module
  const s = getSettings();
  if (s.clientId && s.clientSecret) {
    setCredentials(s.clientId, s.clientSecret);
  }

  // Settings panel
  initSettingsPanel(async (id, secret) => {
    setCredentials(id, secret);
    await getToken(); // throws if bad creds
  });

  // Show no-creds notice if needed
  updateCredsNotice();

  // Search input (simple mode)
  const searchInput  = document.getElementById('search-input');
  const searchClear  = document.getElementById('search-clear');
  const modeSimple   = document.getElementById('mode-simple');
  const modeAdvanced = document.getElementById('mode-advanced');
  const advFields    = document.getElementById('advanced-fields');
  const advTrack     = document.getElementById('adv-track');
  const advArtist    = document.getElementById('adv-artist');
  const loadMoreBtn  = document.getElementById('load-more');

  // Debounced search on typing (simple mode)
  searchInput.addEventListener('input', () => {
    const val = searchInput.value.trim();
    searchClear.style.display = val ? '' : 'none';
    clearTimeout(debounceTimer);
    if (val.length < 2) return;
    debounceTimer = setTimeout(() => triggerSearch(true), 350);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      triggerSearch(true);
    }
  });

  searchClear.addEventListener('click', () => {
    searchInput.value = '';
    searchClear.style.display = 'none';
    document.getElementById('results').innerHTML = '';
    setResultsMeta(0, 0);
    setLoadMore(false);
    searchInput.focus();
  });

  // Advanced mode inputs — search on Enter
  [advTrack, advArtist].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') triggerSearch(true);
    });
  });

  // Mode toggle
  modeSimple.addEventListener('click', () => {
    modeSimple.classList.add('active');
    modeAdvanced.classList.remove('active');
    advFields.style.display = 'none';
    searchInput.parentElement.parentElement.style.display = '';
  });
  modeAdvanced.addEventListener('click', () => {
    modeAdvanced.classList.add('active');
    modeSimple.classList.remove('active');
    advFields.style.display = '';
  });

  // Load more
  loadMoreBtn.addEventListener('click', () => triggerSearch(false));

  // Re-check creds notice whenever settings panel closes
  document.getElementById('settings-overlay').addEventListener('click', updateCredsNotice);
  document.getElementById('settings-close').addEventListener('click', updateCredsNotice);
});

// ── Search orchestration ───────────────────────────────────────────────
async function triggerSearch(fresh) {
  if (isSearching) return;

  // Build query
  const mode = document.getElementById('mode-advanced').classList.contains('active') ? 'advanced' : 'simple';
  let query;
  if (mode === 'advanced') {
    query = buildQuery({
      track:  document.getElementById('adv-track').value.trim(),
      artist: document.getElementById('adv-artist').value.trim(),
    });
  } else {
    query = buildQuery({ simple: document.getElementById('search-input').value });
  }

  if (!query) return;

  if (!hasCredentials()) {
    showError('Add your Spotify credentials in Settings to search.');
    return;
  }

  if (fresh) {
    currentOffset = 0;
    currentQuery  = query;
  }

  const { perPage } = getSettings();
  isSearching = true;
  setLoading(true);
  setLoadMore(false);

  try {
    const { items, total, next } = await searchTracks(currentQuery, perPage, currentOffset);

    setLoading(false);

    if (fresh && items.length === 0) {
      showError('No tracks found for that search.');
      setResultsMeta(0, 0);
      return;
    }

    totalResults    = total;
    currentOffset  += items.length;
    hasMore         = next !== null;

    // Render cards
    const cardMap = renderTracks(items, !fresh);
    setResultsMeta(currentOffset, totalResults);
    setLoadMore(hasMore);

    // Batch-fetch ISRCs + preview URLs then inject
    const ids        = items.map(t => t.id);
    const detailMap  = await fetchTrackDetails(ids);
    injectTrackDetails(cardMap, detailMap);

  } catch (err) {
    setLoading(false);
    showError(err.message || 'Something went wrong. Check your credentials and try again.');
    console.error('[app] search error:', err);
  } finally {
    isSearching = false;
  }
}

function updateCredsNotice() {
  const notice = document.getElementById('no-creds-notice');
  notice.style.display = hasCredentials() ? 'none' : 'flex';
}