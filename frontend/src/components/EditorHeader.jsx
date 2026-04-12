import ThemeToggle from './ThemeToggle.jsx';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload, Rss, Link2, Tv, LayoutGrid , Settings } from 'lucide-react';

export default function EditorHeader({ playlist, channelCount, enabledCount, onImport, onEPG, onServe, onBack }) {
  const nav = useNavigate();
  return (
    <header style={{
      background: 'var(--surface)', borderBottom: '1px solid var(--border2)',
      padding: '0 16px', height: 52, display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0
    }}>
      <button className="btn btn-ghost btn-icon btn-sm" onClick={onBack} title="Back">
        <ArrowLeft size={15} />
      </button>

      <div className="flex gap-2" style={{ marginRight: 4 }}>
        <Tv size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '-0.01em' }}>Station<span style={{ color: 'var(--accent)' }}>arr</span></span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <p className="truncate" style={{ fontWeight: 500, fontSize: 14 }}>{playlist?.name}</p>
        <p className="text-xs text-muted">{enabledCount}/{channelCount} channels enabled</p>
      </div>

      <div className="flex gap-2">
        <button className="btn btn-sm" onClick={onImport}>
          <Upload size={13} /> Import M3U
        </button>
        <button className="btn btn-sm" onClick={onEPG}>
          <Rss size={13} /> EPG sources
        </button>
        {playlist?.id && (
          <button className="btn btn-sm" onClick={() => nav(`/guide/${playlist.id}`)}>
            <LayoutGrid size={13} /> TV Guide
          </button>
        )}
        <button className="btn btn-primary btn-sm" onClick={onServe}>
          <Link2 size={13} /> Playlist URLs
        </button>
        <ThemeToggle />
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')} title="Settings">
          <Settings size={13} />
        </button>
      </div>
    </header>
  );
}
