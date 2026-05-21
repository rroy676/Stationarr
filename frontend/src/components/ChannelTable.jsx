import { useRef, useState, useCallback } from 'react';

const ROW_H   = 44;  // must match actual row height in px
const OVERSCAN = 10; // extra rows above/below viewport
import { Search, GripVertical, Eye, EyeOff, Edit2, Trash2, RefreshCw, Image, Filter, X } from 'lucide-react';

export default function ChannelTable({
  channels, allChannels, selectedIds, editingId, search,
  onSearch, onSelect, onEdit, onReorder, onBulkAction, onAutoMatch, hasEpg,
  serverMode, loading, enabledFilter, onEnabledFilterChange, page, pageSize, total, onPageChange, onPageSizeChange,
}) {
  const [dragIdx,  setDragIdx]  = useState(null);
  const [overIdx,  setOverIdx]  = useState(null);
  const [bulkGroup, setBulkGroup] = useState('');
  const dragItem        = useRef(null);
  const lastClickedIdx  = useRef(null);
  const scrollContainer = useRef(null);
  const [visibleStart, setVisibleStart] = useState(0);
  const [visibleCount, setVisibleCount] = useState(60); // initial render count

  // Update visible range on scroll
  const onScroll = useCallback((e) => {
    const { scrollTop, clientHeight } = e.currentTarget;
    const start = Math.max(0, Math.floor(scrollTop / ROW_H) - OVERSCAN);
    const count = Math.ceil(clientHeight / ROW_H) + OVERSCAN * 2;
    setVisibleStart(start);
    setVisibleCount(count);
  }, []);
  const [showFilters, setShowFilters] = useState(false);
  const [filterEnabled, setFilterEnabled] = useState('all');   // all | enabled | disabled
  const [filterEpg,     setFilterEpg]     = useState('all');   // all | mapped | unmapped

  // ── Filters must be computed before allSelected references them ──
  const effectiveEnabled = serverMode ? enabledFilter : filterEnabled;
  const displayChannels = channels.filter(ch => {
    if (effectiveEnabled === 'enabled'  && !ch.enabled)  return false;
    if (effectiveEnabled === 'disabled' && ch.enabled)   return false;
    if (filterEpg     === 'mapped'   && !ch.epg_id)   return false;
    if (filterEpg     === 'unmapped' && ch.epg_id)    return false;
    return true;
  });

  const activeFilterCount = (effectiveEnabled !== 'all' ? 1 : 0) + (filterEpg !== 'all' ? 1 : 0);

  const allSelected = displayChannels.length > 0 && displayChannels.every(c => selectedIds.has(c.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) onSelect(new Set());
    else onSelect(new Set(displayChannels.map(c => c.id)));
  };

  const toggleOne = (id) => {
    const next = new Set(selectedIds);
    next.has(id) ? next.delete(id) : next.add(id);
    onSelect(next);
  };

  // Handle row click with Ctrl/Cmd and Shift support
  const handleRowClick = (e, ch, idx) => {
    const isMac  = navigator.platform.toUpperCase().includes('MAC');
    const isCtrl = isMac ? e.metaKey : e.ctrlKey;
    const isShift = e.shiftKey;

    if (isCtrl) {
      // Ctrl/Cmd+click: toggle this one
      e.preventDefault();
      const next = new Set(selectedIds);
      next.has(ch.id) ? next.delete(ch.id) : next.add(ch.id);
      onSelect(next);
      lastClickedIdx.current = idx;
    } else if (isShift && lastClickedIdx.current !== null) {
      // Shift+click: select range
      e.preventDefault();
      const from = Math.min(lastClickedIdx.current, idx);
      const to   = Math.max(lastClickedIdx.current, idx);
      const next = new Set(selectedIds);
      displayChannels.slice(from, to + 1).forEach(c => next.add(c.id));
      onSelect(next);
    } else {
      // Normal click: open editor
      lastClickedIdx.current = idx;
      onEdit(ch.id);
    }
  };

  const handleCheckboxClick = (e, ch, idx) => {
    e.stopPropagation();
    const isMac   = navigator.platform.toUpperCase().includes('MAC');
    const isShift = e.shiftKey;

    if (isShift && lastClickedIdx.current !== null) {
      const from = Math.min(lastClickedIdx.current, idx);
      const to   = Math.max(lastClickedIdx.current, idx);
      const next = new Set(selectedIds);
      displayChannels.slice(from, to + 1).forEach(c => next.add(c.id));
      onSelect(next);
    } else {
      toggleOne(ch.id);
      lastClickedIdx.current = idx;
    }
  };

  // ── Drag & drop ────────────────────────────────────────
  const handleDragStart = (e, idx) => {
    dragItem.current = idx;
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setOverIdx(idx);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    const from = dragItem.current;
    if (from === null || from === dropIdx) { setDragIdx(null); setOverIdx(null); return; }

    // Map filtered indices back to allChannels
    const fromId = channels[from].id;
    const toId   = channels[dropIdx].id;
    const next   = [...allChannels];
    const fromGlobal = next.findIndex(c => c.id === fromId);
    const toGlobal   = next.findIndex(c => c.id === toId);
    const [moved] = next.splice(fromGlobal, 1);
    next.splice(toGlobal, 0, moved);
    onReorder(next);

    setDragIdx(null);
    setOverIdx(null);
    dragItem.current = null;
  };

  const handleDragEnd = () => { setDragIdx(null); setOverIdx(null); dragItem.current = null; };

  // ── All distinct groups (for bulk reassign) ────────────
  const allGroups = [...new Set(allChannels.map(c => c.grp))].sort();

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        padding: '8px 14px', borderBottom: '1px solid var(--border2)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <div className="flex gap-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px', flex: 1, maxWidth: 280 }}>
          <Search size={13} color="var(--faint)" />
          <input
            value={search} onChange={e => onSearch(e.target.value)}
            placeholder="Search channels…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, width: '100%', fontFamily: 'inherit' }}
          />
        </div>

        {someSelected && (
          <>
            <span className="text-muted text-sm">{selectedIds.size} selected</span>
            {serverMode && <span className="text-xs text-muted">Bulk actions apply to selected visible rows only.</span>}
            <button className="btn btn-sm" onClick={() => onBulkAction('enable')}><Eye size={12}/> Enable</button>
            <button className="btn btn-sm" onClick={() => onBulkAction('disable')}><EyeOff size={12}/> Disable</button>
            <div className="flex gap-1">
              <select
                className="input" style={{ width: 130, fontSize: 12, padding: '4px 8px' }}
                value={bulkGroup} onChange={e => setBulkGroup(e.target.value)}
              >
                <option value="">Move to group…</option>
                {allGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              {bulkGroup && (
                <button className="btn btn-sm" onClick={() => { onBulkAction('set_group', bulkGroup); setBulkGroup(''); }}>Apply</button>
              )}
            </div>
            <button className="btn btn-sm btn-danger" onClick={() => onBulkAction('delete')}><Trash2 size={12}/> Delete</button>
          </>
        )}

        {hasEpg && !someSelected && (
          <>
            <button className="btn btn-sm" onClick={() => onAutoMatch(false, null)}><RefreshCw size={12}/> Match EPG</button>
            <button className="btn btn-sm" onClick={() => onAutoMatch(true, null)}><Image size={12}/> Match logos</button>
          </>
        )}
        <button
          className={`btn btn-sm ${activeFilterCount > 0 ? 'btn-primary' : ''}`}
          onClick={() => setShowFilters(f => !f)}
          title="Filter channels"
        >
          <Filter size={12}/>
          {activeFilterCount > 0 ? ` ${activeFilterCount} filter${activeFilterCount > 1 ? 's' : ''}` : ' Filter'}
        </button>
      </div>

      {/* Filter panel */}
      {showFilters && (
        <div style={{ padding: '8px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border2)', display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-xs text-muted" style={{ fontWeight: 600 }}>Status</span>
            {[['all','All'],['enabled','Enabled'],['disabled','Disabled']].map(([val, label]) => (
                <button key={val} className={`btn btn-sm ${effectiveEnabled === val ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => serverMode ? onEnabledFilterChange(val) : setFilterEnabled(val)}>{label}</button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="text-xs text-muted" style={{ fontWeight: 600 }}>EPG</span>
            {[['all','All'],['mapped','Mapped'],['unmapped','Not mapped']].map(([val, label]) => (
              <button key={val} className={`btn btn-sm ${filterEpg === val ? 'btn-primary' : ''}`}
                style={{ fontSize: 11, padding: '3px 10px' }}
                onClick={() => setFilterEpg(val)}>{label}</button>
            ))}
          </div>
          {activeFilterCount > 0 && (
            <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, marginLeft: 'auto' }}
              onClick={() => { serverMode ? onEnabledFilterChange('all') : setFilterEnabled('all'); setFilterEpg('all'); }}>
              <X size={11}/> Clear filters
            </button>
          )}
          {activeFilterCount > 0 && (
            <span className="text-xs text-muted">Showing {displayChannels.length} of {channels.length}</span>
          )}
        </div>
      )}

      {/* Table */}
      <div ref={scrollContainer} style={{ flex: 1, overflowY: 'auto' }} onScroll={onScroll}>
        {loading && <div style={{ padding: '8px 14px', fontSize: 12, color: 'var(--muted)' }}>Loading channels…</div>}
        {displayChannels.length === 0 ? (
          <div className="empty-state">
            <p>No channels{search ? ' matching your search' : ' in this group'}</p>
          </div>
        ) : (
          <table className="table" style={{ tableLayout: 'fixed', width: '100%' }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--surface)' }}>
              <tr>
                <th style={{ width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
                <th style={{ width: 24 }} />
                <th>Channel</th>
                <th style={{ width: 160 }}>Group</th>
                <th style={{ width: 130 }}>EPG</th>
                <th style={{ width: 70, textAlign: 'center' }}>Status</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {/* Spacer row above visible range */}
              {visibleStart > 0 && (
                <tr><td colSpan={7} style={{ height: visibleStart * ROW_H, padding: 0, border: 'none' }} /></tr>
              )}
              {displayChannels.slice(visibleStart, visibleStart + visibleCount).map((ch, i) => {
                const idx = visibleStart + i;
                return <tr
                  key={ch.id}
                  className={[
                    selectedIds.has(ch.id) ? 'selected' : '',
                    editingId === ch.id    ? 'editing'  : '',
                    overIdx === idx        ? 'drag-over': '',
                  ].join(' ')}
                  style={{ opacity: ch.enabled ? 1 : 0.45, cursor: 'pointer' }}
                  draggable={!serverMode}
                  onDragStart={serverMode ? undefined : (e => handleDragStart(e, idx))}
                  onDragOver={serverMode ? undefined : (e  => handleDragOver(e, idx))}
                  onDrop={serverMode ? undefined : (e      => handleDrop(e, idx))}
                  onDragEnd={serverMode ? undefined : handleDragEnd}
                  onClick={e => handleRowClick(e, ch, idx)}
                >
                  <td onClick={e => handleCheckboxClick(e, ch, idx)}>
                    <input type="checkbox" checked={selectedIds.has(ch.id)}
                      onChange={() => {}} // controlled via handleCheckboxClick
                    />
                  </td>
                  <td style={{ color: 'var(--faint)', cursor: serverMode ? 'not-allowed' : 'grab', paddingLeft: 6, opacity: serverMode ? 0.45 : 1 }}>
                    <GripVertical size={13} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <LogoThumb src={ch.tvg_logo} />
                      <span className="truncate" style={{ maxWidth: 220 }}>{ch.name}</span>
                    </div>
                  </td>
                  <td>
                    <span className="badge badge-muted truncate" style={{ maxWidth: 150 }}>{ch.grp}</span>
                  </td>
                  <td>
                    {ch.epg_id
                      ? <span className="badge badge-green truncate" style={{ maxWidth: 120 }}>✓ {ch.epg_id}</span>
                      : <span className="text-faint text-sm">—</span>
                    }
                  </td>
                  <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                    <button
                      className="btn btn-ghost btn-icon btn-sm"
                      title={ch.enabled ? 'Disable' : 'Enable'}
                      onClick={() => { onSelect(new Set([ch.id])); onBulkAction(ch.enabled ? 'disable' : 'enable'); }}
                    >
                      {ch.enabled
                        ? <Eye size={13} color="var(--blue)" />
                        : <EyeOff size={13} color="var(--faint)" />
                      }
                    </button>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <button className="btn btn-ghost btn-icon btn-sm" onClick={() => onEdit(ch.id)}>
                      <Edit2 size={12} color="var(--faint)" />
                    </button>
                  </td>
                </tr>;
              })}
              {/* Spacer row below visible range */}
              {visibleStart + visibleCount < displayChannels.length && (
                <tr><td colSpan={7} style={{ height: (displayChannels.length - visibleStart - visibleCount) * ROW_H, padding: 0, border: 'none' }} /></tr>
              )}
            </tbody>
          </table>
        )}
      </div>
      {serverMode && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', borderTop: '1px solid var(--border2)' }}>
          <span className="text-xs text-muted">Showing {Math.min((page - 1) * pageSize + 1, total)}-{Math.min(page * pageSize, total)} of {total}</span>
          <div className="flex gap-1" style={{ alignItems: 'center' }}>
            <label className="text-xs text-muted" htmlFor="page-size">Rows:</label>
            <select
              id="page-size"
              className="input"
              style={{ width: 80, fontSize: 12, padding: '4px 6px' }}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
            >
              {[25, 50, 100, 200, 500].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
            <button className="btn btn-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Prev</button>
            <button className="btn btn-sm" disabled={page * pageSize >= total} onClick={() => onPageChange(page + 1)}>Next</button>
          </div>
        </div>
      )}
    </div>
  );
}

function LogoThumb({ src }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div style={{ width: 28, height: 20, background: 'var(--surface2)', borderRadius: 3, flexShrink: 0 }} />
    );
  }
  return (
    <img src={src} alt="" onError={() => setErr(true)}
      style={{ width: 28, height: 20, objectFit: 'contain', borderRadius: 3, flexShrink: 0, background: 'var(--surface2)' }}
    />
  );
}
