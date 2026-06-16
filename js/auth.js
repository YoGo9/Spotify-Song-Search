// auth.js — Spotify Client Credentials token management

let _token = '';
let _expiry = 0;
let _clientId = '';
let _clientSecret = '';

export function setCredentials(clientId, clientSecret) {
  _clientId = clientId;
  _clientSecret = clientSecret;
  // Invalidate cached token when credentials change
  _token = '';
  _expiry = 0;
}

export function hasCredentials() {
  return Boolean(_clientId && _clientSecret);
}

export async function getToken() {
  if (_token && Date.now() < _expiry - 60_000) {
    return _token;
  }
  return fetchToken();
}

async function fetchToken() {
  if (!_clientId || !_clientSecret) {
    throw new Error('No credentials configured');
  }

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type':  'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(_clientId + ':' + _clientSecret),
    },
    body: 'grant_type=client_credentials',
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error_description || 'Failed to get access token');
  }

  _token  = data.access_token;
  _expiry = Date.now() + data.expires_in * 1000;
  return _token;
}

// Invalidate and re-fetch (called on 401)
export async function refreshToken() {
  _token  = '';
  _expiry = 0;
  return fetchToken();
}
