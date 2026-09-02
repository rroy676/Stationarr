import HeaderButtons from '../components/HeaderButtons.jsx';
import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Tv, Rss, Download, Upload, FileText } from 'lucide-react';
import { applyTheme, getTheme } from '../components/ThemeToggle.jsx';
import { auth as api, backup as backupApi, epg as epgApi } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { useTZ, TIMEZONE_GROUPS } from '../timezone.jsx';
import EPGPanel from '../components/EPGPanel.jsx';

export default function Settings() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nav   = useNavigate();
  const location = useLocation();
  const { tz, setTimezone, fmtTime } = useTZ();

  const [theme, setTheme] = useState(getTheme);

  const handleTheme = (t) => { applyTheme(t); setTheme(t); };

  const [form, setForm]     = useState({ current: '', next: '', confirm: '' });
  const [saving,    setSaving]    = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [showEPG, setShowEPG] = useState(false);
  const [epgSources, setEpgSources] = useState([]);
  const [urlSettings, setUrlSettings] = useState({ tailscale_url: '', url_mode: 'local' });
  const [urlSaving, setUrlSaving] = useState(false);

  const [version, setVersion] = useState(null);
  const [release, setRelease] = useState(null);
  useEffect(() => {
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d.version) setVersion(d.version); })
      .catch(() => {});

    fetch('https://api.github.com/repos/rroy676/Stationarr/releases/latest')
      .then(r => r.json())
      .then(d => setRelease(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    api.settings.get()
      .then(settings => setUrlSettings({
        tailscale_url: settings.tailscale_url || '',
        url_mode: settings.url_mode || 'local',
      }))
      .catch(err => toast(err.message, 'error'));
  }, []);

  useEffect(() => {
    if (location.search.includes('section=updates')) {
      document.getElementById('updates-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [location.search]);

  const latestVersion = release?.tag_name?.replace(/^v/, '') || null;
  const published = release?.published_at ? new Date(release.published_at) : null;
  const hasUpdate = !!(version && latestVersion && latestVersion !== version);
  const updateStatus = !version || !latestVersion
    ? 'Checking for updates…'
    : hasUpdate
      ? `Update available (v${latestVersion})`
      : 'Up to date';

  const loadEpgSources = async () => {
    try { setEpgSources(await epgApi.list()); }
    catch (err) { toast(err.message, 'error'); }
  };

  useEffect(() => {
    if (location.state?.openEpgSources) {
      setShowEPG(true);
      loadEpgSources();
      nav(location.pathname, { replace: true, state: {} });
    }
  }, [location.state, location.pathname]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const changePassword = async (e) => {
    e.preventDefault();
    if (form.next !== form.confirm) return toast('Passwords do not match', 'error');
    setSaving(true);
    try {
      await api.password({ current: form.current, next: form.next });
      toast('Password updated', 'success');
      setForm({ current: '', next: '', confirm: '' });
    } catch (err) { toast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  const saveUrlSettings = async (e) => {
    e.preventDefault();
    setUrlSaving(true);
    try {
      const settings = await api.settings.update({
        tailscale_url: urlSettings.tailscale_url.trim(),
        url_mode: urlSettings.url_mode,
      });
      setUrlSettings({ tailscale_url: settings.tailscale_url || '', url_mode: settings.url_mode });
      toast('URL settings updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
    finally { setUrlSaving(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => nav('/')}><ArrowLeft size={15}/></button>
        <Tv size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700 }}>Station<span style={{ color: 'var(--accent)' }}>arr</span></span>
        <span className="text-muted" style={{ marginLeft: 4 }}>/ Settings</span>
      </header>

      <main style={{ flex: 1, maxWidth: 520, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Account */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Account</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Username"    value={user?.username} />
            <Row label="Role"        value={user?.is_admin ? 'Admin' : 'User'} />
            <Row label="Member since" value={user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'} />
          </div>
        </div>

        {/* Theme */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Appearance</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: 13, fontWeight: 500 }}>Theme</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {[
                { value: 'auto',  label: '🌗 Auto',  desc: 'Follow system' },
                { value: 'light', label: '☀️ Light', desc: 'Always light' },
                { value: 'dark',  label: '🌙 Dark',  desc: 'Always dark'  },
              ].map(t => (
                <button key={t.value}
                  onClick={() => handleTheme(t.value)}
                  style={{
                    flex: 1, padding: '10px 8px', borderRadius: 8, cursor: 'pointer',
                    border: theme === t.value ? '2px solid var(--accent)' : '1px solid var(--border)',
                    background: theme === t.value ? 'var(--accent-dim)' : 'var(--surface2)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                  <span style={{ fontSize: 18 }}>{t.label.split(' ')[0]}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{t.label.split(' ')[1]}</span>
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{t.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Timezone */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Display timezone</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Affects how programme times appear in the EPG preview and TV Guide. Current time: <strong style={{ color: 'var(--text)' }}>{fmtTime(new Date())}</strong>
          </p>
          <div className="card">
            <div className="field">
              <label>Timezone</label>
              <select className="input" value={tz} onChange={e => setTimezone(e.target.value)}>
                {TIMEZONE_GROUPS.map(g => (
                  <optgroup key={g.label} label={g.label}>
                    {g.zones.map(z => (
                      <option key={z.value} value={z.value}>{z.label} — {z.value}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <p className="text-xs text-faint" style={{ marginTop: 8 }}>
              Selected: <span className="mono">{tz}</span>
            </p>
          </div>
        </div>

        {/* URL Configuration */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>URL Configuration</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Configure how Stationarr generates playlist and XMLTV links for your IPTV players.
          </p>
          <div className="card">
            <form onSubmit={saveUrlSettings} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Public Base URL</label>
                <input className="input" value={window.location.origin} readOnly />
              </div>
              <div className="field">
                <label>Tailscale Base URL</label>
                <input
                  className="input"
                  type="url"
                  placeholder="http://stationarr-host.tailnet-name.ts.net:3000"
                  value={urlSettings.tailscale_url}
                  onChange={e => setUrlSettings(s => ({ ...s, tailscale_url: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>URL mode</label>
                <select className="input" value={urlSettings.url_mode} onChange={e => setUrlSettings(s => ({ ...s, url_mode: e.target.value }))}>
                  <option value="local">Local (LAN)</option>
                  <option value="public">Public</option>
                  <option value="tailscale">Tailscale</option>
                </select>
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={urlSaving} style={{ alignSelf: 'flex-start' }}>
                {urlSaving ? 'Saving…' : 'Save'}
              </button>
            </form>
          </div>
        </div>

        {/* Change password */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Change password</h2>
          <div className="card">
            <form onSubmit={changePassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Current password</label>
                <input className="input" type="password" value={form.current} onChange={set('current')} required />
              </div>
              <div className="field">
                <label>New password</label>
                <input className="input" type="password" value={form.next} onChange={set('next')} required minLength={8} />
              </div>
              <div className="field">
                <label>Confirm new password</label>
                <input className="input" type="password" value={form.confirm} onChange={set('confirm')} required />
              </div>
              <button type="submit" className="btn btn-primary btn-sm" disabled={saving} style={{ alignSelf: 'flex-start' }}>
                {saving ? 'Saving…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>

        {/* EPG Scraper */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>EPG scraper</h2>
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div>
              <p style={{ fontWeight: 500, marginBottom: 4 }}>iptv-org/epg integration</p>
              <p className="text-sm text-muted">Manage which channels the scraper fetches, view status, and configure the sidecar container.</p>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, marginLeft: 16 }} onClick={() => nav('/scraper')}>
              <Rss size={13}/> Open scraper
            </button>
          </div>
          <button
            className="btn btn-sm"
            onClick={() => { setShowEPG(true); loadEpgSources(); }}
          >
            Open EPG Sources
          </button>
        </div>


        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>System</h2>
          <div className='card' style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <p style={{ fontWeight:500, marginBottom:4 }}>Application logs</p>
              <p className='text-sm text-muted'>View recent Stationarr events and export a sanitized debug log for support.</p>
            </div>
            <button className='btn btn-sm btn-primary' onClick={() => nav('/logs')}><FileText size={13}/> Open Logs</button>
          </div>
        </div>

        {/* Backup & Restore */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>Backup & Restore</h2>
          <p className="text-sm text-muted" style={{ marginBottom: 12 }}>
            Export all your playlists, channels, EPG sources and settings to a JSON file. Import it on any Stationarr instance to restore.
          </p>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Export */}
            <div>
              <p style={{ fontWeight: 500, marginBottom: 6, fontSize: 13 }}>Export backup</p>
              <button className="btn btn-primary btn-sm" onClick={() => backupApi.download()}>
                <Download size={13}/> Download backup file
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 16 }}>
              <p style={{ fontWeight: 500, marginBottom: 4, fontSize: 13 }}>Restore from backup</p>
              <p className="text-xs text-muted" style={{ marginBottom: 10 }}>
                This will <strong style={{ color: 'var(--text)' }}>add</strong> playlists from the backup — it won't delete existing ones. EPG sources with the same name will be skipped.
              </p>
              <label style={{ cursor: 'pointer' }}>
                <input type="file" accept=".json" style={{ display: 'none' }}
                  onChange={async (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    setRestoring(true);
                    try {
                      const text = await file.text();
                      const data = JSON.parse(text);
                      const res  = await backupApi.restore(data);
                      toast(res.message, 'success');
                    } catch (err) {
                      toast(err.message || 'Restore failed', 'error');
                    } finally {
                      setRestoring(false);
                      e.target.value = '';
                    }
                  }}
                />
                <span className={`btn btn-sm ${restoring ? 'btn-ghost' : ''}`}>
                  <Upload size={13}/> {restoring ? 'Restoring…' : 'Choose backup file…'}
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* Updates */}
        <div id="updates-section">
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Updates</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <Row label="Current version" value={version ? `v${version}` : '—'} />
            <Row label="Latest release" value={latestVersion ? `v${latestVersion}` : '—'} />
            <Row label="Release date" value={published ? published.toLocaleString() : '—'} />
            <Row label="Status" value={updateStatus} />

            <div style={{ marginTop: 8 }}>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Release notes</p>
              <div
                style={{
                  background: 'var(--surface2)',
                  border: '1px solid var(--border2)',
                  borderRadius: 8,
                  padding: 12,
                  whiteSpace: 'pre-wrap',
                  fontSize: 12,
                  maxHeight: 240,
                  overflow: 'auto',
                }}
              >
                {release?.body || 'No release notes available.'}
              </div>
              <a
                href={release?.html_url || 'https://github.com/rroy676/Stationarr/releases/latest'}
                target="_blank"
                rel="noreferrer"
                style={{ color: 'var(--accent)', display: 'inline-block', marginTop: 8 }}
              >
                View latest GitHub release
              </a>
            </div>

            <div style={{ marginTop: 10, borderTop: '1px solid var(--border2)', paddingTop: 12 }}>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Docker Compose update</p>
              <pre className="mono" style={{ fontSize: 12, background: 'var(--surface2)', padding: 10, borderRadius: 8, overflow: 'auto' }}>{`cd /path/to/stationarr
docker compose pull
docker compose up -d`}</pre>
            </div>

            <div style={{ marginTop: 10 }}>
              <p style={{ fontWeight: 600, marginBottom: 6, fontSize: 13 }}>Docker Run update</p>
              <pre className="mono" style={{ fontSize: 12, background: 'var(--surface2)', padding: 10, borderRadius: 8, overflow: 'auto' }}>{`docker pull rroy676/stationarr:latest
docker stop stationarr
docker rm stationarr
# rerun the original docker run command with same volumes/env`}</pre>
            </div>

            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              Full in-app self-update is not enabled by default because it would require Docker socket access and could restart the app.
            </p>
          </div>
        </div>

        {/* Support */}
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <a href="https://ko-fi.com/rroy676" target="_blank" rel="noreferrer"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 8,
              background: '#FF5E5B', color: '#fff', borderRadius: 8,
              padding: '10px 20px', fontWeight: 600, fontSize: 13,
              textDecoration: 'none', transition: 'opacity 0.15s',
            }}
            onMouseOver={e => e.currentTarget.style.opacity = '0.85'}
            onMouseOut={e => e.currentTarget.style.opacity = '1'}
          >
            ☕ Support Stationarr on Ko-fi
          </a>
          <p className="text-xs text-muted" style={{ marginTop: 8 }}>
            Stationarr is free and open source. Your support keeps it going.
          </p>
        </div>

        {/* About */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>About</h2>
          <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Row label="Version" value={version ? `v${version}` : '—'} />
            <Row label="Source" value={
              <a href="https://github.com/rroy676/Stationarr" target="_blank" rel="noreferrer"
                style={{ color: 'var(--accent)' }}>
                github.com/rroy676/Stationarr
              </a>
            } />
            <Row label="Releases" value={
              <a href="https://github.com/rroy676/Stationarr/releases" target="_blank" rel="noreferrer"
                style={{ color: 'var(--accent)' }}>
                Changelog &amp; releases
              </a>
            } />
          </div>
        </div>

        {/* Sign out */}
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>Session</h2>
          <div className="card">
            <button className="btn btn-sm btn-danger" onClick={logout}>Sign out</button>
          </div>
        </div>
      </main>

      {showEPG && (
        <EPGPanel
          sources={epgSources}
          onClose={() => setShowEPG(false)}
          onChange={loadEpgSources}
        />
      )}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span className="text-muted">{label}</span>
      <span>{value}</span>
    </div>
  );
}
