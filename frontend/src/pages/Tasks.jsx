import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Clock3, ListChecks, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { system as api } from '../api.js';
import { useToast } from '../context.jsx';

function date(value) { return value ? new Date(value).toLocaleString() : 'Not run yet'; }
function duration(value) { return value == null ? '—' : value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`; }

export default function Tasks() {
  const nav = useNavigate();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.tasks()); } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [toast]);
  useEffect(() => { load(); }, [load]);

  return <div style={{ minHeight: '100vh', padding: 24 }}>
    <main style={{ maxWidth: 960, margin: '0 auto' }}>
      <div className="flex" style={{ gap: 10, marginBottom: 24 }}>
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')}><ArrowLeft size={14}/> Back</button>
        <ListChecks size={18} color="var(--accent)" />
        <h1 style={{ fontSize: 20 }}>System / Tasks</h1>
        <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={load} disabled={loading}><RefreshCw size={13}/> {loading ? 'Loading…' : 'Refresh'}</button>
      </div>
      <div className="card" style={{ marginBottom: 16 }}>
        <p style={{ fontWeight: 600 }}>Scheduled tasks</p>
        <p className="text-sm text-muted" style={{ marginTop: 4 }}>This page is read-only. Automatic refreshes are checked every 15 minutes.</p>
      </div>
      {loading && !data ? <p className="text-muted">Loading…</p> : data?.tasks?.length ? <div className="card" style={{ padding: 0, overflow: 'auto' }}>
        <table className="table">
          <thead><tr><th>Task</th><th>Schedule</th><th>Status</th><th>Last run</th><th>Next run</th><th>Duration</th></tr></thead>
          <tbody>{data.tasks.map(task => <tr key={task.id}>
            <td><div style={{ fontWeight: 500 }}>{task.name}</div><span className="text-xs text-muted">{task.type}</span></td>
            <td className="text-muted">{task.schedule}</td>
            <td><Status value={task.status} /></td>
            <td className="text-muted text-xs">{date(task.last_run)}</td>
            <td className="text-muted text-xs">{date(task.next_run)}</td>
            <td className="mono">{duration(task.duration_ms)}</td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="empty-state"><Clock3 size={28}/><p>No scheduled tasks are configured.</p></div>}
    </main>
  </div>;
}

function Status({ value }) {
  const labels = { running: 'Running', success: 'Success', error: 'Failed', idle: 'Waiting' };
  const classes = { running: 'badge-blue', success: 'badge-green', error: 'badge-accent', idle: 'badge-muted' };
  return <span className={`badge ${classes[value] || 'badge-muted'}`}>{labels[value] || value || 'Waiting'}</span>;
}
