<p align="center">
  <img src="frontend/branding/svg/stationarr-vertical.svg" alt="Stationarr" width="260">
</p>

<p align="center">
  IPTV playlist editor, EPG matcher, and self-hosted companion for the *arr ecosystem.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/license-AGPL--3.0--or--later-blue" alt="License"/>
  <img src="https://img.shields.io/badge/commercial-license%20available-green" alt="Commercial license available"/>
  <img src="https://img.shields.io/badge/docker-ready-blue" alt="Docker"/>
  <img src="https://img.shields.io/badge/node-20%2B-green" alt="Node"/>
  <a href="https://ko-fi.com/rroy676"><img src="https://img.shields.io/badge/Ko--fi-support-FF5E5B?logo=ko-fi&logoColor=white" alt="Ko-fi"/></a>
</p>

---

Import legally obtained M3U playlists, organise channels, match XMLTV programme guide data from authorized or public sources, and serve a clean edited playlist directly to your IPTV player.

Stationarr is a playlist and EPG management tool only. It does **not** provide, host, sell, distribute, promote, or recommend IPTV streams, subscriptions, copyrighted broadcasts, paid channel packages, or unauthorized access to television content. Users are responsible for ensuring that all playlists, EPG sources, provider credentials, stream URLs, logos, and metadata used with Stationarr are legally obtained and used in compliance with applicable laws and provider terms.

See [DISCLAIMER.md](DISCLAIMER.md) before using or contributing to this project.

---

## Branding assets

Stationarr branding assets are available in:

```text
frontend/branding/
```

The main downloadable app logo is:

```text
frontend/branding/logo.png
```

The branding package also includes additional PNG sizes, SVG versions, horizontal and vertical logo variants, brand tokens, and brand sheet assets.

---


## Screenshots

**Dashboard**
<p align="center">
  <img src="docs/screenshots/dashboard.png" alt="Dashboard dark" width="49%"/>
  <img src="docs/screenshots/dashboard-light.png" alt="Dashboard light" width="49%"/>
</p>

**Channel Editor**
<p align="center">
  <img src="docs/screenshots/editor.png" alt="Channel Editor dark" width="49%"/>
  <img src="docs/screenshots/editor-light.png" alt="Channel Editor light" width="49%"/>
</p>

**TV Guide**

<p align="center">
  <img src="docs/screenshots/guide.png" alt="TV Guide dark" width="49%"/>
  <img src="docs/screenshots/guide-light.png" alt="TV Guide light" width="49%"/>
</p>

---

## Features

### Playlist management
- Import M3U via authorized provider login (Xtream Codes), URL, or file upload
- Duplicate playlists or create filtered copies (by group, keyword, enabled channels)
- Auto-refresh channels on a schedule
- Xtream Codes API output — compatible with TiviMate, IPTV Smarters, etc.

### Channel editor
- Visual channel editor — rename, reorder (drag & drop), group
- Bulk operations — enable, disable, delete, reassign group
- Ctrl/Cmd+click and Shift+click multi-select
- Filter channels by enabled status or EPG mapping
- Server-side paginated channel editor for very large playlists.
- Page-size controls.
- Server-side search, group, and enabled/disabled filtering.
- Group sidebar with full-group enable/disable actions.
- Selected-row bulk operations.

### EPG (Electronic Programme Guide)
- Multiple XMLTV sources with drag-to-reorder priority
- Auto-match channels to EPG by TVG ID — choose which source to match from
- Primary and backup EPG ID per channel (fallback when primary has no data)
- Searchable EPG channel picker with source filter per channel
- Timeshift per channel (slider + manual input)
- EPG preview in channel panel
- Memory-efficient SAX streaming parser — handles 100MB+ XMLTV files without RAM spikes
- Gzip-compressed EPG output — reduces transfer size ~90% for fast player loading
- Built-in free EPG source library (EPG.pw, i.mjh.nz, xmltv.net) for 30+ countries
- Background Guide index builds after EPG fetch/upload/refresh so the TV Guide can query programme data quickly.
- Guide index status messages show when indexing is building or failed.

### iptv-org/epg scraper integration
- Optional Docker sidecar to scrape EPG from 100+ websites
- Manage scraper channels from within Stationarr UI — no terminal needed
- Search the iptv-org channel database by country and name
- Run scraper on demand with live log output in browser
- Auto-fetch guide into Stationarr when scrape completes

