import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { logs as logsApi } from '../api.js';
import { useToast } from '../context.jsx';

export default function Logs() {
  const nav = useNavigate();
  const toast = useToast();
  const [rows, setRows] = useState([]);
  const [filters, setFilters] = useState({ level: '', category: '', search: '' });

  const load = async () => {
    try { setRows(await logsApi.list(filters)); }
    catch (e) { toast(e.message, 'error'); }
  };
  useEffect(() => { load(); }, []);

  const exportFile = async (format) => {
    const res = await logsApi.exportFile(format);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stationarr-logs-${new Date().toISOString().slice(0,10)}.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyVisible = async () => {
    const text = rows.map(r => {
      const base = `[${r.ts}] [${r.level}] [${r.category}] ${r.message}`;
      const meta = r.metadata ? `\nmetadata: ${JSON.stringify(r.metadata)}` : '';
      return base + meta;
    }).join('\n');
    await navigator.clipboard.writeText(text);
    toast('Visible logs copied', 'success');
  };

  return <div style={{ padding: 24 }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
      <button className='btn btn-ghost btn-sm' onClick={() => nav('/settings')}><ArrowLeft size={14}/> Back</button>
      <h2>System / Logs</h2>
    </div>
    <div className='card' style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <select className='input' value={filters.level} onChange={e => setFilters({ ...filters, level: e.target.value })}><option value=''>All levels</option><option>info</option><option>warn</option><option>error</option><option>debug</option></select>
      <select className='input' value={filters.category} onChange={e => setFilters({ ...filters, category: e.target.value })}><option value=''>All categories</option>{['system','playlist','scheduler','epg','scraper','auth','update'].map(c => <option key={c}>{c}</option>)}</select>
      <input className='input' placeholder='Search logs' value={filters.search} onChange={e => setFilters({ ...filters, search: e.target.value })} />
      <button className='btn btn-sm' onClick={load}>Refresh</button>
      <button className='btn btn-sm' onClick={() => exportFile('txt')}>Export TXT</button>
      <button className='btn btn-sm' onClick={() => exportFile('json')}>Export JSON</button>
      <button className='btn btn-sm' onClick={copyVisible}>Copy visible logs</button>
    </div>
    <div className='card' style={{ maxHeight: '65vh', overflow: 'auto' }}>
      {rows.length === 0 ? (
        <div className='text-muted' style={{ padding: 12, fontSize: 13 }}>No logs yet. Trigger a playlist refresh, EPG fetch, or scraper run, then click Refresh.</div>
      ) : (
      <table style={{ width: '100%', fontSize: 12 }}><thead><tr><th>Timestamp</th><th>Level</th><th>Category</th><th>Message</th><th>Details</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td>{r.ts}</td><td>{r.level}</td><td>{r.category}</td><td>{r.message}</td><td><pre style={{ margin:0, whiteSpace:'pre-wrap', fontSize:11 }}>{r.metadata ? JSON.stringify(r.metadata, null, 2) : '—'}</pre></td></tr>)}</tbody></table>
      )}
    </div>
  </div>;
}
