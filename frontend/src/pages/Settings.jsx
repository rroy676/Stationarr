import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tv, Rss } from 'lucide-react';
import { applyTheme, getTheme } from '../components/ThemeToggle.jsx';
import { auth as api } from '../api.js';
import { useAuth, useToast } from '../context.jsx';
import { useTZ, TIMEZONE_GROUPS } from '../timezone.jsx';

export default function Settings() {
  const { user, logout } = useAuth();
  const toast = useToast();
  const nav   = useNavigate();
  const { tz, setTimezone, fmtTime } = useTZ();

  const [theme, setTheme] = useState(getTheme);

  const handleTheme = (t) => { applyTheme(t); setTheme(t); };

  const [form, setForm]     = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);

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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => nav('/')}><ArrowLeft size={15}/></button>
        <Tv size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700 }}>Stream<span style={{ color: 'var(--accent)' }}>arr</span></span>
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
          <div className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <p style={{ fontWeight: 500, marginBottom: 4 }}>iptv-org/epg integration</p>
              <p className="text-sm text-muted">Manage which channels the scraper fetches, view status, and configure the sidecar container.</p>
            </div>
            <button className="btn btn-primary btn-sm" style={{ flexShrink: 0, marginLeft: 16 }} onClick={() => nav('/scraper')}>
              <Rss size={13}/> Open scraper
            </button>
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
