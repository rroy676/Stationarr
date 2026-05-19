import { useEffect, useState, useCallback, useRef } from 'react';
import HeaderButtons from '../components/HeaderButtons.jsx';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Tv, Search, Plus, Trash2, Eye, EyeOff, RefreshCw,
         CheckCircle, XCircle, Play, Rss, ExternalLink, Terminal, Settings } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { scraper as api, epg as epgApi } from '../api.js';
import { useToast } from '../context.jsx';

const COUNTRIES = [
  { code: 'us', label: 'United States' }, { code: 'ca', label: 'Canada' },
  { code: 'gb', label: 'United Kingdom' }, { code: 'au', label: 'Australia' },
  { code: 'fr', label: 'France' },         { code: 'de', label: 'Germany' },
  { code: 'es', label: 'Spain' },          { code: 'it', label: 'Italy' },
  { code: 'nl', label: 'Netherlands' },    { code: 'be', label: 'Belgium' },
  { code: 'se', label: 'Sweden' },         { code: 'no', label: 'Norway' },
  { code: 'dk', label: 'Denmark' },        { code: 'br', label: 'Brazil' },
  { code: 'mx', label: 'Mexico' },         { code: 'in', label: 'India' },
  { code: 'jp', label: 'Japan' },          { code: 'kr', label: 'South Korea' },
  { code: 'nz', label: 'New Zealand' },
];

