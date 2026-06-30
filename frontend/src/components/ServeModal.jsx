import { useState } from 'react';
import { Copy, Check, ExternalLink, RefreshCw } from 'lucide-react';
import { playlists as api } from '../api.js';
import { useToast } from '../context.jsx';

function fallbackCopy(text, done) {
  const el = document.createElement('textarea');
  el.value = text;
  el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0';
  document.body.appendChild(el);
  el.focus(); el.select();
  try { document.execCommand('copy'); done(); } catch {}
  document.body.removeChild(el);
}

export default function ServeModal({ playlist: initialPlaylist, onClose }) {
  const toast = useToast();
  const [playlist, setPlaylist] = useState(initialPlaylist);
  const [copied,   setCopied]   = useState('');
  const [regen,    setRegen]    = useState(false);
  const [regenCombined, setRegenCombined] = useState(false);

  const base = window.location.origin;

  const m3uUrl       = `${base}/api/serve/${playlist.slug}/playlist.m3u`;
  const combinedM3uUrl = playlist.combined_slug ? `${base}/api/serve/combined/${playlist.combined_slug}/playlist.m3u` : '';
  const epgUrl       = `${base}/api/serve/${playlist.slug}/epg.xml`;
  const xtreamServer = base;
  const xtreamM3uUrl = `${base}/get.php?username=${playlist.xtream_user}&password=${playlist.xtream_pass}&type=m3u_plus`;
  const xtreamEpgUrl = `${base}/xmltv.php?username=${playlist.xtream_user}&password=${playlist.xtream_pass}`;

  const copy = (text, key) => {
    const done = () => { setCopied(key); setTimeout(() => setCopied(''), 2000); };
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  };

  const regenCombinedToken = async () => {
    if (!confirm('Regenerate Combined M3U token? Old Combined M3U URLs will stop working immediately.')) return;
    setRegenCombined(true);
    try {
      const updated = await api.regenCombinedToken();
      setPlaylist(current => ({ ...current, combined_slug: updated.combined_slug }));
      toast('Combined M3U token regenerated', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRegenCombined(false);
    }
  };

  const regenCreds = async () => {
    if (!confirm('Regenerate Xtream credentials? Any players using the old credentials will stop working.')) return;
    setRegen(true);
    try {
      const updated = await api.regenXtream(playlist.id);
      setPlaylist(updated);
      toast('Xtream credentials regenerated', 'success');
    } catch (e) {
      toast(e.message, 'error');
    } finally {
      setRegen(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 540 }}>
        <div className="modal-header">
          <h2>Playlist URLs</h2>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>X</button>
        </div>
        <div className="modal-body">

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 13 }}>Direct M3U</p>
            <p className="text-xs text-muted">For players that accept a raw M3U URL. Use Combined M3U to include all of your playlists in one URL</p>
            <UrlRow label="M3U playlist" url={m3uUrl} copied={copied === 'm3u'} onCopy={() => copy(m3uUrl, 'm3u')} />
            {combinedM3uUrl && (
              <UrlRow
                label="Combined M3U"
                url={combinedM3uUrl}
                copied={copied === 'combined-m3u'}
                onCopy={() => copy(combinedM3uUrl, 'combined-m3u')}
                action={
                  <button className="btn btn-sm btn-danger" onClick={regenCombinedToken} disabled={regenCombined}>
                    <RefreshCw size={12} /> {regenCombined ? 'Regenerating...' : 'Regenerate token'}
                  </button>
                }
              />
            )}
            <UrlRow label="EPG (XMLTV)"  url={epgUrl} copied={copied === 'epg'} onCopy={() => copy(epgUrl, 'epg')} />
          </div>

          <div className="divider" style={{ margin: '4px 0' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p style={{ fontWeight: 600, fontSize: 13 }}>Xtream Codes</p>
            <p className="text-xs text-muted">For TiviMate, IPTV Smarters, GSE IPTV, and other Xtream-compatible players</p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              <CredBox label="Server"   value={xtreamServer}         copyKey="xserver" copied={copied} onCopy={copy} />
              <CredBox label="Username" value={playlist.xtream_user}  copyKey="xuser"   copied={copied} onCopy={copy} />
              <CredBox label="Password" value={playlist.xtream_pass}  copyKey="xpass"   copied={copied} onCopy={copy} />
            </div>

            <UrlRow label="M3U (Xtream format)" url={xtreamM3uUrl} copied={copied === 'xm3u'} onCopy={() => copy(xtreamM3uUrl, 'xm3u')} />
            <UrlRow label="EPG (Xtream format)" url={xtreamEpgUrl} copied={copied === 'xepg'} onCopy={() => copy(xtreamEpgUrl, 'xepg')} />

            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text)', display: 'block', marginBottom: 4 }}>TiviMate setup</strong>
              Add playlist → Xtream Codes → enter Server, Username, Password above
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-sm btn-danger" onClick={regenCreds} disabled={regen}>
                <RefreshCw size={12} /> {regen ? 'Regenerating...' : 'Regenerate credentials'}
              </button>
            </div>
          </div>

          <div className="divider" style={{ margin: '4px 0' }} />

          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: 12 }}>
            <p className="text-xs text-muted" style={{ marginBottom: 6, fontWeight: 500 }}>Playlist info</p>
            <table style={{ width: '100%', fontSize: 12 }}>
              <tbody>
                <tr><td className="text-muted" style={{ padding: '3px 0', width: 70 }}>Name</td><td>{playlist.name}</td></tr>
                <tr><td className="text-muted" style={{ padding: '3px 0' }}>Slug</td><td className="mono">{playlist.slug}</td></tr>
                <tr><td className="text-muted" style={{ padding: '3px 0' }}>Updated</td><td>{new Date(playlist.updated_at).toLocaleString()}</td></tr>
              </tbody>
            </table>
          </div>

        </div>
      </div>
    </div>
  );
}

function CredBox({ label, value, copyKey, copied, onCopy }) {
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 6, padding: '8px 10px' }}>
      <p className="text-xs text-muted" style={{ marginBottom: 4 }}>{label}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span className="mono truncate" style={{ flex: 1, fontSize: 12 }}>{value}</span>
        <button className="btn btn-ghost btn-icon" style={{ padding: 2, flexShrink: 0 }} onClick={() => onCopy(value, copyKey)}>
          {copied === copyKey ? <Check size={11} color="var(--green)" /> : <Copy size={11} color="var(--faint)" />}
        </button>
      </div>
    </div>
  );
}

function UrlRow({ label, url, copied, onCopy, action }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="text-xs text-muted" style={{ fontWeight: 500 }}>{label}</span>
        {action}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input className="input mono" value={url} readOnly style={{ flex: 1, fontSize: 11 }} onClick={e => e.target.select()} />
        <button className="btn btn-sm btn-icon" onClick={onCopy} title="Copy"><Copy size={13} /></button>
        <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-icon"><ExternalLink size={13} /></a>
      </div>
    </div>
  );
}
