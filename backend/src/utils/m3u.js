/**
 * Parse an M3U/M3U8 playlist string into an array of channel objects.
 */
function classifyEntry({ attrs, name = '', url = '' }) {
  const group = (attrs['group-title'] || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();
  const tvgName = (attrs['tvg-name'] || '').toLowerCase();

  // Heuristic notes:
  // 1) URL path is the strongest signal for Xtream-style VOD/movie/series entries.
  // 2) Episode patterns in names are strong signals for series episodes, even without URL hints.
  // 3) Group-name checks are intentionally conservative and only match obviously VOD-only buckets.
  //    We intentionally do NOT treat generic words in channel names (movie/film/series) as enough to skip,
  //    because that can hide legitimate live channels.
  const urlVodRe = /\/(movie|series|vod)\//;
  const episodePatternRe = /\b(s\d{1,2}\s*e\d{1,3}|\d{1,2}x\d{1,3}|season\s*\d{1,2}\s*episode\s*\d{1,3}|episode\s*\d{1,3})\b/;
  const vodGroupRe = /^\s*(vod|movies?|series)\s*([|\-:/].*)?$/;

  if (urlVodRe.test(lowerUrl)) return 'vod_like';

  const combinedName = `${lowerName} ${tvgName}`.trim();
  if (episodePatternRe.test(combinedName)) return 'vod_like';

  if (vodGroupRe.test(group)) return 'vod_like';

  return 'live';
}

function parseM3U(text, options = {}) {
  const { includeVodLike = false } = options;
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const channels = [];
  const counts = {
    totalEntries: 0,
    importedLive: 0,
    skippedVodLike: 0,
  };
  let i = lines[0]?.startsWith('#EXTM3U') ? 1 : 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF:')) { i++; continue; }

    // Find next non-comment line (the stream URL)
    let j = i + 1;
    while (j < lines.length && lines[j].startsWith('#')) j++;
    const url = j < lines.length ? lines[j].trim() : '';

    // Duration
    const dur = (line.match(/#EXTINF:(-?[\d.]+)/) || [, '-1'])[1];

    // Key=value attributes
    const attrs = {};
    const attrRe = /([\w-]+)="([^"]*)"/g;
    let m;
    while ((m = attrRe.exec(line)) !== null) attrs[m[1]] = m[2];

    // Channel display name is everything after the last comma
    const name = (line.match(/,(.+)$/) || [, ''])[1].trim() || attrs['tvg-name'] || 'Unknown';

    counts.totalEntries += 1;
    const classification = classifyEntry({ attrs, name, url });
    if (classification === 'vod_like' && !includeVodLike) {
      counts.skippedVodLike += 1;
      i = j + 1;
      continue;
    }

    channels.push({
      name,
      url,
      duration:  dur,
      tvg_id:    attrs['tvg-id']      || '',
      tvg_name:  attrs['tvg-name']    || name,
      tvg_logo:  attrs['tvg-logo']    || '',
      grp:       attrs['group-title'] || 'Ungrouped',
      epg_id:    '',
      enabled:   1,
    });
    counts.importedLive += 1;

    i = j + 1;
  }

  return { channels, counts };
}

/**
 * Export an array of channel rows (from DB) back to an M3U string.
 */
function exportM3U(channels, options = {}) {
  const { includeLogo = true, includeGroup = true, channelId = 'epg' } = options;
  const lines = ['#EXTM3U'];
  for (const c of channels) {
    const logo  = includeLogo ? (c.tvg_logo || '') : '';
    const epgId = channelId === 'tvg' ? (c.tvg_id || c.epg_id || '') : (c.epg_id || c.tvg_id || '');
    const name  = c.tvg_name  || c.name;
    const attrs = [`tvg-id="${epgId}"`, `tvg-name="${name}"`];
    if (includeLogo) attrs.push(`tvg-logo="${logo}"`);
    if (includeGroup) attrs.push(`group-title="${c.grp || ''}"`);
    lines.push(`#EXTINF:${c.duration} ${attrs.join(' ')},${c.name}`);
    lines.push(c.url);
  }
  return lines.join('\n');
}

module.exports = { parseM3U, exportM3U };
