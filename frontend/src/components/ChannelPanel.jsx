import React, { useState, useEffect } from 'react';
import { X, Trash2, Tv, Clock, Calendar, Check } from 'lucide-react';
import { epg as epgApi } from '../api.js';
import LogoBrowser from './LogoBrowser.jsx';

export default function ChannelPanel({ channel, epgChannels, epgSources = [], onUpdate, onDelete, onClose }) {
  const [form,            setForm]           = useState({ ...channel });
  const [saving,          setSaving]         = useState(false);
  const [saved,           setSaved]          = useState(false);
  const [tab,             setTab]            = useState('edit');
  const [progs,           setProgs]          = useState(null);
  const [loadingProgs,    setLoadingProgs]   = useState(false);
  const [tsPreview,       setTsPreview]      = useState(channel.timeshift || 0);
  const [showLogoBrowser, setShowLogoBrowser]= useState(false);

  useEffect(() => {
    setForm({ ...channel });
    setProgs(null);
    setTab('edit');
    setTsPreview(channel.timeshift || 0);
    setSaved(false);
  }, [channel.id]);

  const set = (k) => (e) => { setForm(f => ({ ...f, [k]: e.target.value })); setSaved(false); };

  const save = async (overrides = {}) => {
    setSaving(true);
    await onUpdate({ ...form, timeshift: tsPreview, ...overrides });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  // Auto-save when logo is selected from browser
  const handleLogoSelect = async (url) => {
    setForm(f => ({ ...f, tvg_logo: url }));
    setShowLogoBrowser(false);
    // Save immediately so the channel table updates
    setSaving(true);
    await onUpdate({ ...form, tvg_logo: url, timeshift: tsPreview });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  const loadProgs = async () => {
    if (!form.epg_id) return;
    setLoadingProgs(true);
    try {
      const data = await epgApi.programmes(form.epg_id);
      setProgs(data);
    } catch { setProgs([]); }
    finally { setLoadingProgs(false); }
  };

  // Reload programmes when tab opens OR when epg_id changes
  useEffect(() => {
    if (tab === 'epg' && form.epg_id) {
      setProgs(null);
      loadProgs();
    }
    if (tab === 'epg' && !form.epg_id) {
      setProgs(null);
    }
  }, [tab, form.epg_id]);

  const fields = [
    { key: 'name',     label: 'Display name' },
    { key: 'tvg_name', label: 'TVG name' },
    { key: 'grp',      label: 'Group' },
    { key: 'tvg_logo', label: 'Logo URL' },
    { key: 'tvg_id',   label: 'TVG ID' },
  ];

  return (
    <div style={{ width: 290, flexShrink: 0, borderLeft: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }} className="truncate">{form.name}</span>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
        {[['edit','Details'],['epg','EPG / Timeshift']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '8px 0', fontSize: 12, fontWeight: 500, border: 'none',
            background: tab === key ? 'var(--surface2)' : 'transparent',
            color: tab === key ? 'var(--text)' : 'var(--muted)',
            borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            cursor: 'pointer',
          }}>{label}</button>
        ))}
      </div>

      {/* ── Details tab ── */}
      {tab === 'edit' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: 14, display: 'flex', flexDirection: 'column', gap: 11 }}>

          {/* Logo preview */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '4px 0' }}>
            <div style={{ width: 110, height: 48, background: 'var(--surface2)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', padding: 4 }}>
              {form.tvg_logo
                ? <img src={form.tvg_logo} alt="" key={form.tvg_logo}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    onError={e => e.target.style.display='none'} />
                : <Tv size={16} color="var(--faint)" />
              }
            </div>
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => setShowLogoBrowser(true)}>
              Find logo…
            </button>
          </div>

          {fields.map(({ key, label }) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input className="input" value={form[key] || ''} onChange={set(key)} />
            </div>
          ))}

          <div className="field">
            <label>EPG channel <span className="text-faint text-xs">(primary)</span></label>
            <EPGPicker
              epgChannels={epgChannels}
              epgSources={epgSources}
              value={form.epg_id || ''}
              onChange={(val) => { setForm(f => ({ ...f, epg_id: val })); setSaved(false); }}
            />
          </div>

          <div className="field">
            <label>
              Backup EPG channel
              <span className="text-faint text-xs" style={{ marginLeft: 6 }}>used if primary has no data</span>
            </label>
            <EPGPicker
              epgChannels={epgChannels}
              epgSources={epgSources}
              value={form.backup_epg_id || ''}
              onChange={(val) => { setForm(f => ({ ...f, backup_epg_id: val })); setSaved(false); }}
              placeholder="Optional backup…"
            />
          </div>

          <div className="field">
            <label>Stream URL</label>
            <textarea className="input" value={form.url || ''} onChange={set('url')} rows={2}
              style={{ resize: 'vertical', fontFamily: 'monospace', fontSize: 11 }} />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={!!form.enabled}
              onChange={e => { setForm(f => ({ ...f, enabled: e.target.checked ? 1 : 0 })); setSaved(false); }} />
            Enabled
          </label>

          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            <button className="btn btn-sm" style={{ flex: 1, justifyContent: 'center', background: saved ? 'var(--green-bg)' : '', color: saved ? 'var(--green)' : '' }}
              onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : saved ? <><Check size={12}/> Saved</> : 'Save changes'}
            </button>
            <button className="btn btn-sm btn-danger btn-icon" title="Delete" onClick={onDelete}>
              <Trash2 size={13} />
            </button>
          </div>
        </div>
      )}

      {/* ── EPG / Timeshift tab ── */}
      {tab === 'epg' && (
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Clock size={12} color="var(--accent)" />
              <span style={{ fontSize: 12, fontWeight: 600 }}>Timeshift</span>
              <span className="text-faint text-xs">minutes</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <input type="range" min={-240} max={240} step={30}
                value={tsPreview} onChange={e => setTsPreview(Number(e.target.value))} style={{ flex: 1 }} />
              <input type="number" value={tsPreview}
                onChange={e => setTsPreview(Number(e.target.value))}
                style={{ width: 58, padding: '4px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 12, textAlign: 'center' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="text-xs text-muted">
                {tsPreview === 0 ? 'No offset' : `${tsPreview > 0 ? '+' : ''}${tsPreview} min`}
              </span>
              {tsPreview !== 0 && (
                <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '2px 8px' }}
                  onClick={() => setTsPreview(0)}>Reset</button>
              )}
            </div>
            <button className="btn btn-primary btn-sm" style={{ width: '100%', justifyContent: 'center' }}
              onClick={() => save()} disabled={saving}>
              {saving ? 'Saving…' : saved ? <><Check size={12}/> Saved</> : 'Save timeshift'}
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {!form.epg_id ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <Calendar size={24} style={{ opacity: 0.3 }} />
                <p className="text-sm text-faint">No EPG channel mapped</p>
                <p className="text-xs text-faint">Set an EPG channel in the Details tab</p>
              </div>
            ) : loadingProgs ? (
              <p className="text-sm text-muted" style={{ textAlign: 'center', padding: '24px 0' }}>Loading schedule…</p>
            ) : progs && progs.length === 0 ? (
              <div className="empty-state" style={{ padding: '24px 0' }}>
                <Calendar size={24} style={{ opacity: 0.3 }} />
                <p className="text-sm text-faint">No programmes found</p>
                <p className="text-xs text-faint">{form.epg_id}</p>
              </div>
            ) : progs ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <p className="text-xs text-muted" style={{ marginBottom: 2 }}>
                  Next 6 hours · <span style={{ color: 'var(--text)' }}>{form.epg_id}</span>
                  {tsPreview !== 0 && <span className="text-accent"> · {tsPreview > 0 ? '+' : ''}{tsPreview}min</span>}
                </p>
                {progs.map((p, i) => <ProgrammeRow key={i} prog={p} timeshift={tsPreview} />)}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Logo browser modal */}
      {showLogoBrowser && (
        <LogoBrowser
          channelName={form.name}
          currentLogo={form.tvg_logo}
          onSelect={handleLogoSelect}
          onClose={() => setShowLogoBrowser(false)}
        />
      )}
    </div>
  );
}

