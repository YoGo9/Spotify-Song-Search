// settings.js — panel UI + localStorage persistence

const KEYS = {
  clientId:      'sss_client_id',
  clientSecret:  'sss_client_secret',
  harmonyUrl:    'sss_harmony_url',
  mbUrl:         'sss_mb_url',
  perPage:       'sss_per_page',
};

const DEFAULTS = {
  harmonyUrl: 'https://harmony.pulsewidth.org.uk',
  mbUrl:      'https://beta.musicbrainz.org',
  perPage:    20,
};

export function getSettings() {
  return {
    clientId:    localStorage.getItem(KEYS.clientId)     || '',
    clientSecret:localStorage.getItem(KEYS.clientSecret) || '',
    harmonyUrl:  localStorage.getItem(KEYS.harmonyUrl)   || DEFAULTS.harmonyUrl,
    mbUrl:       localStorage.getItem(KEYS.mbUrl)        || DEFAULTS.mbUrl,
    perPage:     parseInt(localStorage.getItem(KEYS.perPage) || DEFAULTS.perPage, 10),
  };
}

export function saveCredentials(clientId, clientSecret) {
  localStorage.setItem(KEYS.clientId, clientId);
  localStorage.setItem(KEYS.clientSecret, clientSecret);
}

export function saveUrls(harmonyUrl, mbUrl) {
  localStorage.setItem(KEYS.harmonyUrl, harmonyUrl || DEFAULTS.harmonyUrl);
  localStorage.setItem(KEYS.mbUrl,      mbUrl      || DEFAULTS.mbUrl);
}

export function savePerPage(n) {
  localStorage.setItem(KEYS.perPage, n);
}

export function initSettingsPanel(onCredentialsSaved) {
  const panel     = document.getElementById('settings-panel');
  const overlay   = document.getElementById('settings-overlay');
  const openBtn   = document.getElementById('settings-btn');
  const closeBtn  = document.getElementById('settings-close');
  const openInline= document.getElementById('open-settings-inline');

  const cidInput  = document.getElementById('client-id');
  const csecInput = document.getElementById('client-secret');
  const authStatus= document.getElementById('auth-status');
  const saveCredsBtn = document.getElementById('save-credentials');

  const harmonyInput = document.getElementById('harmony-url');
  const mbInput      = document.getElementById('mb-url');
  const urlStatus    = document.getElementById('url-status');
  const saveUrlsBtn  = document.getElementById('save-urls');

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

  // Populate fields from storage
  const s = getSettings();
  cidInput.value       = s.clientId;
  csecInput.value      = s.clientSecret;
  harmonyInput.value   = s.harmonyUrl !== DEFAULTS.harmonyUrl ? s.harmonyUrl : '';
  harmonyInput.placeholder = DEFAULTS.harmonyUrl;
  mbInput.value        = s.mbUrl !== DEFAULTS.mbUrl ? s.mbUrl : '';
  mbInput.placeholder  = DEFAULTS.mbUrl;
  perPageSelect.value  = s.perPage;

  if (s.clientId && s.clientSecret) {
    setAuthStatus('Credentials saved', 'success');
  }

  // Save credentials
  saveCredsBtn.addEventListener('click', async () => {
    const id  = cidInput.value.trim();
    const sec = csecInput.value.trim();
    if (!id || !sec) {
      setAuthStatus('Both fields are required', 'error');
      return;
    }
    saveCredentials(id, sec);
    setAuthStatus('Authenticating…', '');
    try {
      await onCredentialsSaved(id, sec);
      setAuthStatus('Authenticated ✓', 'success');
    } catch (err) {
      setAuthStatus('Auth failed: ' + err.message, 'error');
    }
  });

  // Save URLs
  saveUrlsBtn.addEventListener('click', () => {
    saveUrls(harmonyInput.value.trim(), mbInput.value.trim());
    urlStatus.textContent = 'Saved ✓';
    urlStatus.className = 'save-status status-success';
    setTimeout(() => { urlStatus.textContent = ''; }, 2000);
  });

  // Per page
  perPageSelect.addEventListener('change', () => {
    savePerPage(parseInt(perPageSelect.value, 10));
  });

  function setAuthStatus(msg, type) {
    authStatus.textContent = msg;
    authStatus.className = 'auth-status' + (type ? ' status-' + type : '');
  }
}