### TV Guide
- SQLite-backed Guide programme index.
- Lazy-loaded Guide rows.
- Automatic load-more on scroll.
- Manual Load more fallback.
- Batch-size controls.
- 12h/24h visible Guide windows.
- Server-side Guide search/group/time-window queries.
- Day navigation (Today, Tomorrow, day-of-week buttons).
- Adjust timeshift per channel directly from the Guide.
- Timezone selector applied to all time displays.

### Logo management
- Auto-match logos from EPG sources
- Logo browser — searches [tv-logo/tv-logos](https://github.com/tv-logo/tv-logos) (10,000+ logos)

### Output
- Hosted M3U URL per playlist — use directly in any IPTV player
- Hosted EPG URL — merged XMLTV from all mapped sources with timeshift applied, gzip compressed
- Xtream Codes API (`player_api.php`, live stream redirect, `xmltv.php`)

### Multi-user
- JWT authentication — first registered account is automatically admin
- Admin panel — user management, password reset
- Registration can be disabled after setup

### UI
- Dark mode, light mode, auto (follows system preference)
- Backup and restore — export all playlists and settings as JSON

---

## Quick start — Docker (recommended)

**Option A — Docker Hub (easiest):**
```bash
docker run -d \
  --name stationarr \
  -p 3000:3000 \
  -e JWT_SECRET=change-me-to-something-random \
  -e SCRAPER_CHANNELS_PATH=/app/data/scraper/channels.xml \
  -v stationarr_data:/app/data \
  -v stationarr_scraper_shared:/app/data/scraper \
  rroy676/stationarr:latest
```

**Option B — Docker Compose (recommended for production):**
```bash
git clone https://github.com/rroy676/Stationarr.git
cd Stationarr
cp .env.example .env          # set JWT_SECRET to a long random string
docker compose up -d
```

Open `http://localhost:3000` and register your account. The first account is automatically admin.

If you also run the optional iptv-org/epg sidecar, mount the same shared scraper volume at `/epg/public` in that container:

```bash
docker run -d \
  --name stationarr-epg \
  -v stationarr_scraper_shared:/epg/public \
  ghcr.io/iptv-org/epg:master
```

> Keep Stationarr `SCRAPER_CHANNELS_PATH` under `/app/data` (recommended: `/app/data/scraper/channels.xml`). Do **not** set it to `/epg/public/channels.xml` because `/epg/public` is the sidecar container path.

### With iptv-org/epg scraper (optional)

The EPG scraper lets you fetch programme data for specific channels from 100+ websites. It runs as a separate Docker container using the official [iptv-org/epg](https://github.com/iptv-org/epg) image.

**Step 1 — Uncomment the `epg:` block in `docker-compose.yml`**

**Step 2 — Restart:**
```bash
docker compose up -d
```

**Step 3 — Go to Settings → EPG Scraper** to add channels and run the scraper from the UI.

> **Docker socket warning:** Some scraper-management workflows may require Docker socket access. Mounting `/var/run/docker.sock` gives the Stationarr container broad control over Docker on the host. Only enable it on trusted self-hosted systems. See [SECURITY.md](SECURITY.md).
>
> **First run behaviour (important):** If Docker socket access is not mounted, Stationarr cannot trigger the sidecar immediately. On fresh installs, `guide.xml` may not exist yet and will return `404` until the sidecar cron job runs (default every 6 hours) or you run the sidecar manually (`docker exec ... npm run grab -- --channels=/epg/public/channels.xml --output=/epg/public/guide.xml`).


### EPG scraper troubleshooting (v1.0.9+)

If your scraper setup worked before but guide entries are now missing, check the following:

- **Re-add older scraper channels:** scraper channels created **before v1.0.9 (2026-05-19)** may contain legacy/invalid mappings. Remove and re-add those channels from **Settings → EPG Scraper** so Stationarr saves valid site-specific mappings.
- **Use site-specific mapping values:** each scraper entry needs a valid `xmltv_id` + site mapping pair from the selected site definition (for example `xmltv_id="ESPN.us@SD"` and `site_id="9200006937"`).
- **First run depends on Docker socket access:**
  - With `/var/run/docker.sock` mounted in Stationarr, **Run now** can trigger the sidecar immediately.
  - Without Docker socket access, Stationarr cannot start the sidecar run directly. Wait for the sidecar cron job or run it manually with `docker exec`.
- **`guide.xml` existing is not enough:** the file can exist but still contain zero `<programme>` entries. Always verify both channel count and programme count.
- **Cached source still needs channel matching:** even if `iptv-org/epg (scraper)` is cached in EPG Sources, guide data will not appear in the Guide until playlist channels are matched to EPG IDs in Channel Editor.

### First-run notes by deployment type

- **Docker Compose (`docker compose up -d`)**
  - If Stationarr has Docker socket access (`/var/run/docker.sock` mounted), **Run now** can trigger the sidecar and then auto-fetch `guide.xml`.
  - Without Docker socket access, Stationarr can only check whether `guide.xml` already exists. If missing, wait for cron/manual sidecar run.
- **Docker Run (`docker run ...`)**
  - Same behaviour as Compose: mount Docker socket only if you want Stationarr to trigger sidecar runs immediately.
  - Without socket access, first-run `guide.xml` generation must come from the sidecar’s own cron or a manual `docker exec` in the sidecar container.

---

## Quick start — Bare metal

### Requirements
- Node.js 20+
- npm 9+

```bash
git clone https://github.com/rroy676/Stationarr.git
cd Stationarr
cp .env.example .env

# Build frontend
cd frontend && npm install && npm run build && cd ..

# Install backend dependencies
cd backend && npm install --omit=dev && cd ..

# Run with PM2
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save && pm2 startup
```

App will be available at `http://localhost:3000`.

### Nginx reverse proxy (optional)

Copy `nginx/stationarr.conf` to `/etc/nginx/sites-available/` and update `server_name`. Then:

```bash
sudo ln -s /etc/nginx/sites-available/stationarr.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

When Stationarr is deployed behind a trusted reverse proxy that sends `X-Forwarded-For`, set `TRUST_PROXY=true` (or `TRUST_PROXY=1`). This trusts exactly one proxy hop for Express rate-limit/IP handling. Leave it unset or `false` for direct/non-proxy deployments.

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the backend listens on |
| `JWT_SECRET` | *(required)* | Secret for signing JWT tokens — use a long random string |
| `JWT_EXPIRES_IN` | `7d` | Token expiry |
| `DATA_DIR` | `./data` | Directory for SQLite DB and EPG cache |
| `BASE_URL` | `http://localhost:3000` | Public base URL — used in hosted playlist links |
| `REGISTRATION_OPEN` | `true` | Set to `false` to disable new user signups after setup |
| `TRUST_PROXY` | `false` | Set to `true` or `1` only when Stationarr is behind one trusted reverse proxy that sends `X-Forwarded-For` |
| `SCRAPER_URL` | `http://epg:3000` | URL of the iptv-org/epg sidecar container |
| `SCRAPER_CHANNELS_PATH` | `/app/data/scraper/channels.xml` | Path to channels.xml shared with scraper |

---

## Hosted playlist URLs

After importing a playlist, each user gets unique URLs:

| URL | Description |
|---|---|
| `http://yourhost/api/serve/{slug}/playlist.m3u` | Edited M3U playlist |
| `http://yourhost/api/serve/{slug}/epg.xml` | Merged EPG (XMLTV, gzip compressed) |
| `http://yourhost/api/serve/{slug}/xtream` | Xtream Codes API base URL |

Add these directly to your IPTV player (TiviMate, IPTV Smarters, Kodi, VLC, etc.)

> **Privacy warning:** Hosted playlist, EPG, and Xtream URLs are bearer-style access URLs. Anyone with the URL may be able to access that output. Keep them private and rotate/regenerate credentials if exposed.

---

## Free EPG sources

Stationarr includes a built-in browser of free public EPG sources. Go to **EPG Sources → Browse library** to add them in one click.

| Source | Coverage | Notes |
|---|---|---|
| EPG.pw | 50+ countries | Broad coverage, recommended starting point |
| i.mjh.nz — PlutoTV | US, CA, UK, AU | Free streaming channels |
| i.mjh.nz — Plex | US, CA, UK, AU | Plex live TV channels |
| i.mjh.nz — Samsung TV+ | US, CA, UK, DE, FR, ES, IT | Samsung free channels |
| xmltv.net | US, Canada, UK | Community maintained |

---

## Compatible IPTV players

| Player | Platform | M3U | EPG | Xtream |
|---|---|---|---|---|
| TiviMate | Android / Fire TV | ✓ | ✓ | ✓ |
| IPTV Smarters Pro | iOS / Android | ✓ | ✓ | ✓ |
| Kodi (PVR IPTV) | All | ✓ | ✓ | — |
| VLC | All | ✓ | — | — |
| Infuse | iOS / macOS | ✓ | — | — |
| Channels DVR | All | ✓ | ✓ | — |

---

## Usage guide

### 1. Getting started

1. Open Stationarr in your browser and register an account. The **first account is automatically admin**.
2. Click **New playlist** on the Dashboard and give it a name (e.g. "My IPTV").
3. Import your channels (see below), match EPG data, then grab your serve URLs from the **Serve** button.

> Disable registration after setup: set `REGISTRATION_OPEN=false` in your `.env` and restart.

---

### 2. Importing channels

**From a URL (M3U)**
Open the playlist editor → click **Import → URL** → paste your authorized provider's `.m3u` link → Fetch. Enable **Auto-refresh** in playlist settings to re-import on a schedule.

**From a file**
Import → File → select a local `.m3u` or `.m3u8` file that you are legally authorized to use.

**Xtream Codes / provider login**
Import → Xtream → enter server address, username, password for a provider account you are authorized to access. All streams are fetched via the Xtream API.

**Organising**
- Drag rows to reorder. Shift+click / Ctrl+click to multi-select.
- Use the **group sidebar** to filter by category or toggle all channels in a group.
- Bulk toolbar: enable, disable, delete, or reassign groups for selected channels.

**Duplicating / filtering**
On the Dashboard, use **Duplicate** to clone a playlist, or **Create filtered copy** to extract channels matching a keyword or group into a new playlist.

---

### 3. EPG setup

**Add a source**
In the playlist editor → **EPG tab** → **Add source** → enter a name and XMLTV URL → **Fetch & cache**. Large files (100MB+) are handled with SAX streaming — no RAM spikes.

**Auto-match**
Click **Auto-match** after fetching. Stationarr tries to match channels by `tvg-id`, then normalised name, then fuzzy name (strips HD/SD/4K suffixes). Matched channels show guide data immediately.

**Manual match**
Click any channel row → use the **EPG search** box in the panel → click an entry to assign it. You can also set a **backup EPG ID** per channel as a fallback.

**Timeshift**
If a channel's guide data is offset by a fixed number of hours, set **Timeshift** in the channel panel (positive or negative minutes). The EPG output adjusts all programme times accordingly.

**Auto-refresh EPG**
In EPG source settings, enable **Auto-refresh** and pick an interval — Stationarr re-fetches the XMLTV file on a schedule.

After an EPG source is fetched, uploaded, or refreshed, Stationarr builds a Guide index in the background. The first Guide load after an EPG update may show an indexing message; once indexing is complete, Guide browsing is much faster.

**ChannelsDVR**
Add your Stationarr **M3U URL** as an M3U source in ChannelsDVR. Add your **EPG URL** separately under Guide → Guide Data Sources. ChannelsDVR matches guide data to channels using the `tvg-id` attribute — make sure channels have EPG entries assigned in Stationarr.

---

### 4. Using the TV Guide

The TV Guide uses a background SQLite programme index for faster browsing with large XMLTV files.

Guide rows are loaded in batches. Scroll down to automatically load more channels, or use the Load more button. Use Batch size to control how many channels are loaded at a time.

Use the 12h/24h selector to change the visible time window. Search and group filters reset the Guide to the first matching batch.

---

### 5. Serving to players

Click **Serve** on any playlist to get your personal URLs:

| URL | Use for |
|---|---|
| `…/playlist.m3u` | Any M3U-compatible player |
| `…/epg.xml` | Guide data (XMLTV, gzip compressed) |
| `…/xtream` | Xtream Codes API base URL |

**TiviMate** — Add Playlist → M3U URL. Then in playlist settings → EPG source → paste EPG URL.

**Kodi (PVR IPTV Simple)** — Install the PVR IPTV Simple Client add-on. Set M3U Playlist URL and XMLTV URL in its settings.

**ChannelsDVR** — Settings → Sources → Add Source → M3U Playlist. Guide → Add Guide Source for EPG.

**VLC** — Media → Open Network Stream → paste the M3U URL.

> Make sure `BASE_URL` in your `.env` points to an address reachable by your players. Use a local IP for LAN-only setups, or your public domain/IP for remote access.

---

## Roadmap

Planned or possible improvements:

- Regenerate hosted playlist and EPG slugs from the UI
- Optional token support for served playlist and EPG URLs
- Safer scraper-sidecar management without requiring Docker socket access
- Docker healthcheck and improved container diagnostics
- Automated build/test workflow with GitHub Actions
- Import/export for individual playlists
- Advanced duplicate detection and cleanup tools
- Improved EPG conflict resolution and source priority controls
- More tests around M3U parsing, XMLTV parsing, authentication, and public serve endpoints

---

## Project structure

```
Stationarr/
├── backend/src/
│   ├── index.js              Express app entry
│   ├── db.js                 SQLite schema + migrations
│   ├── scheduler.js          Auto-refresh background jobs
│   ├── middleware/auth.js    JWT verification
│   ├── routes/
│   │   ├── auth.js           Register / login / me / password
│   │   ├── playlists.js      Playlist CRUD + import + clone
│   │   ├── channels.js       Channel CRUD + reorder + bulk ops
│   │   ├── epg.js            EPG source management + fetch + match
│   │   ├── guide.js          TV Guide API using DB-backed programme index
│   │   ├── scraper.js        iptv-org/epg scraper integration
│   │   ├── serve.js          Public hosted M3U + EPG + Xtream output
│   │   ├── backup.js         Backup and restore user data
│   │   └── xtream.js         Xtream Codes API compatibility
│   └── utils/
│       ├── m3u.js            Parse + export M3U
│       ├── xmltv.js          SAX streaming XMLTV parser
│       ├── xmltv-merge.js    Multi-source XMLTV merge with timeshift
│       ├── guide-indexer.js  Background XMLTV-to-SQLite Guide index builder
│       └── epg-reader.js     Legacy/on-demand programme extraction helper
├── frontend/branding/        Logo, favicon, and branding assets
├── frontend/src/
│   ├── pages/
│   │   ├── Dashboard.jsx     Playlist list
│   │   ├── Editor.jsx        Channel editor
│   │   ├── Guide.jsx         TV Guide grid
│   │   ├── Settings.jsx      Timezone, theme, backup, password
│   │   ├── Scraper.jsx       EPG scraper management
│   │   ├── Admin.jsx         User management (admin only)
│   │   └── Help.jsx          In-app help and documentation
│   └── components/
│       ├── ChannelTable.jsx  Server-paginated channel list
│       ├── ChannelPanel.jsx  Channel detail + EPG source picker
│       ├── EPGPanel.jsx      EPG source management + priority ordering
│       ├── GroupSidebar.jsx  Draggable group filter sidebar
│       ├── ImportModal.jsx   Import + clone playlist modal
│       ├── IPTVOrgBrowser.jsx Free EPG source library browser
│       ├── LogoBrowser.jsx   tv-logos logo search
│       ├── ThemeToggle.jsx   Dark/light/auto theme switcher
│       └── HeaderButtons.jsx Ko-fi + GitHub links
├── docs/screenshots/         README screenshots
├── epg/channels.xml          iptv-org/epg scraper channel config
├── nginx/stationarr.conf     Nginx reverse proxy config
├── docker-compose.yml
├── Dockerfile
└── ecosystem.config.js       PM2 config for bare-metal deployment
```

---

## Support the Project

Stationarr is free and open source software.

If Stationarr is useful to you, voluntary donations are appreciated and help support ongoing development, testing, documentation, maintenance, hosting, and related project costs.

<p align="center">
  <a href="https://ko-fi.com/rroy676" target="_blank">
    <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi"/>
  </a>
</p>

Donations are optional and do not grant commercial license rights, warranty, support guarantees, priority support, custom development, or exceptions to the AGPL license.

Commercial licenses are available separately for organizations that want to use, modify, host, embed, distribute, white-label, bundle, or sell Stationarr without AGPL obligations. See [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md).

---

## Contributing

PRs welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

By submitting a contribution, you agree to [CONTRIBUTOR_TERMS.md](CONTRIBUTOR_TERMS.md), which allows Stationarr to remain available under both AGPL community terms and separate commercial license terms.

For security issues, please read [SECURITY.md](SECURITY.md) and do not open a public issue.

## Copyright

Copyright (C) 2026 Robert Roy and Stationarr Contributors.

See [NOTICE](NOTICE) for copyright, licensing, and third-party rights information.

## License

Stationarr is dual-licensed:

- **Community/open-source use:** GNU Affero General Public License v3.0 or later (`AGPL-3.0-or-later`)
- **Commercial use:** separate commercial licenses are available for users or organizations that want to use, modify, embed, host, distribute, white-label, bundle, or sell Stationarr without AGPL obligations.

Under the AGPL license, you may use, study, modify, and share the software. If you modify Stationarr and make it available to users over a network, you must also make your modified source code available under the same license.

Commercial licenses are available by contacting **Robert Roy** at **rroy676@gmail.com**.

See [LICENSE](LICENSE) for the full AGPL license text and [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) for commercial licensing information.
