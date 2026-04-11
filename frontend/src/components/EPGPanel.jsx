import { useState, useRef } from 'react';
import { Plus, Trash2, RefreshCw, Upload, HardDrive, X, Pencil, Check, Clock, Globe, GripVertical } from 'lucide-react';
import { epg as api } from '../api.js';
import { useToast } from '../context.jsx';
import IPTVOrgBrowser from './IPTVOrgBrowser.jsx';

const INTERVALS = [
  { label: '6 hours',  value: 6   },
  { label: '12 hours', value: 12  },
  { label: '24 hours', value: 24  },
  { label: '2 days',   value: 48  },
  { label: 'Weekly',   value: 168 },
];

export default function EPGPanel({ sources, onClose, onChange }) {
  const toast    = useToast();
  const [name, setName]         = useState('');
  const [url,  setUrl]          = useState('');
  const [busy, setBusy]         = useState({});
  const [editing, setEditing]   = useState(null);
  const [editForm, setEditForm] = useState({});
  const [showIptvOrg, setShowIptvOrg] = useState(false);
  const [orderedSources, setOrderedSources] = useState(sources);
  const fileRefs  = useRef({});
  const dragItem  = useRef(null);
  const dragOver  = useRef(null);

  // Keep orderedSources in sync when sources prop changes
  if (orderedSources.length !== sources.length || sources.some((s,i) => s.id !== orderedSources[i]?.id)) {
    setOrderedSources(sources);
  }

  const setBusyFor = (id, val) => setBusy(b => ({ ...b, [id]: val }));

  const add = async (e) => {
    e?.preventDefault();
    if (!name.trim()) return;
    try {
      await api.create({ name: name.trim(), url: url.trim() || null });
      setName(''); setUrl('');
      onChange();
    } catch (err) { toast(err.message, 'error'); }
  };

  const addFromIptvOrg = async (src) => {
    try {
      await api.create({ name: src.name, url: src.url });
      setShowIptvOrg(false);
      onChange();
      toast(`Added "${src.name}" — click Fetch to load programme data`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const remove = async (id) => {
    try { await api.remove(id); onChange(); toast('Source removed', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const startEdit = (src) => {
    setEditing(src.id);
    setEditForm({ name: src.name, url: src.url || '', auto_refresh: !!src.auto_refresh, refresh_interval: src.refresh_interval || 24 });
  };

  const saveEdit = async (id) => {
    try {
      await api.update(id, { ...editForm, auto_refresh: editForm.auto_refresh ? 1 : 0 });
      setEditing(null); onChange(); toast('Source updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const clearCache = async (id) => {
    try { await api.clearCache(id); onChange(); toast('Cache cleared', 'success'); }
    catch (err) { toast(err.message, 'error'); }
  };

  const fetchSource = async (id) => {
    setBusyFor(id, 'fetch');
    setProgress(p => ({ ...p, [id]: { phase: 'downloading', percent: null, message: 'Downloading & parsing… this may take a minute for large files' } }));
    try {
      const res = await api.fetch(id);
      toast(`Loaded ${res.loaded} channels · ${formatSize(res.cache_size)} cached`, 'success');
      // Update ordered sources in place so UI refreshes without waiting for parent
      setOrderedSources(prev => prev.map(s => s.id === id
        ? { ...s, channel_count: res.loaded, cache_size: res.cache_size, cache_updated: new Date().toISOString() }
        : s
      ));
      onChange();
    } catch (e) {
      toast(e.message || 'Fetch failed', 'error');
    } finally {
      setBusyFor(id, false);
      setProgress(p => { const n={...p}; delete n[id]; return n; });
    }
  };

  const [progress, setProgress] = useState({});

  const manualRefresh = async (id) => {
    setBusyFor(id, 'refresh');
    try { const res = await api.refresh(id); toast(`Refreshed — ${res.channel_count} channels`, 'success'); onChange(); }
    catch (err) { toast(err.message, 'error'); }
    finally { setBusyFor(id, false); }
  };

  const uploadFile = (file, id) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      setBusyFor(id, 'upload');
      try {
        const res = await api.upload(id, { content: e.target.result });
        toast(`Loaded ${res.loaded} channels · ${formatSize(res.cache_size)} cached`, 'success');
        onChange();
      } catch (err) { toast(err.message, 'error'); }
      finally { setBusyFor(id, false); }
    };
    reader.readAsText(file);
  };

  const setEditField = (k) => (e) => setEditForm(f => ({
    ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value
  }));

  // Drag-to-reorder
  const handleDragStart = (i) => { dragItem.current = i; };
  const handleDragEnter = (i) => { dragOver.current = i; };
  const handleDragEnd   = async () => {
    if (dragItem.current === null || dragOver.current === null || dragItem.current === dragOver.current) {
      dragItem.current = dragOver.current = null; return;
    }
    const next = [...orderedSources];
    const [moved] = next.splice(dragItem.current, 1);
    next.splice(dragOver.current, 0, moved);
    setOrderedSources(next);
    dragItem.current = dragOver.current = null;
    try {
      await api.reorder({ order: next.map(s => s.id) });
      toast('EPG source order saved — higher sources take priority when matching', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 580 }}>
        <div className="modal-header">
          <div>
            <h2>EPG sources</h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>Sources are checked top-to-bottom. Drag ≡ to reorder priority.</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
        </div>
        <div className="modal-body">

          {orderedSources.length === 0 && (
            <div className="empty-state" style={{ padding: '24px 0' }}>
              <p className="text-sm text-faint">No EPG sources yet. Add one below or browse the iptv-org library.</p>
            </div>
          )}

          {orderedSources.map((src, idx) => (
            <div key={src.id}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragEnter={() => handleDragEnter(idx)}
              onDragEnd={handleDragEnd}
              onDragOver={e => e.preventDefault()}
              style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, transition: 'opacity 0.1s' }}
            >
              {editing === src.id ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="field"><label>Name</label>
                    <input className="input" value={editForm.name} onChange={setEditField('name')} autoFocus />
                  </div>
                  <div className="field"><label>XMLTV URL</label>
                    <input className="input" value={editForm.url} onChange={setEditField('url')} placeholder="https://epg.best/us.xml.gz" />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={editForm.auto_refresh} onChange={setEditField('auto_refresh')} />
                    <span style={{ fontWeight: 500 }}>Auto-refresh</span>
                  </label>
                  {editForm.auto_refresh && (
                    <div className="field"><label>Interval</label>
                      <select className="input" value={editForm.refresh_interval} onChange={setEditField('refresh_interval')}>
                        {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-primary btn-sm" onClick={() => saveEdit(src.id)}><Check size={12}/> Save</button>
                    <button className="btn btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <GripVertical size={14} color="var(--faint)" style={{ cursor: 'grab', flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: 'var(--faint)', flexShrink: 0 }}>#{idx + 1}</span>
                    <span style={{ flex: 1, fontWeight: 500, fontSize: 14 }} className="truncate">{src.name}</span>
                    {src.auto_refresh && <span className="badge badge-green"><Clock size={9}/> Auto</span>}
                    <CacheStatus src={src} />
                    <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => startEdit(src)}><Pencil size={12}/></button>
                    <button className="btn btn-ghost btn-icon btn-sm btn-danger" title="Remove" onClick={() => remove(src.id)}><Trash2 size={12}/></button>
                  </div>

                  {src.url && <p className="text-xs text-faint mono truncate" style={{ marginBottom: 6 }}>{src.url}</p>}

                  {progress[src.id] && <ProgressBar data={progress[src.id]} />}

                  {src.cache_updated && !progress[src.id] && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                      <HardDrive size={11} color="var(--green)" />
                      <span className="text-xs text-muted">
                        {src.channel_count} channels · {formatSize(src.cache_size)} · cached {timeAgo(src.cache_updated)}
                      </span>
                      <button className="btn btn-ghost btn-sm" style={{ padding: '2px 6px', fontSize: 11, color: 'var(--faint)' }} onClick={() => clearCache(src.id)}>clear</button>
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {src.url && (
                      <button className="btn btn-sm" disabled={!!busy[src.id]} onClick={() => fetchSource(src.id)}>
                        <RefreshCw size={12} style={{ animation: busy[src.id] === 'fetch' ? 'spin 1s linear infinite' : 'none' }} />
                        {busy[src.id] === 'fetch' ? 'Fetching…' : src.cache_updated ? 'Re-fetch & cache' : 'Fetch & cache URL'}
                      </button>
                    )}
                    {src.url && src.cache_updated && (
                      <button className="btn btn-sm" disabled={!!busy[src.id]} onClick={() => manualRefresh(src.id)}>
                        <RefreshCw size={12} style={{ animation: busy[src.id] === 'refresh' ? 'spin 1s linear infinite' : 'none' }} />
                        {busy[src.id] === 'refresh' ? 'Refreshing…' : 'Refresh now'}
                      </button>
                    )}
                    <button className="btn btn-sm" disabled={!!busy[src.id]} onClick={() => fileRefs.current[src.id]?.click()}>
                      <Upload size={12} /> {busy[src.id] === 'upload' ? 'Uploading…' : 'Upload XMLTV file'}
                    </button>
                    <input ref={el => fileRefs.current[src.id] = el} type="file" accept=".xml,.xmltv,.txt,.gz" style={{ display: 'none' }}
                      onChange={e => e.target.files[0] && uploadFile(e.target.files[0], src.id)} />
                  </div>
                </>
              )}
            </div>
          ))}

          {/* Add source */}
          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <p style={{ fontSize: 13, fontWeight: 600 }}>Add EPG source</p>
              <button className="btn btn-sm" style={{ fontSize: 12 }} onClick={() => setShowIptvOrg(true)}>
                <Globe size={12}/> Browse iptv-org library
              </button>
            </div>
            <form onSubmit={add} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="field">
                <label>Name</label>
                <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My EPG, EPG.best US" required />
              </div>
              <div className="field">
                <label>XMLTV URL <span className="text-faint">(optional — you can also upload a file after adding)</span></label>
                <input className="input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://epg.best/us.xml.gz" />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>
                <Plus size={13}/> Add source
              </button>
            </form>
          </div>

          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>How EPG works</strong>
            After adding a source, click <strong style={{color:'var(--text)'}}>Fetch & cache URL</strong> to download the full programme schedule. Sources are checked in order (#1 first) — the first match for a channel wins. Drag ≡ to change priority.
          </div>
        </div>
      </div>

      {showIptvOrg && <IPTVOrgBrowser onClose={() => setShowIptvOrg(false)} onAdd={addFromIptvOrg} />}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes indeterminate { 0% { transform: translateX(-100%); width: 40%; } 100% { transform: translateX(300%); width: 40%; } }`}</style>
    </div>
  );
}

function ProgressBar({ data }) {
  const pct = data.percent ?? null;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span className="text-xs text-muted">{data.message || 'Working…'}</span>
        {pct !== null && <span className="text-xs text-muted">{pct}%</span>}
      </div>
      <div style={{ height: 4, background: 'var(--surface2)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct !== null ? `${pct}%` : '40%', background: 'var(--accent)', borderRadius: 2, transition: 'width 0.3s ease', animation: pct === null ? 'indeterminate 1.5s ease infinite' : 'none' }} />
      </div>
    </div>
  );
}

function CacheStatus({ src }) {
  if (src.cache_updated) return <span className="badge badge-green"><HardDrive size={9}/> Cached</span>;
  if (src.channel_count > 0) return <span className="badge badge-blue">Indexed</span>;
  if (src.url) return <span className="badge badge-muted">Not fetched</span>;
  return <span className="badge badge-muted">No URL</span>;
}

function formatSize(bytes) {
  if (!bytes) return '0 B';
  if (bytes < 1024)         return `${bytes} B`;
  if (bytes < 1024 * 1024)  return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function labelForInterval(v) {
  return INTERVALS.find(i => Number(i.value) === Number(v))?.label.toLowerCase() || `${v}h`;
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
