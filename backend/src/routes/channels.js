const router = require('express').Router();
const db = require('../db');
const requireAuth = require('../middleware/auth');

router.use(requireAuth);

function ownedPlaylist(playlistId, userId) {
  return db.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?').get(playlistId, userId);
}

// GET /api/channels?playlist_id=X
router.get('/', (req, res) => {
  const { playlist_id } = req.query;
  if (!playlist_id) return res.status(400).json({ error: 'playlist_id required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const rows = db.prepare('SELECT * FROM channels WHERE playlist_id = ? ORDER BY ord ASC, id ASC').all(playlist_id);
  res.json(rows);
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
  const { playlist_id, ids, action, value } = req.body;
  if (!playlist_id || !Array.isArray(ids) || !action) return res.status(400).json({ error: 'playlist_id, ids[], action required' });
  if (!ownedPlaylist(playlist_id, req.user.id)) return res.status(404).json({ error: 'Not found' });

  const placeholders = ids.map(() => '?').join(',');

  if (action === 'enable') {
    db.prepare(`UPDATE channels SET enabled=1 WHERE id IN (${placeholders}) AND playlist_id=?`).run(...ids, playlist_id);
  } else if (action === 'disable') {
    db.prepare(`UPDATE channels SET enabled=0 WHERE id IN (${placeholders}) AND playlist_id=?`).run(...ids, playlist_id);
  } else if (action === 'delete') {
    db.prepare(`DELETE FROM channels WHERE id IN (${placeholders}) AND playlist_id=?`).run(...ids, playlist_id);
  } else if (action === 'set_group' && value) {
    db.prepare(`UPDATE channels SET grp=? WHERE id IN (${placeholders}) AND playlist_id=?`).run(value, ...ids, playlist_id);
  } else if (action === 'set_epg_id' && value !== undefined) {
    db.prepare(`UPDATE channels SET epg_id=? WHERE id IN (${placeholders}) AND playlist_id=?`).run(value, ...ids, playlist_id);
  } else {
    return res.status(400).json({ error: 'Unknown action' });
  }

  res.json({ ok: true, affected: ids.length });
});

module.exports = router;
