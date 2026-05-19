/**
 * Parse an M3U/M3U8 playlist string into an array of channel objects.
 */
function classifyEntry({ attrs, name = '', url = '' }) {
  const group = (attrs['group-title'] || '').toLowerCase();
  const tvgName = (attrs['tvg-name'] || '').toLowerCase();
  const lowerName = (name || '').toLowerCase();
  const lowerUrl = (url || '').toLowerCase();

  const combined = `${group} ${tvgName} ${lowerName}`;
  const vodKeywordRe = /\b(vod|movie|movies|film|films|serie|series|s\d+\s*e\d+|season\s*\d+|episode\s*\d+)\b/;
  const urlVodRe = /\/(movie|series|vod)\//;

  const looksLikeVod = vodKeywordRe.test(combined) || urlVodRe.test(lowerUrl);
  return looksLikeVod ? 'vod_like' : 'live';
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
function exportM3U(channels) {
  const lines = ['#EXTM3U'];
  for (const c of channels) {
    const logo  = c.tvg_logo  || '';
    const epgId = c.epg_id    || c.tvg_id || '';
    const name  = c.tvg_name  || c.name;
    lines.push(`#EXTINF:${c.duration} tvg-id="${epgId}" tvg-name="${name}" tvg-logo="${logo}" group-title="${c.grp}",${c.name}`);
    lines.push(c.url);
  }
  return lines.join('\n');
}

module.exports = { parseM3U, exportM3U };
