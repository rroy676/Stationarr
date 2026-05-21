import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { playlists as plApi, channels as chApi, epg as epgApi } from '../api.js';
import { useToast } from '../context.jsx';
import EditorHeader from '../components/EditorHeader.jsx';
import GroupSidebar from '../components/GroupSidebar.jsx';
import ChannelTable from '../components/ChannelTable.jsx';
import ChannelPanel from '../components/ChannelPanel.jsx';
import ImportModal from '../components/ImportModal.jsx';
import EPGPanel from '../components/EPGPanel.jsx';
import ServeModal from '../components/ServeModal.jsx';

const DEFAULT_PAGE_SIZE = 50;

export default function Editor() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [playlist, setPlaylist] = useState(null);
  const [allPlaylists, setAllPlaylists] = useState([]);
  const [channels, setChannels] = useState([]);
  const [channelMeta, setChannelMeta] = useState({ total: 0, summary: { total: 0, enabled: 0 }, groups: [] });
  const [epgSources, setEpgSources] = useState([]);
  const [allEpgCh, setAllEpgCh] = useState([]);
  const [loading, setLoading] = useState(true);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [activeGroup, setActiveGroup] = useState('__all__');
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [showEPG, setShowEPG] = useState(false);
  const [showServe, setShowServe] = useState(false);
  const [enabledFilter, setEnabledFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const loadChannels = useCallback(async ({ resetPage = false } = {}) => {
    const targetPage = resetPage ? 1 : page;
    setChannelsLoading(true);
    try {
      const res = await chApi.list(id, {
        page: targetPage,
        page_size: pageSize,
        q: search,
        group: activeGroup,
        enabled: enabledFilter === 'all' ? undefined : enabledFilter === 'enabled' ? 1 : 0,
      });
      setChannels(res.items || []);
      setChannelMeta({ total: res.total || 0, summary: res.summary || { total: 0, enabled: 0 }, groups: res.groups || [] });
      setPage(res.page || targetPage);
      setSelectedIds(new Set());
    } catch (e) { toast(e.message, 'error'); }
    finally { setChannelsLoading(false); }
  }, [id, page, pageSize, search, activeGroup, enabledFilter]);

  useEffect(() => {
    Promise.all([plApi.get(id), epgApi.list(), plApi.list()]).then(async ([pl, sources, playlists]) => {
      setPlaylist(pl); setAllPlaylists(playlists); setEpgSources(sources);
      await loadChannels({ resetPage: true });
      const loaded = sources.filter(s => s.channel_count > 0);
      const results = await Promise.all(loaded.map(s => epgApi.channels(s.id)));
      setAllEpgCh(results.flat());
    }).catch(e => { toast(e.message, 'error'); nav('/'); }).finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { if (!loading) loadChannels({ resetPage: true }); }, [search, activeGroup, enabledFilter]);
  useEffect(() => { if (!loading) loadChannels(); }, [page]);
  useEffect(() => {
    if (loading) return;
    setSelectedIds(new Set());
    setPage(1);
  }, [pageSize, loading]);
  useEffect(() => {
    if (!loading && page === 1) loadChannels({ resetPage: true });
  }, [pageSize, page, loading, loadChannels]);

  const groups = useMemo(() => Object.fromEntries(channelMeta.groups.map(g => [g.grp, { count: g.count, enabled_count: g.enabled_count }])), [channelMeta]);
  const editingChannel = useMemo(() => channels.find(c => c.id === editingId) ?? null, [channels, editingId]);

  const updateChannel = useCallback(async (channelId, updates) => {
    try { const updated = await chApi.update(channelId, updates); setChannels(prev => prev.map(c => c.id === channelId ? updated : c)); } catch (e) { toast(e.message, 'error'); }
  }, []);
  const deleteChannel = useCallback(async (channelId) => {
    try { await chApi.remove(channelId); await loadChannels(); if (editingId === channelId) setEditingId(null); toast('Channel deleted', 'success'); } catch (e) { toast(e.message, 'error'); }
  }, [editingId, loadChannels]);
  const reorder = useCallback(async (newChannels) => {
    toast('Reorder is disabled while server-side pagination is enabled.', 'error');
  }, [toast]);
  const bulkAction = useCallback(async (action, value) => {
    const ids = [...selectedIds]; if (!ids.length) return;
    try { await chApi.bulk({ playlist_id: id, ids, action, value, selection: 'ids' }); await loadChannels(); toast(`Updated ${ids.length} selected channels`, 'success'); }
    catch (e) { toast(e.message, 'error'); }
  }, [id, selectedIds, loadChannels]);
  const toggleGroup = useCallback(async (grp, enable) => {
    try {
      const res = await chApi.bulk({ playlist_id: id, selection: 'group', group: grp, action: enable ? 'enable' : 'disable' });
      await loadChannels();
      toast(`${enable ? 'Enabled' : 'Disabled'} ${res.affected} channels in "${grp}"`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  }, [id, loadChannels]);

  const onImported = useCallback(async (count) => { toast(`Imported ${count} channels`, 'success'); setShowImport(false); await loadChannels({ resetPage: true }); }, [loadChannels]);
  const [showMatchPicker, setShowMatchPicker] = useState(false);
  const autoMatch = useCallback(async (matchLogos, sourceId) => {
    if (epgSources.length > 1 && sourceId === null) return setShowMatchPicker({ matchLogos });
    try { const res = await epgApi.autoMatch({ playlist_id: id, match_logos: matchLogos, source_id: sourceId }); toast(`Matched ${res.matched} channels`, 'success'); await loadChannels(); } catch (e) { toast(e.message, 'error'); }
  }, [id, epgSources, loadChannels]);
  const onEpgSourceChange = useCallback(async () => {
    const sources = await epgApi.list(); setEpgSources(sources); const loaded = sources.filter(s => s.channel_count > 0); const results = await Promise.all(loaded.map(s => epgApi.channels(s.id))); setAllEpgCh(results.flat());
  }, []);

  if (loading) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>;

  return <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
    <EditorHeader playlist={playlist} channelCount={channelMeta.summary.total} enabledCount={channelMeta.summary.enabled} onImport={() => setShowImport(true)} onEPG={() => setShowEPG(true)} onServe={() => setShowServe(true)} onBack={() => nav('/')} />
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      <GroupSidebar groups={groups} total={channelMeta.summary.total} active={activeGroup} onSelect={setActiveGroup} onToggleGroup={toggleGroup} />
      <ChannelTable channels={channels} allChannels={channels} selectedIds={selectedIds} editingId={editingId} search={search} onSearch={setSearch} onSelect={setSelectedIds} onEdit={setEditingId} onReorder={reorder} onBulkAction={bulkAction} onAutoMatch={autoMatch} hasEpg={allEpgCh.length > 0} serverMode loading={channelsLoading} enabledFilter={enabledFilter} onEnabledFilterChange={setEnabledFilter} page={page} pageSize={PAGE_SIZE} total={channelMeta.total} onPageChange={setPage} />
      {editingChannel && <ChannelPanel channel={editingChannel} epgChannels={allEpgCh} epgSources={epgSources} onUpdate={(updates) => updateChannel(editingChannel.id, updates)} onDelete={() => deleteChannel(editingChannel.id)} onClose={() => setEditingId(null)} />}
    </div>
    {showImport && <ImportModal playlistId={id} playlistName={playlist?.name} allPlaylists={allPlaylists} onClose={() => setShowImport(false)} onDone={onImported} />}
    {showEPG && <EPGPanel sources={epgSources} onClose={() => setShowEPG(false)} onChange={onEpgSourceChange} />}
    {showServe && playlist && <ServeModal playlist={playlist} onClose={() => setShowServe(false)} />}
    {showMatchPicker && <div className="modal-overlay"><div className="modal" style={{ maxWidth: 400 }}><div className="modal-header"><h2>Choose EPG source to match from</h2><button className="btn btn-ghost btn-icon btn-sm" onClick={() => setShowMatchPicker(false)}>✕</button></div><div className="modal-body">{epgSources.map(s => <button key={s.id} className="btn btn-sm" style={{ justifyContent: 'flex-start', marginBottom: 6 }} onClick={() => { autoMatch(showMatchPicker.matchLogos, s.id); setShowMatchPicker(false); }}>{s.name}</button>)}</div></div></div>}
  </div>;
}
