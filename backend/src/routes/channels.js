const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function ownedPlaylist(playlistId, userId) {
  return db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId);
}

function parseBoolFilter(value) {
  if (value === undefined) return null;
  if (value === true || value === 'true' || value === '1' || value === 1) return 1;
  if (value === false || value === 'false' || value === '0' || value === 0) return 0;
  return null;
}

// GET /api/channels?playlist_id=X
router.get('/', (req, res) => {
  const { playlist_id, q = '', group = '__all__', enabled } = req.query;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const page = Math.max(1, Number.parseInt(req.query.page || '1', 10) || 1);
  const pageSize = Math.min(500, Math.max(25, Number.parseInt(req.query.page_size || '50', 10) || 50));
  const offset = (page - 1) * pageSize;
  const enabledFilter = parseBoolFilter(enabled);

  const where = ['playlist_id = ?'];
  const params = [playlist_id];
  if (q) {
    where.push('(name LIKE ? OR grp LIKE ? OR tvg_id LIKE ?)');
    const pattern = `%${q}%`;
    params.push(pattern, pattern, pattern);
  }
  if (group && group !== '__all__') {
    where.push('grp = ?');
    params.push(group);
  }
  if (enabledFilter !== null) {
    where.push('enabled = ?');
    params.push(enabledFilter);
  }
  const whereSql = where.join(' AND ');

  const rows = db.prepare(`SELECT * FROM channels WHERE ${whereSql} ORDER BY ord ASC, id ASC LIMIT ? OFFSET ?`)
    .all(...params, pageSize, offset);
  const total = db.prepare(`SELECT COUNT(*) as count FROM channels WHERE ${whereSql}`).get(...params).count;

  const groups = db.prepare(`
    SELECT grp, COUNT(*) AS count, SUM(CASE WHEN enabled = 1 THEN 1 ELSE 0 END) AS enabled_count
    FROM channels
    WHERE playlist_id = ?
    GROUP BY grp
    ORDER BY grp COLLATE NOCASE ASC
  `).all(playlist_id);

  const totalCount = db.prepare('SELECT COUNT(*) as count FROM channels WHERE playlist_id = ?').get(playlist_id).count;
  const enabledCount = db.prepare('SELECT COUNT(*) as count FROM channels WHERE playlist_id = ? AND enabled = 1').get(playlist_id).count;

  res.json({
    items: rows,
    total,
    page,
    page_size: pageSize,
    has_more: offset + rows.length < total,
    filters: { q, group, enabled: enabledFilter },
    summary: { total: totalCount, enabled: enabledCount },
    groups,
  });
});

// POST /api/channels — add single channel
router.post('/', (req, res) => {
  const { playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo, grp, epg_id } = req.body;
  if (!playlist_id || !name || !url) return res.status(400).json({ error: 'playlist_id, name, url required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const maxOrd = db.prepare('SELECT MAX(ord) as m FROM channels WHERE playlist_id = ?').get(playlist_id).m ?? -1;
  const result = db.prepare(`
    INSERT INTO channels (playlist_id, name, url, duration, tvg_id, tvg_name, tvg_logo, grp, epg_id, enabled, ord)
    VALUES (?,?,?,?,?,?,?,?,?,1,?)
  `).run(playlist_id, name, url, duration||'-1', tvg_id||'', tvg_name||name, tvg_logo||'', grp||'Ungrouped', epg_id||'', maxOrd + 1);

  res.status(201).json(db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/channels/:id — update single channel
router.put('/:id', (req, res) => {
  const ch = db.prepare('SELECT c.* FROM channels c JOIN playlists p ON p.id=c.playlist_id WHERE c.id=? AND p.user_id=?').get(req.params.id, req.user.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });

  const fields = ['name','url','duration','tvg_id','tvg_name','tvg_logo','grp','epg_id','backup_epg_id','enabled','timeshift'];
  const updates = {};
  fields.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  if (!Object.keys(updates).length) return res.json(ch);

  const set = Object.keys(updates).map(k => `${k}=@${k}`).join(', ');
  db.prepare(`UPDATE channels SET ${set} WHERE id=@id`).run({ ...updates, id: ch.id });
  res.json(db.prepare('SELECT * FROM channels WHERE id = ?').get(ch.id));
});

// DELETE /api/channels/:id
router.delete('/:id', (req, res) => {
  const ch = db.prepare('SELECT c.id FROM channels c JOIN playlists p ON p.id=c.playlist_id WHERE c.id=? AND p.user_id=?').get(req.params.id, req.user.id);
  if (!ch) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM channels WHERE id = ?').run(ch.id);
  res.json({ ok: true });
});

// POST /api/channels/reorder — update ordering for a playlist
router.post('/reorder', (req, res) => {
  const { playlist_id, order } = req.body; // order: array of channel IDs in new order
  if (!playlist_id || !Array.isArray(order)) return res.status(400).json({ error: 'playlist_id and order[] required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const update = db.prepare('UPDATE channels SET ord=? WHERE id=? AND playlist_id=?');
  db.transaction(() => {
    order.forEach((id, i) => update.run(i, id, playlist_id));
  })();
  res.json({ ok: true });
});

// POST /api/channels/bulk — bulk update
router.post('/bulk', (req, res) => {
  const { playlist_id, ids, action, value, selection = 'ids', group = null, q = '', enabled } = req.body;
  if (!playlist_id || !action) return res.status(400).json({ error: 'playlist_id and action required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const enabledFilter = parseBoolFilter(enabled);
  const where = ['playlist_id = ?'];
  const whereParams = [playlist_id];
  if (selection === 'group') {
    if (!group) return res.status(400).json({ error: 'group required for group selection' });
    where.push('grp = ?');
    whereParams.push(group);
  } else if (selection === 'filtered') {
    if (q) {
      where.push('(name LIKE ? OR grp LIKE ? OR tvg_id LIKE ?)');
      const pattern = `%${q}%`;
      whereParams.push(pattern, pattern, pattern);
    }
    if (group && group !== '__all__') {
      where.push('grp = ?');
      whereParams.push(group);
    }
    if (enabledFilter !== null) {
      where.push('enabled = ?');
      whereParams.push(enabledFilter);
    }
  } else {
    if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'ids[] required for ids selection' });
    const placeholders = ids.map(() => '?').join(',');
    where.push(`id IN (${placeholders})`);
    whereParams.push(...ids);
  }
  const whereSql = where.join(' AND ');
  const affected = db.prepare(`SELECT COUNT(*) as count FROM channels WHERE ${whereSql}`).get(...whereParams).count;

  if (action === 'enable') {
    db.prepare(`UPDATE channels SET enabled=1 WHERE ${whereSql}`).run(...whereParams);
  } else if (action === 'disable') {
    db.prepare(`UPDATE channels SET enabled=0 WHERE ${whereSql}`).run(...whereParams);
  } else if (action === 'delete') {
    db.prepare(`DELETE FROM channels WHERE ${whereSql}`).run(...whereParams);
  } else if (action === 'set_group' && value) {
    db.prepare(`UPDATE channels SET grp=? WHERE ${whereSql}`).run(value, ...whereParams);
  } else if (action === 'set_epg_id' && value !== undefined) {
    db.prepare(`UPDATE channels SET epg_id=? WHERE ${whereSql}`).run(value, ...whereParams);
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  res.json({ ok: true, affected });
});

module.exports = router;
