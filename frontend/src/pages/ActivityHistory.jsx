import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Activity, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { activity as activityApi } from '../api.js';
import { useToast } from '../context.jsx';

const TYPES = ['system', 'playlist', 'scheduler', 'epg', 'scraper', 'auth', 'update'];
const STATUSES = ['success', 'warning', 'warn', 'error', 'info', 'debug'];

export default function ActivityHistory() {
  const nav = useNavigate();
  const toast = useToast();
  const [filters, setFilters] = useState({ type: '', status: '' });
  const [result, setResult] = useState({ events: [], page: 1, total_pages: 0, total: 0 });
  const [loading, setLoading] = useState(false);

  const load = async (page = 1) => {
    setLoading(true);
    try { setResult(await activityApi.history({ ...filters, page, page_size: 25 })); }
    catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, [filters.type, filters.status]);

  return <div style={{ minHeight: '100vh', padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      <button className="btn btn-ghost btn-sm" onClick={() => nav('/')}><ArrowLeft size={14}/> Back</button>
      <Activity size={18} color="var(--accent)" />
      <h1 style={{ fontSize: 20 }}>Activity / History</h1>
    </div>
    <div className="card" style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <select className="input" aria-label="Filter by category" value={filters.type} onChange={e => setFilters(f => ({ ...f, type: e.target.value }))}>
        <option value="">All categories</option>{TYPES.map(t => <option key={t}>{t}</option>)}
      </select>
      <select className="input" aria-label="Filter by status" value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}>
        <option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}
      </select>
      <button className="btn btn-sm" onClick={() => load(result.page)}>Refresh</button>
      <span className="text-xs text-muted" style={{ marginLeft: 'auto' }}>{result.total} events</span>
    </div>
    <div className="card" style={{ overflowX: 'auto' }}>
      {loading ? <p className="text-muted">Loading…</p> : result.events.length === 0 ? <p className="text-muted">No activity recorded yet.</p> :
        <table style={{ width: '100%', fontSize: 12 }}><thead><tr><th>Timestamp</th><th>Type</th><th>Status</th><th>Title</th><th>Details</th></tr></thead>
          <tbody>{result.events.map(event => <tr key={event.id}>
            <td style={{ whiteSpace: 'nowrap' }}>{new Date(event.timestamp.replace(' ', 'T') + 'Z').toLocaleString()}</td>
            <td>{event.type}</td><td><Status status={event.status}/></td><td>{event.title}</td>
            <td><pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11 }}>{event.details ? JSON.stringify(event.details, null, 2) : '—'}</pre></td>
          </tr>)}</tbody>
        </table>}
    </div>
    {result.total_pages > 1 && <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
      <button className="btn btn-sm" disabled={result.page <= 1 || loading} onClick={() => load(result.page - 1)}><ChevronLeft size={14}/> Previous</button>
      <span className="text-sm text-muted" style={{ padding: 7 }}>Page {result.page} of {result.total_pages}</span>
      <button className="btn btn-sm" disabled={result.page >= result.total_pages || loading} onClick={() => load(result.page + 1)}>Next <ChevronRight size={14}/></button>
    </div>}
  </div>;
}

function Status({ status }) {
  const Icon = status === 'error' ? XCircle : (status === 'warn' || status === 'warning') ? AlertTriangle : CheckCircle;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon size={13} color={status === 'error' ? 'var(--red)' : (status === 'warn' || status === 'warning') ? 'var(--yellow)' : 'var(--green)'}/>{status}</span>;
}
