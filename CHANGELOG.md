# Changelog

## Stationarr v1.2.0

### Added
- Added a Combined M3U URL so users can use one playlist URL containing enabled channels from all playlists.
- Added a dedicated user-level combined playlist token.
- Added a Regenerate token button for Combined M3U URLs.
- Regenerating the token invalidates old Combined M3U URLs.
- Added documentation for the combined playlist endpoint and token regeneration.

### Changed
- Combined M3U access now uses a separate token instead of reusing individual playlist slugs.

### Validation
- Confirmed Combined M3U appears in the UI.
- Confirmed Combined M3U uses `/api/serve/combined/:token/playlist.m3u`.
- Confirmed token regeneration works.
- Confirmed old token is invalidated after regeneration.

## Stationarr v1.1.2

### Fixed
- Added automatic Xtream Provider Login EPG discovery/import from provider XMLTV endpoints.
- Provider EPG import failures no longer block playlist import or refresh.

### Docker
- Added multi-architecture Docker publishing.
- Docker images now support linux/amd64 and linux/arm64.

Images:
- rroy676/stationarr:latest
- rroy676/stationarr:1.1.2
- rroy676/stationarr:v1.1.2

## v1.1.1 - Provider Login and Refresh Fixes

### Fixed

- Fixed Provider Login using the M3U `/get.php` URL instead of the Xtream Codes `/player_api.php` endpoint.
- Fixed Provider Login import for providers that support Xtream Codes API but do not expose M3U playlists through `/get.php`.
- Fixed Provider Login imports where `get_live_streams` returns `stream_id` without a direct `stream_url`.
- Fixed scheduled refresh for Provider Login playlists so it uses the Xtream API flow instead of the M3U fetch flow.
- Fixed `Refresh now` frontend error where the UI could call a missing `refresh()` API helper.
- Fixed manual playlist and EPG refresh error handling so failures return clearer messages.
- Fixed reverse-proxy deployments showing `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` when `TRUST_PROXY` is enabled.

### Improved

- Provider Login now builds playable live stream URLs from `stream_id` when needed.
- Provider Login preview now shows the `/player_api.php` endpoint format.
- Added opt-in `TRUST_PROXY` environment variable support for reverse-proxy deployments.
- Improved refresh logging and URL redaction to avoid exposing sensitive provider URLs or credentials.
- Preserved existing direct M3U URL imports and file imports.

## v1.1.0 - Large Playlist Performance

### Added

- Added server-side paginated channel loading for large playlists.
- Added page-size controls for the channel editor.
- Added server-side channel search, group, and enabled/disabled filtering.
- Added full-group enable/disable actions from the group sidebar.
- Added SQLite-backed Guide programme indexing.
- Added background Guide indexing after EPG fetch, upload, and refresh.
- Added startup backfill for existing cached EPG sources.
- Added lazy-loaded Guide rows with automatic load-more on scroll.
- Added manual Load more fallback and batch-size controls for the Guide.
- Added 12h/24h visible Guide windows.
- Added Guide index status messaging for building and failed index states.
- Added Stationarr branding assets and updated favicon references.
- Updated README branding and documentation for the new performance features.

### Improved

- Improved large playlist editor responsiveness by avoiding loading all channels into frontend state at once.
- Improved Guide performance by querying indexed programme data instead of reparsing XMLTV files during Guide navigation.
- Improved Guide layout with separate app and Guide control bars.
- Improved documentation for large playlist workflows, Guide usage, and branding assets.

### Fixed

- Fixed scraper XMLTV mapping normalization issues where variant suffixes such as `@SD` could prevent programme data from loading.
- Fixed Guide usability issues around large EPG datasets becoming sluggish after load.

## [1.0.12] — 2026-05-20

### Added
- Added Phase 1 in-app **System → Logs** page with backend structured logging APIs, retention-limited SQLite log storage, level/category/search filters, and sanitized TXT/JSON debug exports.
- Added support for copying visible logs to clipboard.
- Added scraper, EPG, playlist, scheduler, startup, and auth/session support events to the in-app logs.
- Added captured scraper run output lines and metadata/details in debug exports.

### Security
- Redacted sensitive values from logs and exports, including passwords, API keys, auth tokens, cookies, JWTs, and private source URL query strings.

### References
- Fixes #48
- PR #57

## [1.0.11] — 2026-05-20

### Fixed
- Normalized scraper XMLTV IDs before writing scraper `channels.xml` by stripping display/quality suffixes like `@SD`, `@HD`, `@FHD`, and `@UHD`, including for already-saved scraper channels when `channels.xml` is regenerated.
- Added scraper mapping debug logs that include original XMLTV ID, resolved XMLTV ID, site, site_id, and final XMLTV ID written after normalization decisions.
- Improved scraper run warnings for successful runs that still return 0 programme entries, with guidance that source support or channel mapping validity may be the cause.
- Clarified that `tvtv.us` HTTP 403 responses are upstream source access failures and not the Stationarr XMLTV ID normalization bug.

### References
- Fixes #38
- Refs #4

## [1.0.10] — 2026-05-19

### Added
- Added a new Settings → Updates section that keeps the existing update popup and shows current version, latest GitHub release, release date, release notes, release link, update status, and safe Docker Compose / Docker Run update instructions.
- Update popup now links directly to Settings → Updates for in-app release details and guidance.

### Fixed
- Improved playlist import and refresh HTTP 451 handling: Stationarr now keeps the technical `HTTP 451` status context in logs while showing a clearer user-facing message that the remote playlist source refused the request due to likely access restrictions or policy constraints.
- Fixed stale JWT handling for scraper channel adds: auth now verifies the token user still exists before setting `req.user`, returns `401` with `STALE_TOKEN` for missing users, and scraper channel insert now catches SQLite foreign-key constraint errors instead of crashing the backend.
- Improved stale-session frontend recovery for `401` auth failures: Stationarr now clears stale/invalid tokens, preserves backend `STALE_TOKEN` messages through redirect to `/login`, shows the message once, and avoids generic browser `NetworkError` text when backend JSON errors are available.

### Documentation
- Added EPG scraper troubleshooting guidance for v1.0.9 mapping changes, including re-add instructions for pre-v1.0.9 channels, first-run socket/cron behaviour, `guide.xml` vs programme-count caveat, and site-specific mapping examples.

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
