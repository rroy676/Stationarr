# Stationarr — API Reference

All API endpoints are prefixed with `/api`. JSON body and response unless stated otherwise.

---

## Authentication

All endpoints except `/auth/login`, `/auth/register`, and `/serve/:slug/*` require a Bearer token.

```
Authorization: Bearer <token>
```

### POST /auth/register
Register a new user. The first user registered is automatically promoted to admin.

Disabled when `REGISTRATION_OPEN=false`.

**Body**
```json
{ "username": "alice", "email": "alice@example.com", "password": "secret123" }
```

**Response** `201`
```json
{ "token": "...", "user": { "id": 1, "username": "alice", "is_admin": true } }
```

---

### POST /auth/login
**Body** `{ "username": "alice", "password": "secret123" }` — accepts username or email.

**Response** `200` — same shape as register.

---

### GET /auth/me
Returns the current user's profile.

---

### PUT /auth/password
**Body** `{ "current": "old", "next": "newpassword" }`

---

## Playlists

### GET /playlists
List all playlists for the authenticated user.

### POST /playlists
**Body** `{ "name": "My playlist", "source_url": "http://..." }` — `source_url` is optional metadata.

### GET /playlists/:id

### PUT /playlists/:id
**Body** `{ "name": "New name" }`

### DELETE /playlists/:id

### POST /playlists/:id/import
Replace all channels in a playlist from an M3U source.

**Body (file content)**
```json
{ "content": "#EXTM3U\n#EXTINF:-1 ..." }
```

**Body (URL — fetched server-side)**
```json
{ "url": "http://provider.com/get.php?username=..." }
```

**Response** `{ "imported": 1234 }`

---

## Channels

### GET /channels?playlist_id=X
Returns all channels in a playlist ordered by `ord`.

### POST /channels
**Body**
```json
{
  "playlist_id": 1,
  "name": "BBC One",
  "url": "http://...",
  "grp": "UK",
  "tvg_id": "BBC1.uk",
  "tvg_name": "BBC One",
  "tvg_logo": "https://...",
  "epg_id": "BBC1.uk"
}
```

### PUT /channels/:id
Partial update — send only changed fields.

### DELETE /channels/:id

### POST /channels/reorder
**Body** `{ "playlist_id": 1, "order": [42, 7, 99, ...] }` — array of channel IDs in new display order.

### POST /channels/bulk
Perform an action on multiple channels at once.

**Body**
```json
{
  "playlist_id": 1,
  "ids": [1, 2, 3],
  "action": "enable" | "disable" | "delete" | "set_group" | "set_epg_id",
  "value": "UK"
}
```
`value` is required for `set_group` and `set_epg_id`.

---

## EPG Sources

### GET /epg
List all EPG sources for the current user.

### POST /epg
**Body** `{ "name": "EPG.best", "url": "https://epg.best/epg.xml.gz" }` — `url` optional.

### DELETE /epg/:id

### GET /epg/:id/channels
Returns all parsed EPG channel entries for a source.

### POST /epg/:id/fetch
Fetch and parse the source's URL (server-side). Updates `channel_count` and `last_fetched`.

**Response** `{ "loaded": 5000 }`

### POST /epg/:id/upload
Upload XMLTV content directly.

**Body** `{ "content": "<?xml version..." }`

### POST /epg/auto-match
Automatically match EPG IDs (and optionally logos) to channels in a playlist by comparing `tvg_id` and display names.

**Body** `{ "playlist_id": 1, "match_logos": true }`

**Response** `{ "matched": 312, "logo_matched": 180 }`

---


### POST /playlists/combined-token/regenerate
Regenerates the authenticated user's dedicated Combined M3U token. The previous Combined M3U URL stops working immediately because `/serve/combined/:token/playlist.m3u` only accepts the current `combined_slug` for that user.

**Auth:** required

**Response**
```json
{
  "combined_slug": "newCombinedToken",
  "combined_m3u_url": "http://yourhost/api/serve/combined/newCombinedToken/playlist.m3u"
}
```

---

## Public Serve Endpoints (no auth)

These endpoints are publicly accessible using either a playlist `slug` or the dedicated combined playlist `token`. Treat slugs and tokens as secrets.

### GET /serve/:slug/playlist.m3u
Returns the playlist as an M3U file, including only enabled channels.

### GET /serve/combined/:token/playlist.m3u
Returns one combined M3U file containing enabled channels from all playlists owned by the user that owns the dedicated combined token. This route does not accept individual playlist slugs. Playlists follow the dashboard order, and channels keep each playlist's channel order. Regenerating the user's combined token invalidates old Combined M3U URLs, which then return 404.

### GET /serve/:slug/epg.xml
Returns a minimal XMLTV file listing the channel metadata for all mapped EPG IDs.

### GET /serve/:slug/info
Returns JSON metadata about the playlist — useful for displaying in players.

```json
{
  "name": "My Playlist",
  "updated_at": "2024-10-01T12:00:00",
  "channel_count": 312,
  "m3u_url": "http://yourhost/api/serve/abc123/playlist.m3u",
  "epg_url": "http://yourhost/api/serve/abc123/epg.xml"
}
```

---

## Admin (admin users only)

### GET /admin/stats
```json
{ "users": 3, "playlists": 7, "channels": 12400, "epg_sources": 4 }
```

### GET /admin/users
List all users with playlist/channel counts.

### POST /admin/users
Create a user directly, bypassing `REGISTRATION_OPEN`.

**Body** `{ "username": "bob", "email": "bob@example.com", "password": "secret", "is_admin": false }`

### PATCH /admin/users/:id
**Body** — send one or both:
```json
{ "is_admin": true, "password": "newpassword" }
```

### DELETE /admin/users/:id
Deletes user and all their playlists (cascades).

---

## Error format

All errors return JSON:
```json
{ "error": "Description of the problem" }
```

Common status codes: `400` bad input, `401` unauthenticated, `403` forbidden, `404` not found, `409` conflict (duplicate username/email), `502` upstream fetch failed.

---

## Xtream Codes API (public, no JWT)

These endpoints are mounted at the root and implement the Xtream Codes protocol.
Access is controlled by the playlist's `xtream_user` / `xtream_pass` credentials.

### GET|POST /player_api.php
**Params** `username`, `password`, `action` (optional)

| action | Returns |
|---|---|
| *(none)* | Account info + server info |
| `get_live_categories` | Array of channel groups |
| `get_live_streams` | Array of channels with stream URLs |
| `get_vod_categories` | `[]` (not implemented) |
| `get_series` | `[]` (not implemented) |

### GET /live/:username/:password/:stream_id.ts
Redirects (302) to the actual stream URL. Players follow the redirect and connect directly.

### GET /xmltv.php
**Params** `username`, `password` — returns XMLTV EPG for the playlist.

### GET /get.php
**Params** `username`, `password`, `type=m3u_plus` — returns M3U playlist.

### POST /api/playlists/:id/regen-xtream
Regenerates the Xtream credentials for a playlist. Old credentials immediately stop working.
Requires JWT auth.
