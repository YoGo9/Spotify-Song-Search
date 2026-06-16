// ui.js — card rendering, copy buttons, ISRC injection, audio preview

import { getSettings } from './settings.js';

const template = document.getElementById('track-card-template');
const grid     = document.getElementById('results');

// ── Audio preview state (one player, globally shared) ──────────────────
let activeAudio    = null;
let activeBtn      = null;
let progressTimer  = null;

function stopCurrent() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = '';
    activeAudio = null;
  }
  if (activeBtn) {
    setPlayingState(activeBtn, false);
    activeBtn = null;
  }
  clearInterval(progressTimer);
  progressTimer = null;
}

function setPlayingState(btn, playing) {
  const card     = btn.closest('.track-card');
  const progress = card.querySelector('.preview-progress');
  const bar      = card.querySelector('.preview-progress-bar');

  btn.querySelector('.icon-play').style.display  = playing ? 'none' : '';
  btn.querySelector('.icon-pause').style.display = playing ? ''     : 'none';
  btn.classList.toggle('playing', playing);
  progress.style.display = playing ? '' : 'none';
  if (!playing) bar.style.width = '0%';
}

function startProgressTracker(audio, bar) {
  clearInterval(progressTimer);
  progressTimer = setInterval(() => {
    if (!audio.duration) return;
    bar.style.width = ((audio.currentTime / audio.duration) * 100) + '%';
  }, 250);
}

function playPreview(btn, previewUrl) {
  // If clicking the currently playing card — pause it
  if (activeBtn === btn) {
    stopCurrent();
    return;
  }

  // Stop whatever was playing
  stopCurrent();

  const card = btn.closest('.track-card');
  const bar  = card.querySelector('.preview-progress-bar');

  const audio = new Audio(previewUrl);
  audio.volume = 0.8;

  activeAudio = audio;
  activeBtn   = btn;
  setPlayingState(btn, true);
  startProgressTracker(audio, bar);

  audio.play().catch(() => {
    // Autoplay blocked or network error — reset quietly
    stopCurrent();
  });

  audio.addEventListener('ended', () => {
    bar.style.width = '100%';
    setTimeout(() => stopCurrent(), 300);
  });

  audio.addEventListener('error', () => stopCurrent());
}

// Stop playback when user navigates away / loads more results
export function stopPreview() { stopCurrent(); }


/**
 * Render an array of Spotify track objects into the grid.
 * @param {Object[]} tracks
 * @param {boolean}  append  - false = clear grid first
 * @returns {Map<string, HTMLElement>}  trackId → card element (for ISRC injection)
 */
export function renderTracks(tracks, append = false) {
  if (!append) {
    stopCurrent();
    grid.innerHTML = '';
  }

  const cardMap = new Map();

  for (const track of tracks) {
    const card = buildCard(track);
    grid.appendChild(card);
    cardMap.set(track.id, card);
  }

  return cardMap;
}

/**
 * Inject ISRCs and preview URLs into already-rendered cards.
 * @param {Map<string, HTMLElement>} cardMap    trackId → element
 * @param {Object}                  detailMap  trackId → { isrc, previewUrl }
 */
export function injectTrackDetails(cardMap, detailMap) {
  const { mbUrl } = getSettings();
  const base = (mbUrl || 'https://beta.musicbrainz.org').replace(/\/$/, '');

  console.log('[injectTrackDetails] detailMap:', detailMap);

  for (const [id, card] of cardMap) {
    const detail     = detailMap[id] || {};
    const isrc       = detail.isrc       || null;
    const previewUrl = detail.previewUrl || null;
    console.log(`[inject] id=${id} isrc=${isrc} previewUrl=${previewUrl}`);

    // ISRC
    const valueEl = card.querySelector('.isrc-value');
    const copyBtn = card.querySelector('.isrc-copy');
    const mbLink  = card.querySelector('.isrc-mb-link');

    if (isrc) {
      valueEl.textContent = isrc;
      valueEl.classList.remove('loading');
      copyBtn.style.display = '';
      copyBtn.dataset.value = isrc;
      mbLink.href = `${base}/isrc/${isrc}`;
      mbLink.style.display = '';
    } else {
      valueEl.textContent = 'N/A';
      valueEl.classList.remove('loading');
    }

    // Preview button — wire it now that we have the URL from the batch call
    const previewBtn = card.querySelector('.preview-btn');
    if (previewUrl) {
      previewBtn.style.display = '';
      // Remove any previous listener by cloning, then re-attach
      const freshBtn = previewBtn.cloneNode(true);
      previewBtn.replaceWith(freshBtn);
      freshBtn.addEventListener('click', (e) => {
        e.preventDefault();
        playPreview(freshBtn, previewUrl);
      });
    } else {
      previewBtn.style.display = 'none';
    }
  }
}