export default function ScraperPage() {
  const nav   = useNavigate();
  const toast = useToast();

  const [status,     setStatus]     = useState(null);
  const [channels,   setChannels]   = useState([]);
  const [sites,      setSites]      = useState([]);
  const [epgSources, setEpgSources] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState('channels');

  // Search
  const [query,      setQuery]      = useState('');
  const [country,    setCountry]    = useState('us');
  const [results,    setResults]    = useState(null);
  const [searching,  setSearching]  = useState(false);
  const [pickingSite,setPickingSite]= useState(null);

  // Run scraper
  const [running,    setRunning]    = useState(false);
  const [logs,       setLogs]       = useState([]);
  const [runDone,    setRunDone]    = useState(false);
  const logsEndRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const [st, chs, si, epg] = await Promise.all([
        api.status(), api.channels(), api.sites(), epgApi.list(),
      ]);
      setStatus(st);
      setChannels(chs);
      setSites(si);
      setEpgSources(epg);
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const runScraper = () => {
    if (running) return;
    if (status?.no_channels_configured || enabledCount === 0) {
      toast('No scraper channels are configured. Add and enable at least one channel first.', 'warning');
      return;
    }
    setRunning(true);
    setRunDone(false);
    setLogs([]);
    setTab('run');

    const token = localStorage.getItem('token');
    const es = new EventSource(`/api/scraper/run?token=${token}`);

    es.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      setLogs(prev => [...prev, { type: data.type, msg: data.msg }]);

      if (data.type === 'done') {
        es.close();
        setRunning(false);
        setRunDone(true);
        // Auto-fetch the guide into Stationarr
        await autoFetchGuide();
      } else if (data.type === 'error') {
        es.close();
        setRunning(false);
      }
    };

    es.onerror = () => {
      es.close();
      setRunning(false);
      setLogs(prev => [...prev, { type: 'error', msg: 'Connection lost. Check that the epg container is running.' }]);
    };
  };

  const autoFetchGuide = async () => {
    try {
      // Find or create the scraper EPG source
      // Use the internal scraper URL (http://epg:3000/guide.xml) so backend can fetch it directly
      const scraperUrl = 'http://epg:3000/guide.xml';
      let src = epgSources.find(s => s.name === 'iptv-org/epg (scraper)');
      if (!src) {
        src = await epgApi.create({
          name: 'iptv-org/epg (scraper)',
          url: scraperUrl,
        });
      } else if (src.url !== scraperUrl && src.url?.includes('api/scraper')) {
        // Update to use direct URL if it was set to the proxy URL
        await epgApi.update(src.id, { url: scraperUrl });
        src = { ...src, url: scraperUrl };
      }
      setLogs(prev => [...prev, { type: 'log', msg: 'Fetching guide into Stationarr...' }]);
      const res = await epgApi.fetch(src.id);
      const programmeCount = Number.isFinite(res?.programme_count) ? res.programme_count : null;
      setLogs(prev => [...prev, { type: 'done', msg: `✓ Done! Loaded ${res.loaded} channels into Stationarr EPG cache${programmeCount !== null ? ` (${programmeCount} programme entries).` : '.'}` }]);
      if (programmeCount === 0) {
        setLogs(prev => [...prev,
          { type: 'warning', msg: 'Scraper ran, but no programmes were found for the selected channels/source.' },
          { type: 'warning', msg: 'Try another scraper source/site for this channel.' },
        ]);
      }
      load();
    } catch (e) {
      const friendly = e.message?.includes('NO_SCRAPER_CHANNELS')
        ? 'No guide was generated because no scraper channels are selected. Add and enable channels, then run again.'
        : `Could not auto-fetch guide: ${e.message}`;
      setLogs(prev => [...prev, { type: 'error', msg: friendly }]);
    }
  };

  const addAsEPGSource = async () => {
    const existing = epgSources.find(s => s.name === 'iptv-org/epg (scraper)');
    if (existing) return toast('Already added as EPG source', 'info');
    try {
      await epgApi.create({ name: 'iptv-org/epg (scraper)', url: 'http://epg:3000/guide.xml' });
      toast('Added as EPG source', 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const search = async () => {
    setSearching(true); setResults(null);
    try { setResults(await api.search(query, country)); }
    catch (e) { toast(e.message, 'error'); }
    finally { setSearching(false); }
  };

  const addChannel = async (ch, site) => {
    try {
      await api.addChannel({
        xmltv_id: ch.id,
        site:     site.site,
        channel_id: ch.id,
        name:     ch.name,
        lang:     ch.languages?.split(';')[0]?.trim() || 'en',
      });
      toast(`Added ${ch.name}`, 'success');
      setPickingSite(null);
      load();
    } catch (e) { toast(e.message, 'error'); }
  };

  const removeChannel = async (id, name) => {
    try { await api.removeChannel(id); toast(`Removed ${name}`, 'success'); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const toggleChannel = async (id, enabled) => {
    try { await api.toggleChannel(id, { enabled: !enabled }); load(); }
    catch (e) { toast(e.message, 'error'); }
  };

  const scraperSource = epgSources.find(s => s.name === 'iptv-org/epg (scraper)');
  const enabledCount  = channels.filter(c => c.enabled).length;
  const noConfiguredChannels = Boolean(status?.no_channels_configured ?? (enabledCount === 0));
  const availSites    = sites.filter(s => !country || s.countries.includes(country));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => nav('/settings')}><ArrowLeft size={15}/></button>
        <Tv size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700 }}>Station<span style={{ color: 'var(--accent)' }}>arr</span></span>
        <span className="text-muted" style={{ marginLeft: 4 }}>/ EPG Scraper</span>
        <div style={{ flex: 1 }} />
        {status !== null && (
          status.online
            ? <span className="badge badge-green"><CheckCircle size={10}/> Scraper online</span>
            : <span className="badge badge-muted"><XCircle size={10}/> Scraper offline</span>
        )}
        <ThemeToggle />
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')}><Settings size={13}/></button>
          <HeaderButtons />
        <button className="btn btn-ghost btn-sm" onClick={load}><RefreshCw size={12}/></button>
      </header>

      <main style={{ flex: 1, maxWidth: 900, width: '100%', margin: '0 auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Status + Run card */}
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ flex: 1 }}>
              {status?.online ? (
                <>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Scraper is ready</p>
                  <p className="text-sm text-muted">
                    {noConfiguredChannels
                      ? 'No scraper channels are currently configured in channels.xml. Add and enable channels before running the scraper.'
                      : `${enabledCount} channel${enabledCount !== 1 ? 's' : ''} configured. Click Run to fetch latest EPG data. Note: only selected scraper channels are included in generated guide data.`}
                  </p>
                </>
              ) : (
                <>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Scraper container is not running</p>
                  <p className="text-sm text-muted">Enable the <span className="mono">epg:</span> service in docker-compose.yml and run <span className="mono">docker compose up -d</span></p>
                </>
              )}
            </div>
            <button
              className="btn btn-primary"
              disabled={!status?.online || running || noConfiguredChannels}
              onClick={runScraper}
              style={{ flexShrink: 0, minWidth: 120, justifyContent: 'center' }}
            >
              {running
                ? <><RefreshCw size={14} style={{ animation: 'spin 1s linear infinite' }}/> Running…</>
                : <><Play size={14}/> Run now</>
              }
            </button>
          </div>


          {status?.online && noConfiguredChannels && (
            <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 8, background: 'color-mix(in oklab, var(--yellow) 14%, var(--surface))', border: '1px solid color-mix(in oklab, var(--yellow) 30%, var(--border2))' }}>
              <p className="text-sm" style={{ color: 'var(--text)', margin: 0 }}>
                ⚠ No scraper channels are selected. The sidecar can run, but it will produce no guide and <span className="mono">/guide.xml</span> may return 404 until channels are added.
              </p>
            </div>
          )}

          {runDone && !running && (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p className="text-sm text-green">✓ EPG data fetched and cached in Stationarr</p>
              <button className="btn btn-sm" onClick={() => nav('/settings', { state: { openEpgSources: true } })}>Go to EPG Sources →</button>
            </div>
          )}
        </div>

        <div className="card" style={{ background: 'var(--surface2)' }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>How the EPG scraper works</p>
          <ol className="text-sm text-muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>Add scraper channels from a supported source/site.</li>
            <li>Run the scraper now, or let the sidecar run on its own cron schedule.</li>
            <li>Stationarr fetches and caches <span className="mono">guide.xml</span> into EPG Sources.</li>
            <li>Match playlist channels to EPG IDs.</li>
            <li>Open the Guide.</li>
          </ol>
          <div style={{ marginTop: 10, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            <p>• EPG source auto-refresh is handled by Stationarr’s scheduler.</p>
            <p>• The sidecar scraper cron is separate from Stationarr scheduling.</p>
            <p>• Immediate <strong style={{ color: 'var(--text)' }}>Run now</strong> from Stationarr requires Docker socket access.</p>
            <p>• EPG sources with auto-refresh enabled are checked by Stationarr’s scheduler.</p>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>
            <p>Troubleshooting:</p>
            <p>• <strong style={{ color: 'var(--text)' }}>0 channels</strong> means no scraper channels are selected.</p>
            <p>• <strong style={{ color: 'var(--text)' }}>0 programmes</strong> means the source/site returned no programme data, or the scraper channel definition may be invalid.</p>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border2)' }}>
          {[
            ['channels', `My channels (${channels.length})`],
            ['search',   'Add channels'],
            ['run',      'Run log'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '10px 18px', fontSize: 13, fontWeight: 500, border: 'none',
              background: 'transparent', cursor: 'pointer',
              color: tab === key ? 'var(--text)' : 'var(--muted)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}>{label}</button>
          ))}
        </div>

        {/* ── My channels ── */}
        {tab === 'channels' && (
          channels.length === 0 ? (
            <div className="empty-state">
              <Rss size={36}/>
              <p>No channels added yet</p>
              <p className="text-sm text-faint">Search for channels in the "Add channels" tab</p>
              <button className="btn btn-primary" onClick={() => setTab('search')}><Plus size={13}/> Add channels</button>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <p className="text-sm text-muted">{enabledCount} of {channels.length} enabled</p>
                <button className="btn btn-sm" onClick={() => setTab('search')}><Plus size={12}/> Add more</button>
              </div>
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>TVG ID</th>
                      <th>Scraper site</th>
                      <th style={{ width: 60, textAlign: 'center' }}>Active</th>
                      <th style={{ width: 40 }}/>
                    </tr>
                  </thead>
                  <tbody>
                    {channels.map(ch => (
                      <tr key={ch.id} style={{ opacity: ch.enabled ? 1 : 0.5 }}>
                        <td style={{ fontWeight: 500 }}>{ch.name}</td>
                        <td className="mono text-xs text-muted">{ch.xmltv_id}</td>
                        <td className="text-xs text-muted">{ch.site}</td>
                        <td style={{ textAlign: 'center' }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => toggleChannel(ch.id, ch.enabled)}>
                            {ch.enabled ? <Eye size={13} color="var(--blue)"/> : <EyeOff size={13} color="var(--faint)"/>}
                          </button>
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-icon btn-sm btn-danger" onClick={() => removeChannel(ch.id, ch.name)}>
                            <Trash2 size={12}/>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )
        )}

        {/* ── Add channels ── */}
        {tab === 'search' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <select className="input" value={country} onChange={e => setCountry(e.target.value)} style={{ width: 180 }}>
                {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
              <div className="flex gap-1" style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
                <Search size={13} color="var(--faint)"/>
                <input value={query} onChange={e => setQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && search()}
                  placeholder="Search by channel name…"
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, width: '100%', fontFamily: 'inherit' }}/>
              </div>
              <button className="btn btn-primary" onClick={search} disabled={searching}>
                <Search size={13}/> {searching ? 'Searching…' : 'Search'}
              </button>
            </div>

            {results === null && !searching && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px', fontSize: 13, color: 'var(--muted)', lineHeight: 1.8 }}>
                <p style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>How this works</p>
                <p>1. Search for your channel name and select it</p>
                <p>2. Pick which scraper site to use (use the one for your country)</p>
                <p>3. Once you've added all your channels, click <strong style={{ color: 'var(--text)' }}>Run now</strong> at the top</p>
                <p>4. Stationarr fetches the EPG data and caches it automatically — no terminal needed</p>
                <p>5. Important: adding one scraper channel only fetches guide data for that specific selected channel.</p>
              </div>
            )}

            {searching && <p className="text-sm text-muted">Searching iptv-org channel database…</p>}

            {results !== null && results.length === 0 && (
              <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px' }}>
                <p className="text-sm text-muted" style={{ marginBottom: 6 }}>No results for <strong style={{ color: 'var(--text)' }}>{query}</strong> in {COUNTRIES.find(c=>c.code===country)?.label}.</p>
                <p className="text-xs text-faint">Tips: try a shorter name, try a different country, or check the channel's tvg-id in your playlist editor.</p>
              </div>
            )}

            {results && results.length > 0 && (
              <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Channel</th>
                      <th>ID</th>
                      <th>Country</th>
                      <th style={{ width: 100 }}/>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((ch, i) => {
                      const added = channels.some(c => c.xmltv_id === ch.id);
                      return (
                        <tr key={i}>
                          <td>
                            <div className="flex gap-2">
                              {ch.logo && <img src={ch.logo} alt="" style={{ height: 20, maxWidth: 36, objectFit: 'contain' }} onError={e => e.target.style.display='none'}/>}
                              <span style={{ fontWeight: 500 }}>{ch.name}</span>
                            </div>
                          </td>
                          <td className="mono text-xs text-muted">{ch.id}</td>
                          <td className="text-xs text-muted">{ch.country}</td>
                          <td>
                            {added
                              ? <span className="badge badge-green" style={{ fontSize: 11 }}>✓ Added</span>
                              : <button className="btn btn-primary btn-sm" onClick={() => setPickingSite(ch)}><Plus size={12}/> Add</button>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Run log ── */}
        {tab === 'run' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {logs.length === 0 ? (
              <div className="empty-state">
                <Terminal size={32}/>
                <p>No run yet</p>
                <p className="text-sm text-faint">Add and enable at least one scraper channel, then click Run now</p>
              </div>
            ) : (
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '12px 14px', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.8, maxHeight: 500, overflowY: 'auto', border: '1px solid var(--border)' }}>
                {logs.map((log, i) => (
                  <div key={i} style={{
                    color: log.type === 'error' ? 'var(--red)'
                         : log.type === 'done'  ? 'var(--green)'
                         : log.type === 'warning' ? 'var(--yellow)'
                         : 'var(--text)',
                  }}>
                    {log.msg}
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            )}
            {running && (
              <p className="text-sm text-muted">
                <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite', marginRight: 6 }}/>
                Scraper is running… this may take a few minutes
              </p>
            )}
            {runDone && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary" onClick={() => nav('/settings', { state: { openEpgSources: true } })}>Go to EPG Sources →</button>
                <button className="btn" onClick={runScraper}><Play size={12}/> Run again</button>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Site picker modal */}
      {pickingSite && (
        <SitePicker
          channel={pickingSite}
          sites={availSites}
          onAdd={(site) => addChannel(pickingSite, site)}
          onClose={() => setPickingSite(null)}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function SitePicker({ channel, sites, onAdd, onClose }) {
  const [adding, setAdding] = useState(null);

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ maxWidth: 460 }}>
        <div className="modal-header">
          <div>
            <h2>Choose scraper site</h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>for <strong>{channel.name}</strong> ({channel.id})</p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p className="text-sm text-muted">Select which website the scraper will use to get programme listings for this channel.</p>

          {sites.length === 0 ? (
            <p className="text-sm text-faint">No known sites for this country. Try selecting a different country in search.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sites.map((site, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{site.label}</p>
                    <p className="text-xs mono text-faint">{site.site}</p>
                  </div>
                  <button className="btn btn-primary btn-sm"
                    disabled={adding === site.site}
                    onClick={async () => { setAdding(site.site); await onAdd(site); }}>
                    {adding === site.site ? 'Adding…' : 'Use this site'}
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)' }}>
            Not sure which site to use? Pick the one matching your country. You can always remove and re-add the channel with a different site if EPG data doesn't appear.
          </div>
        </div>
      </div>
    </div>
  );
}
