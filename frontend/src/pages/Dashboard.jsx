import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, List, Trash2, ExternalLink, LogOut, Settings, Tv, Shield, Pencil, RefreshCw, Clock, Copy, Filter } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { playlists as api, playlists_extra } from '../api.js';
import { useAuth, useToast } from '../context.jsx';

const INTERVALS = [
  { label: 'Every 6 hours',  value: 6   },
  { label: 'Every 12 hours', value: 12  },
  { label: 'Every 24 hours', value: 24  },
  { label: 'Every 2 days',   value: 48  },
  { label: 'Every week',     value: 168 },
];

export default function Dashboard() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nav   = useNavigate();

  const [lists,      setLists]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [creating,   setCreating]   = useState(false);
  const [newName,    setNewName]    = useState('');
  const [editing,    setEditing]    = useState(null);
  const [cloning,    setCloning]    = useState(null); // playlist to clone from
  const [refreshing, setRefreshing] = useState({});

  useEffect(() => {
    api.list()
      .then(setLists)
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      const pl = await api.create({ name: newName.trim() });
      setLists(l => [pl, ...l]);
      setNewName(''); setCreating(false);
      nav(`/edit/${pl.id}`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (id, name) => {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.remove(id);
      setLists(l => l.filter(p => p.id !== id));
      toast('Playlist deleted', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const saveEdit = async (updated) => {
    try {
      const pl = await api.update(updated.id, updated);
      setLists(l => l.map(p => p.id === pl.id ? { ...p, ...pl } : p));
      setEditing(null);
      toast('Playlist updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const manualRefresh = async (pl) => {
    setRefreshing(r => ({ ...r, [pl.id]: true }));
    try {
      const res = await api.refresh(pl.id);
      setLists(l => l.map(p => p.id === pl.id ? { ...p, channel_count: res.channel_count, last_refreshed: res.last_refreshed } : p));
      toast(`Refreshed — ${res.channel_count} channels`, 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setRefreshing(r => ({ ...r, [pl.id]: false })); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="flex gap-2" style={{ flex: 1 }}>
          <Tv size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>Station<span style={{ color: 'var(--accent)' }}>arr</span></span>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          {user?.is_admin && <button className="btn btn-ghost btn-sm" onClick={() => nav('/admin')}><Shield size={14}/> Admin</button>}
          <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')}><Settings size={14}/> Settings</button>
          <HeaderButtons />
          <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14}/> Sign out</button>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 800, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <div className="flex" style={{ marginBottom: 24 }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 20, fontWeight: 600 }}>My playlists</h1>
            <p className="text-muted text-sm" style={{ marginTop: 3 }}>Welcome back, {user?.username}</p>
          </div>
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={14}/> New playlist
          </button>
        </div>

        {/* New empty playlist */}
        {creating && (
          <div className="card" style={{ marginBottom: 16 }}>
            <p className="text-sm text-muted" style={{ marginBottom: 10 }}>Create a new empty playlist, then import channels from it.</p>
            <form onSubmit={create} style={{ display: 'flex', gap: 10 }}>
              <input className="input" value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Playlist name…" autoFocus style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary">Create</button>
              <button type="button" className="btn" onClick={() => setCreating(false)}>Cancel</button>
            </form>
          </div>
        )}

        {loading ? (
          <p className="text-muted">Loading…</p>
        ) : lists.length === 0 ? (
          <div className="empty-state">
            <List size={40} />
            <p>No playlists yet</p>
            <p className="text-sm text-faint">Create a playlist and import channels from your IPTV provider</p>
            <button className="btn btn-primary" onClick={() => setCreating(true)}><Plus size={14}/> Create first playlist</button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {lists.map(pl => (
              <div key={pl.id} className="card" style={{ padding: '14px 16px' }}>
                {/* Main row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer' }} onClick={() => nav(`/edit/${pl.id}`)}>
                  <div style={{ width: 36, height: 36, background: 'var(--surface2)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <List size={16} color="var(--accent)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex gap-2">
                      <p style={{ fontWeight: 500 }} className="truncate">{pl.name}</p>
                      {pl.auto_refresh && <span className="badge badge-green" style={{ fontSize: 10 }}><Clock size={9}/> Auto</span>}
                    </div>
                    <p className="text-muted text-xs" style={{ marginTop: 2 }}>
                      {pl.channel_count ?? 0} channels
                      {pl.source_type === 'xtream' && pl.source_server
                        ? ` · ${pl.source_server.replace(/https?:\/\//, '')}`
                        : pl.source_url ? ' · has source' : ' · no source'}
                      {pl.last_refreshed ? ` · synced ${timeAgo(pl.last_refreshed)}` : ''}
                    </p>
                  </div>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {pl.source_url && (
                      <button className="btn btn-ghost btn-sm btn-icon" title="Refresh now"
                        disabled={refreshing[pl.id]} onClick={() => manualRefresh(pl)}>
                        <RefreshCw size={13} style={{ animation: refreshing[pl.id] ? 'spin 1s linear infinite' : 'none' }} />
                      </button>
                    )}
                    <button className="btn btn-ghost btn-sm btn-icon" title="Edit settings" onClick={() => setEditing({ ...pl })}>
                      <Pencil size={13} />
                    </button>
                    <a href={`/api/serve/${pl.slug}/playlist.m3u`} target="_blank" rel="noreferrer"
                      className="btn btn-ghost btn-sm btn-icon" title="Open M3U URL">
                      <ExternalLink size={13}/>
                    </a>
                    <button className="btn btn-ghost btn-sm btn-icon btn-danger" title="Delete" onClick={() => remove(pl.id, pl.name)}>
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>

                {/* Clone/filter actions */}
                <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border2)' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Create a copy of this playlist"
                    onClick={() => setCloning({ id: pl.id, name: pl.name, mode: 'copy' })}
                  >
                    <Copy size={12}/> Duplicate
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    title="Create a new playlist using only specific groups from this one"
                    onClick={() => setCloning({ id: pl.id, name: pl.name, mode: 'filter' })}
                  >
                    <Filter size={12}/> Create filtered copy
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* Edit modal */}
      {editing && <EditModal playlist={editing} onSave={saveEdit} onClose={() => setEditing(null)} />}

      {/* Clone modal */}
      {cloning && (
        <CloneModal
          source={cloning}
          allPlaylists={lists}
          onClose={() => setCloning(null)}
          onDone={(pl) => {
            setLists(l => [pl, ...l]);
            setCloning(null);
            toast(`Created "${pl.name}"`, 'success');
            nav(`/edit/${pl.id}`);
          }}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Edit modal ────────────────────────────────────────────────────
function EditModal({ playlist, onSave, onClose }) {
  const [form, setForm] = useState({
    name:             playlist.name             || '',
    source_type:      playlist.source_type      || 'url',
    source_server:    playlist.source_server    || '',
    source_username:  playlist.source_username  || '',
    source_password:  playlist.source_password  || '',
    source_url:       playlist.source_url       || '',
    auto_refresh:     !!playlist.auto_refresh,
    refresh_interval: playlist.refresh_interval || 24,
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <h2>Edit playlist</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <form onSubmit={e => { e.preventDefault(); onSave({ id: playlist.id, ...form }); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Name</label>
              <input className="input" value={form.name} onChange={set('name')} required autoFocus />
            </div>

            <div>
              <label style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 500, display: 'block', marginBottom: 6 }}>Source type</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {[['url','Direct URL'],['xtream','Provider login']].map(([val, label]) => (
                  <button key={val} type="button"
                    className={`btn btn-sm ${form.source_type === val ? 'btn-primary' : ''}`}
                    onClick={() => setForm(f => ({ ...f, source_type: val }))}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {form.source_type === 'xtream' ? (
              <>
                <div className="field">
                  <label>Server address</label>
                  <input className="input" value={form.source_server} onChange={set('source_server')} placeholder="http://provider.com:8080" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <div className="field"><label>Username</label>
                    <input className="input" value={form.source_username} onChange={set('source_username')} />
                  </div>
                  <div className="field"><label>Password</label>
                    <input className="input" type="password" value={form.source_password} onChange={set('source_password')} />
                  </div>
                </div>
              </>
            ) : (
              <div className="field">
                <label>M3U URL</label>
                <input className="input" value={form.source_url} onChange={set('source_url')} placeholder="http://provider.com/playlist.m3u" />
              </div>
            )}

            <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 13 }}>
                <input type="checkbox" checked={form.auto_refresh} onChange={set('auto_refresh')} />
                <div>
                  <span style={{ fontWeight: 500 }}>Auto-refresh channels</span>
                  <span className="text-muted" style={{ marginLeft: 6, fontSize: 12 }}>re-import on a schedule</span>
                </div>
              </label>
              {form.auto_refresh && (
                <div className="field">
                  <label>Refresh interval</label>
                  <select className="input" value={form.refresh_interval} onChange={set('refresh_interval')}>
                    {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary">Save changes</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

// ── Clone/filter modal ────────────────────────────────────────────
function CloneModal({ source, allPlaylists, onClose, onDone }) {
  const toast = useToast();
  const srcPl = allPlaylists.find(p => p.id === source.id);

  const [name,        setName]        = useState(`${source.name} (copy)`);
  const [keyword,     setKeyword]     = useState('');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [loading,     setLoading]     = useState(false);

  // We'd need the groups from the playlist - show a note if not available
  const isFilter = source.mode === 'filter';

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await playlists_extra.clone(source.id, {
        name:         name.trim(),
        keyword:      keyword.trim() || undefined,
        enabled_only: enabledOnly,
      });
      onDone(res.playlist);
    } catch (err) { toast(err.message, 'error'); }
    finally { setLoading(false); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <h2>{isFilter ? 'Create filtered copy' : 'Duplicate playlist'}</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted">
            {isFilter
              ? `Creates a new playlist with a subset of channels from "${source.name}". The new playlist shares the same source URL so it can auto-refresh independently.`
              : `Creates an identical copy of "${source.name}" with all its channels and source settings.`
            }
          </p>

          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div className="field">
              <label>New playlist name</label>
              <input className="input" value={name} onChange={e => setName(e.target.value)} required autoFocus />
            </div>

            {isFilter && (
              <>
                <div className="field">
                  <label>Filter by keyword <span className="text-faint">(channel name, group name)</span></label>
                  <input className="input" value={keyword} onChange={e => setKeyword(e.target.value)}
                    placeholder="e.g. Sports, News, BBC…" />
                  <span className="text-xs text-faint">Leave blank to include all channels. You can filter by group after opening the editor.</span>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={enabledOnly} onChange={e => setEnabledOnly(e.target.checked)} />
                  Only include currently enabled channels
                </label>
              </>
            )}

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>What gets copied</strong>
              Channels (filtered if keyword set) · Source URL & credentials · Xtream credentials (new, unique) · Channel order
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="btn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Creating…' : isFilter ? 'Create filtered copy' : 'Duplicate'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso + 'Z').getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
