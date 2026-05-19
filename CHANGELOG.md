# Changelog

## [Unreleased]

### Fixed
- Scraper channel add flow now resolves and stores valid site-specific `site_id`/`xmltv_id` definitions from iptv-org/epg instead of guessing `site_id` from a channel id.
- Added fallback lookup + clear error messaging when a site-specific scraper channel definition cannot be found for the selected site/channel pair.

## [1.0.8] — 2026-05-19

### Changed
- Playlist M3U import now classifies obvious VOD/movie/series entries and skips them by default so live-channel counts are clearer and less inflated.
- Refined VOD-like classifier to prioritize URL-path signals (`/movie/`, `/series/`, `/vod/`) and conservative episode/group heuristics, reducing false positives on legitimate live channels.
- Added import summary fields (`total_entries`, `imported_live`, `skipped_vod_like`, `include_vod_like`) to the playlist import API response.
- Scheduler refresh logs now report total parsed entries vs imported live channels and skipped VOD-like entries.

### Improved
- EPG scraper run logs now surface zero-programme outcomes with a clear warning and suggestion to try another scraper source/site.
- Scraper post-run checks now summarize generated `guide.xml` channel/programme counts so empty-programme guides are obvious.
- Auto-fetch logs now include loaded channel counts plus programme-entry counts when importing scraper output into Stationarr.
- EPG scraper help text now clarifies that adding one scraper channel only generates guide data for that selected channel.

### Fixed
- Updated the optional EPG sidecar Docker image tag from `ghcr.io/iptv-org/epg:latest` to `ghcr.io/iptv-org/epg:master`.

## [1.0.7] — 2026-05-19

### Improved
- Improved EPG scraper sidecar onboarding when no scraper channels are configured.
- Added scraper channel counts to the scraper status response.
- Added a visible warning in the EPG Scraper page when no scraper channels are configured.
- Disabled scraper runs when no scraper channels are selected.
- Added a clearer `NO_SCRAPER_CHANNELS` response when `/guide.xml` is missing because no guide was generated.

### Notes
- This release addresses the confusing `found 0 channel(s)` / `/guide.xml` 404 sidecar case.
- Large playlist performance and possible VOD/series import counting are being tracked separately.

## [1.0.6] — 2026-05-16

### Fixed
- Fixed a frontend crash when opening the Import M3U modal.
- The editor now correctly stores and passes the playlist list to the import modal.
- Playlist data is refreshed after imports so clone/import workflows stay current.
- 
## [1.0.5] — 2026-05-14

### Added
- Version number displayed in Settings → About section
- Update notification banner — appears when a newer GitHub release is available; dismissible per version
- `/api/health` now returns the real version from `package.json` instead of a hardcoded string

### Fixed
- `bug_report.md` issue template: added credentials warning, `labels: bug` frontmatter, "Actual behaviour" field
- `CONTRIBUTING.md`: security reporting section now links to `SECURITY.md` instead of "email maintainer"

## [1.0.4] — 2026-05-14

### Security
- Upgraded base image from `node:20-alpine` to `node:22-alpine` — newer Alpine packages reduce CVE surface
- Removed unused `wget` package from Docker image
- Switched to `npm ci` in Dockerfile for reproducible, lockfile-pinned builds
- Committed `package-lock.json` for backend and frontend
- Container now runs as non-root `node` user (UID 1000)

## [1.0.3] — 2026-05-14

### Added
- In-app Help page (`/help`) covering Getting Started, Importing, EPG setup, and Serving to Players
- Ko-fi support button and note on Help page
- Detailed usage guide added to README

### Fixed
- Copy buttons in the Serve modal now work on plain HTTP (fallback from Clipboard API to execCommand)

## [1.0.2] — 2026-05-14

### Fixed
- Merged EPG output no longer produces malformed XML (`<icon/></icon>`) from self-closing tags in source XMLTV files — fixes EPG not populating in ChannelsDVR and other strict XML parsers

## [1.0.0] — Initial release

### Features
- Multi-user accounts with JWT authentication
- First registered user auto-promoted to admin
- Playlist management — create, rename, delete
- M3U import via file upload or server-side URL fetch
- Visual channel editor — rename, reorder (drag & drop), toggle enabled
- Group sidebar with per-group filtering
- Full-text channel search
- Bulk operations — enable, disable, delete, move to group
- Multiple EPG (XMLTV) sources — URL fetch or file upload
- Auto EPG matching by tvg-id and display name normalisation
- Auto logo matching from EPG sources
- Hosted M3U output URL per playlist
- Hosted EPG (XMLTV) output URL per playlist
- Admin panel — user management, stats, password reset, admin toggle
- Settings page — password change
- Docker single-image deployment
- Bare metal deployment with PM2
- Nginx reverse proxy config with SSL comments
