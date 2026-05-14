# Changelog

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
