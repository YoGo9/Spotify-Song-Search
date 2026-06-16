// settings.js — panel UI + localStorage persistence

const KEYS = {
  spotifyClientId:     'sss_client_id',
  spotifyClientSecret: 'sss_client_secret',
  qobuzAppId:          'sss_qobuz_app_id',
  harmonyUrl:          'sss_harmony_url',
  mbUrl:               'sss_mb_url',
  perPage:             'sss_per_page',
  activeProvider:      'sss_active_provider',
};

const DEFAULTS = {
  harmonyUrl:     'https://harmony.pulsewidth.org.uk',
  mbUrl:          'https://beta.musicbrainz.org',
  perPage:        20,
  activeProvider: 'deezer',
};

export function getSettings() {
  return {
    spotifyClientId:     localStorage.getItem(KEYS.spotifyClientId)     || '',
    spotifyClientSecret: localStorage.getItem(KEYS.spotifyClientSecret) || '',
    qobuzAppId:          localStorage.getItem(KEYS.qobuzAppId)          || '',
    harmonyUrl:          localStorage.getItem(KEYS.harmonyUrl)           || DEFAULTS.harmonyUrl,
    mbUrl:               localStorage.getItem(KEYS.mbUrl)               || DEFAULTS.mbUrl,
    perPage:             parseInt(localStorage.getItem(KEYS.perPage)     || DEFAULTS.perPage, 10),
    activeProvider:      localStorage.getItem(KEYS.activeProvider)       || DEFAULTS.activeProvider,
  };
}

export function saveSpotifyCredentials(clientId, clientSecret) {
  localStorage.setItem(KEYS.spotifyClientId,     clientId);
  localStorage.setItem(KEYS.spotifyClientSecret, clientSecret);
}

export function saveQobuzAppId(appId) {
  localStorage.setItem(KEYS.qobuzAppId, appId);
}

export function saveUrls(harmonyUrl, mbUrl) {
  localStorage.setItem(KEYS.harmonyUrl, harmonyUrl || DEFAULTS.harmonyUrl);
  localStorage.setItem(KEYS.mbUrl,      mbUrl      || DEFAULTS.mbUrl);
}

export function savePerPage(n) {
  localStorage.setItem(KEYS.perPage, n);
}

export function saveActiveProvider(id) {
  localStorage.setItem(KEYS.activeProvider, id);
}

export function initSettingsPanel({ onSpotifyCredentialsSaved, onQobuzAppIdSaved }) {
  const panel      = document.getElementById('settings-panel');
  const overlay    = document.getElementById('settings-overlay');
  const openBtn    = document.getElementById('settings-btn');
  const closeBtn   = document.getElementById('settings-close');
  const openInline = document.getElementById('open-settings-inline');

  // Spotify
  const cidInput     = document.getElementById('client-id');
  const csecInput    = document.getElementById('client-secret');
  const authStatus   = document.getElementById('auth-status');
  const saveCredsBtn = document.getElementById('save-credentials');

  // Qobuz
  const qobuzInput   = document.getElementById('qobuz-app-id');
  const qobuzStatus  = document.getElementById('qobuz-status');
  const saveQobuzBtn = document.getElementById('save-qobuz');

  // URLs
  const harmonyInput = document.getElementById('harmony-url');
  const mbInput      = document.getElementById('mb-url');
  const urlStatus    = document.getElementById('url-status');
  const saveUrlsBtn  = document.getElementById('save-urls');

  // Per page
  const perPageSelect = document.getElementById('results-per-page');

  function openPanel() {
    panel.classList.add('open');
    overlay.classList.add('visible');
    openBtn.classList.add('active');
    panel.setAttribute('aria-hidden', 'false');
  }
  function closePanel() {
    panel.classList.remove('open');
    overlay.classList.remove('visible');
    openBtn.classList.remove('active');
    panel.setAttribute('aria-hidden', 'true');
  }

  openBtn.addEventListener('click', openPanel);
  closeBtn.addEventListener('click', closePanel);
  overlay.addEventListener('click', closePanel);
  if (openInline) openInline.addEventListener('click', openPanel);

  // Populate from storage
  const s = getSettings();
  cidInput.value     = s.spotifyClientId;
  csecInput.value    = s.spotifyClientSecret;
  qobuzInput.value   = s.qobuzAppId;
  harmonyInput.value = s.harmonyUrl !== DEFAULTS.harmonyUrl ? s.harmonyUrl : '';
  harmonyInput.placeholder = DEFAULTS.harmonyUrl;
  mbInput.value      = s.mbUrl !== DEFAULTS.mbUrl ? s.mbUrl : '';
  mbInput.placeholder = DEFAULTS.mbUrl;
  perPageSelect.value = s.perPage;

  if (s.spotifyClientId && s.spotifyClientSecret) setStatus(authStatus, 'Credentials saved', 'success');
  if (s.qobuzAppId) setStatus(qobuzStatus, 'App ID saved', 'success');

  // Save Spotify
  saveCredsBtn.addEventListener('click', async () => {
    const id  = cidInput.value.trim();
    const sec = csecInput.value.trim();
    if (!id || !sec) { setStatus(authStatus, 'Both fields required', 'error'); return; }
    saveSpotifyCredentials(id, sec);
    setStatus(authStatus, 'Authenticating…', '');
    try {
      await onSpotifyCredentialsSaved(id, sec);
      setStatus(authStatus, 'Authenticated ✓', 'success');
    } catch (err) {
      setStatus(authStatus, 'Auth failed: ' + err.message, 'error');
    }
  });

  // Save Qobuz
  saveQobuzBtn.addEventListener('click', async () => {
    const id = qobuzInput.value.trim();
    if (!id) { setStatus(qobuzStatus, 'App ID required', 'error'); return; }
    saveQobuzAppId(id);
    setStatus(qobuzStatus, 'Testing…', '');
    try {
      await onQobuzAppIdSaved(id);
      setStatus(qobuzStatus, 'Connected ✓', 'success');
    } catch (err) {
      setStatus(qobuzStatus, 'Failed: ' + err.message, 'error');
    }
  });

  // Save URLs
  saveUrlsBtn.addEventListener('click', () => {
    saveUrls(harmonyInput.value.trim(), mbInput.value.trim());
    setStatus(urlStatus, 'Saved ✓', 'success');
    setTimeout(() => { urlStatus.textContent = ''; }, 2000);
  });

  // Per page
  perPageSelect.addEventListener('change', () => {
    savePerPage(parseInt(perPageSelect.value, 10));
  });
}

function setStatus(el, msg, type) {
  el.textContent = msg;
  el.className   = 'save-status' + (type ? ' status-' + type : '');
}
