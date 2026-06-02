import { useState, useRef } from 'react';
import { Upload, Link, Tv, Filter } from 'lucide-react';
import { playlists as api, playlists_extra } from '../api.js';
import { useToast } from '../context.jsx';

const MODES = [
  { key: 'provider', label: 'Provider login', icon: Tv },
  { key: 'url',      label: 'M3U URL',        icon: Link },
  { key: 'file',     label: 'Upload file',    icon: Upload },
  { key: 'clone',    label: 'From existing playlist', icon: Filter },
];

export default function ImportModal({ playlistId, playlistName, allPlaylists = [], onClose, onDone }) {
  const toast   = useToast();
  const fileRef = useRef();
  const [mode, setMode]       = useState('provider');
  const [loading, setLoading] = useState(false);

  // Provider fields
  const [server,   setServer]   = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  // URL
  const [url, setUrl] = useState('');

  // Clone fields
  const [cloneSrc,  setCloneSrc]  = useState('');
  const [cloneGroups, setCloneGroups] = useState([]);
  const [cloneKw,   setCloneKw]   = useState('');
  const [cloneEnabledOnly, setCloneEnabledOnly] = useState(false);
  const [cloneName, setCloneName] = useState('');
  const [cloneAsNew, setCloneAsNew] = useState(true);

  // Available groups from selected source playlist
  const srcPlaylist = allPlaylists.find(p => String(p.id) === String(cloneSrc));
  const srcGroups   = srcPlaylist?._groups || [];

  const doImport = async (body) => {
    setLoading(true);
    try {
      const res = await api.import(playlistId, body);
      onDone(res.imported);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const submitProvider = (e) => {
    e.preventDefault();
    if (!server || !username) return toast('Server and username are required', 'error');
    doImport({ source_type: 'xtream', source_server: server.trim(), source_username: username.trim(), source_password: password.trim() });
  };

  const submitUrl = (e) => {
    e.preventDefault();
    if (!url.trim()) return;
    doImport({ source_type: 'url', url: url.trim() });
  };

  const handleFile = (file) => {
    const reader = new FileReader();
    reader.onload = e => doImport({ content: e.target.result });
    reader.readAsText(file);
  };

  const submitClone = async (e) => {
    e.preventDefault();
    if (!cloneSrc) return toast('Select a source playlist', 'error');
    setLoading(true);
    try {
      if (cloneAsNew) {
        const name = cloneName || `${srcPlaylist?.name} (copy)`;
        const res = await playlists_extra.clone(cloneSrc, {
          name, groups: cloneGroups.length ? cloneGroups : undefined,
          keyword: cloneKw || undefined, enabled_only: cloneEnabledOnly,
        });
        toast(`Created "${name}" with ${res.channel_count} channels`, 'success');
        onDone(res.channel_count, res.playlist);
      } else {
        // Import filtered channels into current playlist
        const body = {
          clone_from: cloneSrc,
          groups: cloneGroups.length ? cloneGroups : undefined,
          keyword: cloneKw || undefined,
          enabled_only: cloneEnabledOnly,
        };
        const res = await api.import(playlistId, body);
        onDone(res.imported);
      }
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const toggleGroup = (g) => {
    setCloneGroups(prev => prev.includes(g) ? prev.filter(x => x !== g) : [...prev, g]);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 520 }}>
        <div className="modal-header">
          <h2>Import playlist</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted">
            {mode !== 'clone' && '⚠ Importing replaces all existing channels. Your credentials are saved for auto-refresh.'}
            {mode === 'clone' && 'Create a new playlist or import channels from an existing playlist, optionally filtered by group or keyword.'}
          </p>

          {/* Mode tabs */}
          <div style={{ display: 'flex', gap: 4, background: 'var(--surface2)', borderRadius: 8, padding: 4 }}>
            {MODES.map(m => (
              <button key={m.key} className="btn btn-ghost btn-sm"
                style={{
                  flex: 1, justifyContent: 'center', fontSize: 11,
                  background: mode === m.key ? 'var(--surface)' : 'transparent',
                  border: mode === m.key ? '1px solid var(--border)' : '1px solid transparent',
                  color: mode === m.key ? 'var(--text)' : 'var(--muted)',
                }}
                onClick={() => setMode(m.key)}>
                <m.icon size={12} /> {m.label}
              </button>
            ))}
          </div>

          {/* Provider login */}
          {mode === 'provider' && (
            <form onSubmit={submitProvider} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Server address</label>
                <input className="input" value={server} onChange={e => setServer(e.target.value)}
                  placeholder="http://provider.com:8080" autoFocus required />
                <span className="text-xs text-faint">Base URL of your IPTV provider — no path needed</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Username</label>
                  <input className="input" value={username} onChange={e => setUsername(e.target.value)} required />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} />
                </div>
              </div>
              <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: 'var(--muted)', wordBreak: 'break-all' }}>
                {server ? `${server.replace(/\/$/, '')}/player_api.php?username=${username || '…'}&password=***` : 'Enter server above to see URL preview'}
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center' }}>
                {loading ? 'Importing…' : 'Connect & import'}
              </button>
            </form>
          )}

          {/* URL */}
          {mode === 'url' && (
            <form onSubmit={submitUrl} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>M3U URL</label>
                <input className="input" value={url} onChange={e => setUrl(e.target.value)}
                  placeholder="http://provider.com/get.php?username=…&password=…" autoFocus />
                <span className="text-xs text-faint">Fetched server-side — no CORS issues</span>
              </div>
              <button type="submit" className="btn btn-primary" disabled={loading || !url.trim()} style={{ justifyContent: 'center' }}>
                {loading ? 'Importing…' : 'Import from URL'}
              </button>
            </form>
          )}

          {/* File */}
          {mode === 'file' && (
            <div
              onDrop={e => { e.preventDefault(); e.dataTransfer.files[0] && handleFile(e.dataTransfer.files[0]); }}
              onDragOver={e => e.preventDefault()}
              onClick={() => fileRef.current.click()}
              style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '40px 16px', textAlign: 'center', cursor: 'pointer', color: 'var(--muted)' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
            >
              <Upload size={28} style={{ marginBottom: 12, opacity: 0.4 }} />
              <p style={{ fontSize: 14 }}>Click or drag & drop your .m3u / .m3u8 file</p>
              <input ref={fileRef} type="file" accept=".m3u,.m3u8,.txt" style={{ display: 'none' }}
                onChange={e => e.target.files[0] && handleFile(e.target.files[0])} />
            </div>
          )}

          {/* Clone */}
          {mode === 'clone' && (
            <form onSubmit={submitClone} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Source playlist</label>
                <select className="input" value={cloneSrc} onChange={e => { setCloneSrc(e.target.value); setCloneGroups([]); }} required>
                  <option value="">Select a playlist…</option>
                  {allPlaylists.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.channel_count ?? '?'} channels)</option>
                  ))}
                </select>
              </div>

              {srcPlaylist && srcGroups.length > 0 && (
                <div className="field">
                  <label>Filter by groups <span className="text-faint">(leave blank to include all)</span></label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                    {srcGroups.map(g => (
                      <button key={g} type="button"
                        className={`btn btn-sm ${cloneGroups.includes(g) ? 'btn-primary' : ''}`}
                        style={{ fontSize: 12 }}
                        onClick={() => toggleGroup(g)}>
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="field">
                <label>Filter by keyword <span className="text-faint">(channel name / group)</span></label>
                <input className="input" value={cloneKw} onChange={e => setCloneKw(e.target.value)} placeholder="e.g. Sports, BBC, CNN…" />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input type="checkbox" checked={cloneEnabledOnly} onChange={e => setCloneEnabledOnly(e.target.checked)} />
                Only include enabled channels
              </label>

              <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" checked={cloneAsNew} onChange={() => setCloneAsNew(true)} />
                  <div>
                    <span style={{ fontWeight: 500 }}>Create as new playlist</span>
                    <span className="text-muted" style={{ marginLeft: 6, fontSize: 12 }}>separate from this one</span>
                  </div>
                </label>
                {cloneAsNew && (
                  <div className="field" style={{ marginLeft: 22 }}>
                    <label>New playlist name</label>
                    <input className="input" value={cloneName} onChange={e => setCloneName(e.target.value)}
                      placeholder={srcPlaylist ? `${srcPlaylist.name} (copy)` : 'New playlist name'} />
                  </div>
                )}
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="radio" checked={!cloneAsNew} onChange={() => setCloneAsNew(false)} />
                  <div>
                    <span style={{ fontWeight: 500 }}>Import into current playlist</span>
                    <span className="text-muted" style={{ marginLeft: 6, fontSize: 12 }}>replaces existing channels</span>
                  </div>
                </label>
              </div>

              <button type="submit" className="btn btn-primary" disabled={loading || !cloneSrc} style={{ justifyContent: 'center' }}>
                {loading ? 'Working…' : cloneAsNew ? 'Create filtered playlist' : 'Import filtered channels'}
              </button>
            </form>
          )}

          {loading && <p className="text-sm text-muted" style={{ textAlign: 'center' }}>Processing… this may take a moment</p>}
        </div>
      </div>
    </div>
  );
}