function ProgrammeRow({ prog, timeshift }) {
  const start = prog.start ? new Date(new Date(prog.start).getTime() + timeshift * 60000) : null;
  const stop  = prog.stop  ? new Date(new Date(prog.stop).getTime()  + timeshift * 60000) : null;
  const now   = new Date();
  const isNow = start && stop && start <= now && stop > now;
  const pct   = isNow ? Math.min(100, Math.floor(((now - start) / (stop - start)) * 100)) : null;

  return (
    <div style={{
      borderRadius: 6, padding: '8px 10px',
      background: isNow ? 'rgba(240,165,0,0.08)' : 'var(--surface2)',
      border: isNow ? '1px solid rgba(240,165,0,0.3)' : '1px solid transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, marginBottom: 2 }}>
        <span style={{ fontSize: 13, fontWeight: isNow ? 600 : 400, flex: 1 }} className="truncate">{prog.title}</span>
        {isNow && <span style={{ fontSize: 10, color: 'var(--accent)', fontWeight: 600, flexShrink: 0 }}>NOW</span>}
      </div>
      {prog.subtitle && <p className="text-xs text-muted truncate" style={{ marginBottom: 2 }}>{prog.subtitle}</p>}
      <p className="text-xs text-faint">
        {start ? fmtTime(start) : '?'} – {stop ? fmtTime(stop) : '?'}
        {prog.category ? ` · ${prog.category}` : ''}
      </p>
      {isNow && pct !== null && (
        <div style={{ height: 3, background: 'var(--surface)', borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${pct}%`, background: 'var(--accent)', borderRadius: 2 }} />
        </div>
      )}
      {prog.desc && (
        <p className="text-xs text-muted" style={{ marginTop: 4, lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {prog.desc}
        </p>
      )}
    </div>
  );
}

function fmtTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ── EPG source-grouped picker ────────────────────────────────────
function EPGPicker({ epgChannels, epgSources, value, onChange, placeholder }) {
  const [search, setSearch] = React.useState('');
  const [sourceFilter, setSourceFilter] = React.useState('all');

  // Build sourceMap: source_id (number) → name
  // Use both passed epgSources and infer from channel data
  const sourceMap = {};
  epgSources.forEach(s => { sourceMap[Number(s.id)] = s.name; });

  // Find unique source IDs actually present in channels
  const presentSourceIds = [...new Set(epgChannels.map(ch => Number(ch.source_id)))].filter(Boolean);
  // Fill in any missing source names
  presentSourceIds.forEach(sid => {
    if (!sourceMap[sid]) sourceMap[sid] = `EPG Source ${sid}`;
  });

  const hasMultipleSources = presentSourceIds.length > 1;

  // Count per source
  const countBySource = {};
  epgChannels.forEach(ch => {
    const sid = Number(ch.source_id);
    countBySource[sid] = (countBySource[sid] || 0) + 1;
  });

  const filtered = epgChannels.filter(ch => {
    if (sourceFilter !== 'all' && Number(ch.source_id) !== Number(sourceFilter)) return false;
    if (search) {
      const q = search.toLowerCase();
      return ch.name.toLowerCase().includes(q) || (ch.tvg_id || '').toLowerCase().includes(q);
    }
    return true;
  });

  const currentChannel = epgChannels.find(c => c.tvg_id === value);
  const currentSource  = currentChannel ? (sourceMap[Number(currentChannel.source_id)] || 'Unknown') : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* Current value display */}
      {value && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface2)', borderRadius: 6, padding: '4px 8px' }}>
          <span className="text-xs" style={{ flex: 1, color: 'var(--green)' }}>✓ {value}</span>
          {currentSource && <span className="text-xs text-faint">{currentSource}</span>}
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 10, padding: '1px 6px' }}
            onClick={() => onChange('')}>Clear</button>
        </div>
      )}

      {/* Source filter — always show if multiple sources */}
      {hasMultipleSources && (
        <select className="input" value={sourceFilter}
          onChange={e => setSourceFilter(e.target.value)}
          style={{ fontSize: 12 }}>
          <option value="all">All sources ({epgChannels.length} channels)</option>
          {presentSourceIds.map(sid => (
            <option key={sid} value={sid}>{sourceMap[sid]} ({countBySource[sid] || 0})</option>
          ))}
        </select>
      )}

      {/* Search */}
      <input className="input" value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder={placeholder || (epgChannels.length > 0 ? `Search ${epgChannels.length} EPG channels…` : 'No EPG data — fetch an EPG source first')}
        style={{ fontSize: 12 }} />

      {/* Channel list */}
      <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6, background: 'var(--bg)' }}>
        <button
          onClick={() => onChange('')}
          style={{
            display: 'block', width: '100%', textAlign: 'left',
            padding: '5px 10px', fontSize: 12, border: 'none', borderBottom: '1px solid var(--border2)',
            background: !value ? 'var(--surface2)' : 'transparent',
            color: 'var(--faint)', cursor: 'pointer',
          }}>
          — Not mapped —
        </button>
        {filtered.slice(0, 150).map((ch, i) => {
          const srcName = sourceMap[Number(ch.source_id)];
          const isSelected = ch.tvg_id === value;
          return (
            <button key={i}
              onClick={() => onChange(ch.tvg_id)}
              style={{
                display: 'flex', alignItems: 'center', width: '100%', textAlign: 'left',
                padding: '5px 10px', fontSize: 12, border: 'none', gap: 6,
                borderBottom: '1px solid var(--border2)',
                background: isSelected ? 'rgba(88,166,255,0.12)' : 'transparent',
                color: isSelected ? 'var(--blue)' : 'var(--text)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface2)'; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
            >
              <span style={{ fontWeight: isSelected ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</span>
              <span style={{ color: 'var(--faint)', fontSize: 10, flexShrink: 0 }}>{ch.tvg_id}</span>
              {hasMultipleSources && srcName && (
                <span style={{ fontSize: 10, color: 'var(--accent)', flexShrink: 0, marginLeft: 4 }}>{srcName.split(' ')[0]}</span>
              )}
            </button>
          );
        })}
        {filtered.length > 150 && (
          <p style={{ padding: '6px 10px', fontSize: 11, color: 'var(--faint)' }}>
            Showing 150 of {filtered.length} — type to filter
          </p>
        )}
        {filtered.length === 0 && search && (
          <p style={{ padding: '10px', fontSize: 12, color: 'var(--faint)' }}>No channels match "{search}"</p>
        )}
      </div>
    </div>
  );
}
