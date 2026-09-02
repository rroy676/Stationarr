const PRESETS = Object.freeze({
  generic: Object.freeze({
    id: 'generic',
    label: 'Generic M3U/XMLTV',
    description: 'Broadly compatible output for IPTV players.',
    notes: 'Uses the channel EPG ID when available and keeps all enabled channels.',
    includeUnmatched: true,
    m3u: Object.freeze({ includeLogo: true, includeGroup: true, channelId: 'epg' }),
  }),
  plex: Object.freeze({
    id: 'plex',
    label: 'Plex',
    description: 'M3U/XMLTV output tuned for Plex live TV integrations.',
    notes: 'Keep tvg-id values aligned with XMLTV channel IDs for guide matching.',
    includeUnmatched: true,
    m3u: Object.freeze({ includeLogo: true, includeGroup: true, channelId: 'epg' }),
  }),
  'channels-dvr': Object.freeze({
    id: 'channels-dvr',
    label: 'Channels DVR',
    description: 'Strict channel and guide matching for Channels DVR.',
    notes: 'Channels without an EPG ID are omitted so every exported channel can match the guide.',
    includeUnmatched: false,
    m3u: Object.freeze({ includeLogo: true, includeGroup: true, channelId: 'epg' }),
  }),
  jellyfin: Object.freeze({
    id: 'jellyfin',
    label: 'Jellyfin',
    description: 'M3U/XMLTV output for Jellyfin Live TV.',
    notes: 'Preserves group titles and logo URLs; guide matching uses tvg-id.',
    includeUnmatched: true,
    m3u: Object.freeze({ includeLogo: true, includeGroup: true, channelId: 'epg' }),
  }),
});

function getServePreset(id = 'generic') {
  return PRESETS[String(id).toLowerCase()] || null;
}

function listServePresets() {
  return Object.values(PRESETS).map(({ id, label, description, notes }) => ({ id, label, description, notes }));
}

module.exports = { PRESETS, getServePreset, listServePresets };
