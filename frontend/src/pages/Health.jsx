import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle, AlertTriangle, XCircle, RefreshCw, Activity } from 'lucide-react';
import { system as systemApi } from '../api.js';
import { useToast } from '../context.jsx';

const icons = { ok: CheckCircle, warning: AlertTriangle, error: XCircle };
const labels = { ok: 'Healthy', warning: 'Warning', error: 'Error' };

export default function Health() {
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const health = await systemApi.health();
      try {
        const release = await fetch('https://api.github.com/repos/rroy676/Stationarr/releases/latest').then(r => r.ok ? r.json() : null);
        const current = health.checks.find(c => c.title === 'Stationarr version');
        const latest = release?.tag_name?.replace(/^v/, '');
        const installed = current?.description?.match(/v([^ ]+)/)?.[1];
        if (latest && installed && latest !== installed) health.checks.unshift({ status: 'warning', title: 'Stationarr update available', description: `Version ${latest} is available; this instance is running v${installed}.`, fix: 'Open Settings → Updates to review the release notes and update instructions.', action: { label: 'Open Updates', href: '/settings?section=updates' } });
      } catch { /* update checks are best effort */ }
      setData(health);
    }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  const checks = data?.checks || [];
  const problemCount = checks.filter(c => c.status !== 'ok').length;
  return <div style={{ minHeight: '100vh', padding: 24 }}>
    <div style={{ maxWidth: 860, margin: '0 auto' }}>
      <div className="flex" style={{ gap: 10, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')}><ArrowLeft size={14}/> Back</button>
        <Activity size={18} color="var(--accent)" />
        <h1 style={{ fontSize: 20 }}>System / Health</h1>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={load} disabled={loading}><RefreshCw size={13}/> {loading ? 'Checking…' : 'Refresh'}</button>
      </div>
      <div className="card" style={{ marginBottom: 16, borderColor: problemCount ? 'var(--yellow, #d29922)' : 'var(--green)' }}>
        <p style={{ fontWeight: 600 }}>{loading ? 'Checking system health…' : problemCount ? `${problemCount} health check${problemCount === 1 ? '' : 's'} need attention` : 'All health checks passed'}</p>
        {data && <p className="text-sm text-muted" style={{ marginTop: 4 }}>Last checked {new Date(data.generated_at).toLocaleString()}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {checks.map((item, index) => <HealthItem key={`${item.title}-${index}`} item={item} onNavigate={nav} />)}
      </div>
    </div>
  </div>;
}

function HealthItem({ item, onNavigate }) {
  const Icon = icons[item.status] || AlertTriangle;
  return <div className="card" style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
    <Icon size={19} color={item.status === 'ok' ? 'var(--green)' : item.status === 'error' ? 'var(--red)' : 'var(--yellow, #d29922)'} style={{ flexShrink: 0, marginTop: 2 }} />
    <div style={{ flex: 1, minWidth: 0 }}>
      <div className="flex" style={{ gap: 8, marginBottom: 4 }}><strong>{item.title}</strong><span className={`badge ${item.status === 'ok' ? 'badge-green' : item.status === 'error' ? 'badge-muted' : 'badge-accent'}`}>{labels[item.status]}</span></div>
      <p className="text-sm text-muted">{item.description}</p>
      <p className="text-xs" style={{ marginTop: 7 }}><strong>Suggested fix:</strong> {item.fix}</p>
      {item.action && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => onNavigate(item.action.href, item.action.state ? { state: item.action.state } : undefined)}>{item.action.label}</button>}
    </div>
  </div>;
}
