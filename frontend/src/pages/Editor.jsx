import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { playlists as plApi, channels as chApi, epg as epgApi } from '../api.js';
import { useToast } from '../context.jsx';
import EditorHeader    from '../components/EditorHeader.jsx';
import GroupSidebar    from '../components/GroupSidebar.jsx';
import ChannelTable    from '../components/ChannelTable.jsx';
import ChannelPanel    from '../components/ChannelPanel.jsx';
import ImportModal     from '../components/ImportModal.jsx';
import EPGPanel        from '../components/EPGPanel.jsx';
import ServeModal      from '../components/ServeModal.jsx';

export default function Editor() {
  const { id }  = useParams();
  const nav     = useNavigate();
  const toast   = useToast();

  const [playlist,    setPlaylist]    = useState(null);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [channels,    setChannels]    = useState([]);
  const [epgSources,  setEpgSources]  = useState([]);
  const [allEpgCh,    setAllEpgCh]    = useState([]);
  const [loading,     setLoading]     = useState(true);

  // UI state
  const [activeGroup,   setActiveGroup]   = useState('__all__');
  const [search,        setSearch]        = useState('');
  const [selectedIds,   setSelectedIds]   = useState(new Set());
  const [editingId,     setEditingId]     = useState(null);
  const [showImport,    setShowImport]    = useState(false);
  const [showEPG,       setShowEPG]       = useState(false);
  const [showServe,     setShowServe]     = useState(false);

  // Load everything
  useEffect(() => {
    Promise.all([
      plApi.get(id),
      chApi.list(id),
      epgApi.list(),
      plApi.list(),
    ]).then(([pl, chs, sources, playlists]) => {
      setPlaylist(pl);
      setAllPlaylists(playlists);
      setChannels(chs);
      setEpgSources(sources);
      // Load EPG channels for all sources that have been fetched
      const loaded = sources.filter(s => s.channel_count > 0);
      return Promise.all(loaded.map(s => epgApi.channels(s.id)));
    }).then(results => {
      setAllEpgCh(results.flat());
    }).catch(e => {
      toast(e.message, 'error');
      nav('/');
    }).finally(() => setLoading(false));
  }, [id]);

  // Derived
  const groups = useMemo(() => {
    const m = {};
    channels.forEach(c => { m[c.grp] = (m[c.grp] || 0) + 1; });
    return m;
  }, [channels]);

  const filtered = useMemo(() => {
    let list = channels;
    if (activeGroup !== '__all__') list = list.filter(c => c.grp === activeGroup);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c => c.name.toLowerCase().includes(q) || c.grp.toLowerCase().includes(q) || c.tvg_id.toLowerCase().includes(q));
    }
    return list;
  }, [channels, activeGroup, search]);

  const editingChannel = useMemo(() => channels.find(c => c.id === editingId) ?? null, [channels, editingId]);

  // Channel operations
  const updateChannel = useCallback(async (channelId, updates) => {
    try {
      const updated = await chApi.update(channelId, updates);
      setChannels(prev => prev.map(c => c.id === channelId ? updated : c));
    } catch (e) { toast(e.message, 'error'); }
  }, []);

  const deleteChannel = useCallback(async (channelId) => {
    try {
      await chApi.remove(channelId);
      setChannels(prev => prev.filter(c => c.id !== channelId));
      if (editingId === channelId) setEditingId(null);
      toast('Channel deleted', 'success');
    } catch (e) { toast(e.message, 'error'); }
  }, [editingId]);

  const reorder = useCallback(async (newChannels) => {
    setChannels(newChannels);
    const order = newChannels.map(c => c.id);
    try {
      await chApi.reorder({ playlist_id: id, order });
    } catch (e) { toast(e.message, 'error'); }
  }, [id]);

  const bulkAction = useCallback(async (action, value) => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    try {
      await chApi.bulk({ playlist_id: id, ids, action, value });
      if (action === 'delete') {
        setChannels(prev => prev.filter(c => !selectedIds.has(c.id)));
        setSelectedIds(new Set());
        toast(`Deleted ${ids.length} channels`, 'success');
      } else if (action === 'enable') {
        setChannels(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, enabled: 1 } : c));
      } else if (action === 'disable') {
        setChannels(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, enabled: 0 } : c));
      } else if (action === 'set_group') {
        setChannels(prev => prev.map(c => selectedIds.has(c.id) ? { ...c, grp: value } : c));
        setSelectedIds(new Set());
      }
    } catch (e) { toast(e.message, 'error'); }
  }, [id, selectedIds]);

  // Toggle all channels in a group
  const toggleGroup = useCallback(async (grp, enable) => {
    const ids = channels.filter(c => c.grp === grp).map(c => c.id);
    if (!ids.length) return;
    try {
      await chApi.bulk({ playlist_id: id, ids, action: enable ? 'enable' : 'disable' });
      setChannels(prev => prev.map(c => c.grp === grp ? { ...c, enabled: enable ? 1 : 0 } : c));
      toast(`${enable ? 'Enabled' : 'Disabled'} ${ids.length} channels in "${grp}"`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }, [id, channels]);

  // Import completed
  const onImported = useCallback(async (count) => {
    toast(`Imported ${count} channels`, 'success');
    setShowImport(false);
    const chs = await chApi.list(id);
    setChannels(chs);
    const pl = await plApi.get(id);
    setPlaylist(pl);
    const playlists = await plApi.list();
    setAllPlaylists(playlists);
  }, [id]);

  // Auto-match EPG
  const [showMatchPicker, setShowMatchPicker] = useState(false);

  const autoMatch = useCallback(async (matchLogos, sourceId) => {
    // If multiple EPG sources and no source specified, show picker
    if (epgSources.length > 1 && sourceId === null) {
      setShowMatchPicker({ matchLogos });
      return;
    }
    try {
      const res = await epgApi.autoMatch({ playlist_id: id, match_logos: matchLogos, source_id: sourceId });
      const parts = [`Matched ${res.matched} channels`];
      if (matchLogos && res.logo_matched) parts.push(`${res.logo_matched} logos`);
      if (res.unmatched) parts.push(`${res.unmatched} unmatched`);
      toast(parts.join(' · '), res.unmatched > 0 ? 'info' : 'success');
      const chs = await chApi.list(id);
      setChannels(chs);
    } catch (e) { toast(e.message, 'error'); }
  }, [id, epgSources]);

  // EPG source added/removed — reload channels list
  const onEpgSourceChange = useCallback(async () => {
    const sources = await epgApi.list();
    setEpgSources(sources);
    const loaded = sources.filter(s => s.channel_count > 0);
    const results = await Promise.all(loaded.map(s => epgApi.channels(s.id)));
    setAllEpgCh(results.flat());
  }, []);

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>;

  const enabledCount = channels.filter(c => c.enabled).length;

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <EditorHeader
        playlist={playlist}
        channelCount={channels.length}
        enabledCount={enabledCount}
        onImport={() => setShowImport(true)}
        onEPG={() => setShowEPG(true)}
        onServe={() => setShowServe(true)}
        onBack={() => nav('/')}
      />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <GroupSidebar
          groups={groups}
          total={channels.length}
          active={activeGroup}
          onSelect={setActiveGroup}
          onToggleGroup={toggleGroup}
          channels={channels}
        />

        <ChannelTable
          channels={filtered}
          allChannels={channels}
          selectedIds={selectedIds}
          editingId={editingId}
          search={search}
          onSearch={setSearch}
          onSelect={setSelectedIds}
          onEdit={setEditingId}
          onReorder={reorder}
          onBulkAction={bulkAction}
          onAutoMatch={autoMatch}
          hasEpg={allEpgCh.length > 0}
        />

        {editingChannel && (
          <ChannelPanel
            channel={editingChannel}
            epgChannels={allEpgCh}
            epgSources={epgSources}
            onUpdate={(updates) => updateChannel(editingChannel.id, updates)}
            onDelete={() => deleteChannel(editingChannel.id)}
            onClose={() => setEditingId(null)}
          />
        )}
      </div>

      {showImport && (
        <ImportModal
          playlistId={id}
          playlistName={playlist?.name}
          allPlaylists={allPlaylists}
          onClose={() => setShowImport(false)}
          onDone={onImported}
        />
      )}

      {showEPG && (
        <EPGPanel
          sources={epgSources}
          onClose={() => setShowEPG(false)}
          onChange={onEpgSourceChange}
        />
      )}

      {showServe && playlist && (
        <ServeModal playlist={playlist} onClose={() => setShowServe(false)} />
      )}
      {/* Match EPG source picker */}
      {showMatchPicker && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Choose EPG source to match from</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowMatchPicker(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted">Which EPG source should be used for matching? This helps when you have multiple sources and want to prioritise a specific one.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                  onClick={() => { autoMatch(showMatchPicker.matchLogos, undefined); setShowMatchPicker(false); }}>
                  All sources (use best match)
                </button>
                {epgSources.map(s => (
                  <button key={s.id} className="btn btn-sm" style={{ justifyContent: 'flex-start' }}
                    onClick={() => { autoMatch(showMatchPicker.matchLogos, s.id); setShowMatchPicker(false); }}>
                    {s.name}
                    {s.channel_count > 0 && <span className="text-faint" style={{ marginLeft: 6 }}>({s.channel_count} channels)</span>}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
