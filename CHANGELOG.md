# Changelog

## [Unreleased]

### Fixed
- Docker startup now proactively creates `/app/data` and `/app/data/scraper`, repairs ownership for UID/GID `1000`, and then starts Node as the non-root `node` user to prevent EACCES on fresh named volumes.
- Added startup warnings when `SCRAPER_CHANNELS_PATH` points outside `/app/data`, including a specific warning against using `/epg/public` in the Stationarr container.
- Fixed scraper first-run fallback when Docker CLI/socket access is unavailable: Stationarr now checks `SCRAPER_URL/guide.xml` before auto-fetching and no longer emits success/done states when the file is missing (404).
- Added clear scraper-run warnings for the “sidecar online but guide.xml not generated yet” case, including actionable next steps (wait for cron/manual sidecar run or enable Docker socket access for immediate Run now).
- Fixed immediate Docker-socket scraper command to pass `--output=/epg/public/guide.xml`, ensuring the sidecar writes guide output to the shared public path that Stationarr fetches.
- Docker entrypoint now relaxes permissions on a mounted `/var/run/docker.sock` before dropping privileges so the non-root `node` user can access Docker CLI for scraper "Run now".

### Documentation
- Updated `docker run` and `docker-compose` examples to use the correct shared volume mapping: Stationarr writes `/app/data/scraper/channels.xml` and the EPG sidecar mounts that same volume at `/epg/public`.
- Documented first-run scraper behaviour for Docker Compose and Docker Run when Docker socket access is not mounted.

## [1.0.9] — 2026-05-19

### Fixed
- Fixed EPG scraper channel mapping by resolving valid iptv-org/epg site-specific `site_id` and `xmltv_id` values instead of guessing from generic channel IDs.
- Added fallback lookup and clearer error messaging when a valid scraper channel definition cannot be found.
- Added support for nested iptv-org/epg site definition paths such as `sites/tvguide.com/tvguide.com.channels.xml`.
- Fixed “Go to EPG Sources” actions on the EPG Scraper page so they open the actual EPG Sources modal instead of routing to Settings.

### Improved
- EPG Sources modal now shows programme counts alongside channel counts, cache size, and cache age.
- EPG fetch/upload/manual refresh flows now return and display `programme_count`.
- Scheduler refreshes now count, store, and log programme totals.
- Programme counting now handles both plain XMLTV and `.xml.gz` sources safely.
- Added a “How the EPG scraper works” help section with clearer sidecar vs Stationarr scheduler behaviour.
- Added troubleshooting hints for common scraper outcomes: `0 channels` and `0 programmes`.

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
