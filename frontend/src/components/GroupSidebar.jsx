import { useState, useCallback, useRef } from 'react';
import { Eye, EyeOff, GripVertical } from 'lucide-react';

const MIN_WIDTH = 160;
const MAX_WIDTH = 320;

export default function GroupSidebar({ groups, total, active, onSelect, onToggleGroup }) {
  const [width, setWidth]   = useState(200);
  const dragging            = useRef(false);
  const startX              = useRef(0);
  const startW              = useRef(0);

  const sorted = Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));

  const onMouseDown = useCallback((e) => {
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;
    e.preventDefault();

    const onMove = (e) => {
      if (!dragging.current) return;
      const newW = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startW.current + e.clientX - startX.current));
      setWidth(newW);
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [width]);

  return (
    <aside style={{ width, flexShrink: 0, borderRight: '1px solid var(--border2)', overflowY: 'auto', padding: '10px 0', background: 'var(--surface)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.07em', padding: '0 14px 6px', textTransform: 'uppercase', flexShrink: 0 }}>
        Groups
      </p>

      <GroupItem label="All channels" count={total} active={active === '__all__'} onClick={() => onSelect('__all__')} />

      <div style={{ height: 1, background: 'var(--border2)', margin: '6px 0', flexShrink: 0 }} />

      {sorted.map(([g, meta]) => {
        const count = meta?.count ?? 0;
        const enabled = (meta?.enabled_count ?? 0) > 0;
        return (
          <div key={g} style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
            <GroupItem
              label={g} count={count}
              active={active === g}
              onClick={() => onSelect(g)}
              faded={!enabled}
            />
            {/* Eye button always visible, never squeezed */}
            <button
              className="btn btn-ghost btn-icon"
              style={{ padding: 5, flexShrink: 0, marginRight: 4, opacity: enabled ? 0.8 : 0.4 }}
              title={enabled ? `Disable all in "${g}"` : `Enable all in "${g}"`}
              onClick={(e) => { e.stopPropagation(); onToggleGroup(g, !enabled); }}
            >
              {enabled
                ? <Eye size={13} color="var(--blue)" />
                : <EyeOff size={13} color="var(--faint)" />
              }
            </button>
          </div>
        );
      })}

      {/* Drag handle */}
      <div
        onMouseDown={onMouseDown}
        title="Drag to resize"
        style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: 6,
          cursor: 'col-resize', display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10,
        }}
      >
        <div style={{ width: 2, height: 40, background: 'var(--border)', borderRadius: 2, opacity: 0.5 }} />
      </div>
    </aside>
  );
}

function GroupItem({ label, count, active, onClick, faded }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flex: 1, minWidth: 0,
        padding: '6px 8px 6px 14px',
        background: active ? 'var(--surface2)' : 'transparent',
        border: 'none', borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: faded ? 'var(--faint)' : active ? 'var(--text)' : 'var(--muted)',
        fontSize: 13, cursor: 'pointer', textAlign: 'left',
        transition: 'background 0.1s',
        opacity: faded ? 0.6 : 1,
        overflow: 'hidden',
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 4 }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--faint)', flexShrink: 0 }}>{count}</span>
    </button>
  );
}