/** Show error message in the grid area */
export function showError(msg) {
  grid.innerHTML = `<div class="error-msg">${escHtml(msg)}</div>`;
}

/** Show/hide the loading bar */
export function setLoading(visible) {
  document.getElementById('loading').style.display = visible ? 'block' : 'none';
}

/** Update the results count line */
export function setResultsMeta(showing, total) {
  const el = document.getElementById('results-meta');
  const count = document.getElementById('results-count');
  if (showing === 0) {
    el.style.display = 'none';
    return;
  }
  el.style.display = '';
  count.textContent = `${showing.toLocaleString()} of ${total.toLocaleString()} results`;
}

/** Show/hide load more button */
export function setLoadMore(visible) {
  document.getElementById('load-more-wrap').style.display = visible ? 'block' : 'none';
}

// ── Private ──────────────────────────────────────────────────────────

function buildCard(track) {
  const { harmonyUrl } = getSettings();
  const harmony = (harmonyUrl || 'https://harmony.pulsewidth.org.uk').replace(/\/$/, '');

  const frag = template.content.cloneNode(true);
  const card = frag.querySelector('.track-card');

  // Art
  const img = card.querySelector('.card-art');
  const artUrl = track.album.images?.[0]?.url;
  if (artUrl) {
    img.src = artUrl;
    img.alt = track.album.name + ' cover';
  } else {
    img.parentElement.style.background = '#1e1e1e';
  }

  // Text
  const artists = track.artists.map(a => a.name).join(', ');
  card.querySelector('.card-title').textContent  = track.name;
  card.querySelector('.card-artist').textContent = artists;
  card.querySelector('.card-album').textContent  = track.album.name;
  card.querySelector('.card-year').textContent   = track.album.release_date?.slice(0, 4) || '';
  card.querySelector('.card-pop').textContent    = `★ ${track.popularity}`;

  // Store copy values on title/artist copy buttons
  card.querySelector('[data-copy="title"]').dataset.value  = track.name;
  card.querySelector('[data-copy="artist"]').dataset.value = artists;

  // ISRC placeholder (filled by injectTrackDetails)
  card.querySelector('.isrc-value').textContent = '…';
  card.querySelector('.isrc-value').classList.add('loading');

  // Links
  const spotifyUrl = track.external_urls.spotify;
  const albumUrl   = track.album.external_urls.spotify;
  const odesliUrl  = 'https://song.link/s/' + track.id;
  const harmonyLink= `${harmony}/release?url=${encodeURIComponent(albumUrl)}&category=all`;

  card.querySelector('.chip-spotify').href = spotifyUrl;

  const copyUrlChip = card.querySelector('.chip-copy-url');
  copyUrlChip.dataset.value = spotifyUrl;
  copyUrlChip.addEventListener('click', (e) => {
    e.preventDefault();
    copyToClipboard(spotifyUrl, copyUrlChip, 'Copy URL', 'Copied!');
  });

  card.querySelector('.chip-odesli').href  = odesliUrl;
  card.querySelector('.chip-harmony').href = harmonyLink;

  // Wire all copy buttons
  card.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = btn.dataset.value;
      if (val) copyToClipboard(val, btn);
    });
  });

  return card;
}

function copyToClipboard(text, triggerEl, originalTitle, successTitle) {
  navigator.clipboard.writeText(text).then(() => {
    triggerEl.classList.add('copied');
    if (successTitle) triggerEl.textContent = successTitle;
    setTimeout(() => {
      triggerEl.classList.remove('copied');
      if (originalTitle) triggerEl.textContent = originalTitle;
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    triggerEl.classList.add('copied');
    setTimeout(() => triggerEl.classList.remove('copied'), 1500);
  });
}

function escHtml(str) {
  return str.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}