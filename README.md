# Spotify Song Search

A personal tool to search Spotify tracks with audio previews, direct links to Odesli, Harmony, and MusicBrainz ISRC lookup. Built for MusicBrainz contribution workflows.

**[Live →](https://yogo9.github.io/Spotify-Song-Search/)**

---

## Features

- Search Spotify by track name, or use Advanced mode with separate `track:` and `artist:` fields
- Debounced search-as-you-type
- **30-second audio previews** — play button on album art, one track at a time, progress bar included
  - Sourced from iTunes Search API (Spotify deprecated `preview_url` in November 2024)
  - Matched by track name + artist; silently hidden if iTunes has no match
- Album art, title, artist, album, year, popularity on every card
- **ISRC** fetched via Spotify batch API — shown with copy button
- Per-card copy buttons for: track name, artist, ISRC, Spotify URL
- Links on each card:
  - **Spotify** — open track
  - **Copy URL** — copy Spotify track URL to clipboard
  - **All services** — via song.link / Odesli
  - **Harmony** — open album in Harmony for MusicBrainz submission
  - **MusicBrainz** — ISRC lookup (appears once ISRC loads)
- Pagination via Load More
- Settings panel (⚙) with:
  - Spotify Client ID / Secret
  - Configurable Harmony base URL (point at your own self-hosted instance)
  - Configurable MusicBrainz base URL (`beta.musicbrainz.org` by default)
  - Results per page (10 / 20 / 50)
- All settings persisted to `localStorage`

## Setup

1. Go to [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) and create an app
2. Copy your **Client ID** and **Client Secret**
3. Open the tool, click ⚙, paste your credentials, click **Save & Authenticate**

No server required — runs entirely in the browser via Spotify's Client Credentials flow.

## Project structure

```
index.html
css/
  styles.css
js/
  app.js        ← init + event wiring
  auth.js       ← Spotify token management
  search.js     ← Spotify search, batch ISRC fetch, iTunes preview lookup
  ui.js         ← card rendering, audio player, copy buttons, ISRC injection
  settings.js   ← settings panel + localStorage persistence
```

## Notes

- **Audio previews** use the iTunes Search API (`itunes.apple.com/search`) which is CORS-safe from the browser. The Spotify `preview_url` field was deprecated for new apps on November 27, 2024 and returns `null`.
- **ISRC** data requires a second Spotify API call (`/tracks?ids=…`) — batched into one request per page of results. The same call feeds both ISRC display and the iTunes preview lookup.
- The **MusicBrainz ISRC link** (`/isrc/{ISRC}`) shows whether a recording exists in MB — if it 404s, it's not there yet.
- **Harmony links** go to album level — that's how Harmony works, it takes album/release URLs.

*This project was created with assistance from AI.*
