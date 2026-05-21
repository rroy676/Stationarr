import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import HeaderButtons from '../components/HeaderButtons.jsx';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Clock, Tv, ChevronLeft, ChevronRight, Search, X, Layers, List, Settings } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import { guide as guideApi, playlists as plApi, channels as chApi } from '../api.js';
import { useToast } from '../context.jsx';
import { useTZ } from '../timezone.jsx';

const HOUR_WIDTH  = 260;
const ROW_HEIGHT  = 54;
const LABEL_WIDTH = 190;
const DEFAULT_WINDOW_HOURS = 24;
const GUIDE_VIEW_HOURS = 6;

export default function Guide() {
  const { id }    = useParams();
  const nav       = useNavigate();
  const toast     = useToast();
  const { fmtTime, fmtDate, toTZ } = useTZ();
  const scrollRef  = useRef();
  const labelsRef  = useRef();

  const [playlists,  setPlaylists]  = useState([]);
  const [playlist,   setPlaylist]   = useState(null);
  const [data,       setData]       = useState(null);
  const [channelsData,setChannelsData]= useState([]);
  const [paging,     setPaging]     = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [groupFilter,setGroupFilter]= useState('__all__');
  const [search,     setSearch]     = useState('');
  const [windowHours,setWindowHours]= useState(DEFAULT_WINDOW_HOURS);
  const [loading,    setLoading]    = useState(true);
  const [selected,   setSelected]   = useState(null);
  const [now,        setNow]        = useState(new Date());
  const [tsEdit,     setTsEdit]     = useState(null);   // { channelId, current }
  const [savingTs,   setSavingTs]   = useState(false);

  // View window start — defaults to 30min before now
  const [viewStart, setViewStart]   = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() - 30, 0, 0); return d;
  });

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Load playlists list for switcher
  useEffect(() => {
    plApi.list().then(setPlaylists).catch(() => {});
  }, []);

  const load = useCallback(async (playlistId, targetPage = 1, append = false) => {
    setLoading(true);
    try {
      const start = viewStart.toISOString();
      const end = new Date(viewStart.getTime() + windowHours * 3600000).toISOString();
      const [pl, guideData] = await Promise.all([
        plApi.get(playlistId),
        guideApi.load(playlistId, { page: targetPage, page_size: paging.pageSize, group: groupFilter, q: search, start, end }),
      ]);
      setPlaylist(pl);
      setData(guideData);
      setChannelsData(prev => append ? [...prev, ...(guideData.channels || [])] : (guideData.channels || []));
      setPaging(p => ({ ...p, total: guideData.total || 0, totalPages: guideData.total_pages || 1, page: guideData.page || targetPage }));
    } catch (e) { toast(e.message, 'error'); }
    finally { setLoading(false); }
  }, [paging.pageSize, groupFilter, search, viewStart, windowHours, toast]);

  useEffect(() => { setPaging(p => ({ ...p, page: 1 })); load(id, 1, false); }, [id, groupFilter, search, viewStart, windowHours, paging.pageSize]);


  // Scroll to now after load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      setTimeout(() => {
        const x = timeToX(now, viewStart) - 100;
        scrollRef.current.scrollLeft = Math.max(0, x);
      }, 100);
    }
  }, [loading]);

  const viewEnd = useMemo(() => new Date(viewStart.getTime() + GUIDE_VIEW_HOURS * 3600000), [viewStart]);

  function timeToX(date, base = viewStart) {
    return ((date - base) / 3600000) * HOUR_WIDTH;
  }

  // Time slots every 30 min
  const timeSlots = useMemo(() => {
    const slots = [];
    const t = new Date(viewStart);
    t.setMinutes(Math.ceil(t.getMinutes() / 30) * 30, 0, 0);
    while (t < viewEnd) { slots.push(new Date(t)); t.setMinutes(t.getMinutes() + 30); }
    return slots;
  }, [viewStart, viewEnd]);

  // Day boundaries within view — for date headers
  const dayBoundaries = useMemo(() => {
    const days = [];
    const t = new Date(viewStart);
    t.setHours(24, 0, 0, 0); // next midnight
    while (t < viewEnd) { days.push(new Date(t)); t.setDate(t.getDate() + 1); }
    return days;
  }, [viewStart, viewEnd]);

  const nowX   = timeToX(now);
  const totalW = GUIDE_VIEW_HOURS * HOUR_WIDTH;

  const shiftView   = (h) => setViewStart(v => new Date(v.getTime() + h * 3600000));
  const jumpToDay   = (offset) => {
    const d = new Date(); d.setDate(d.getDate() + offset);
    d.setHours(d.getHours(), d.getMinutes() - 30, 0, 0);
    setViewStart(d);
  };
  const jumpToNow   = () => {
    const d = new Date(); d.setMinutes(d.getMinutes() - 30, 0, 0); setViewStart(d);
  };

  // Filtered channels
  const channels = useMemo(() => channelsData, [channelsData]);

  const groups = useMemo(() => data?.groups || [], [data]);

  // Save timeshift from guide
  const saveTimeshift = async (channelId, ts) => {
    setSavingTs(true);
    try {
      await chApi.update(channelId, { timeshift: ts });
      setData(d => ({
        ...d,
        channels: d.channels.map(c => c.id === channelId ? { ...c, timeshift: ts } : c),
      }));
      setTsEdit(null);
      toast('Timeshift saved', 'success');
    } catch (e) { toast(e.message, 'error'); }
    finally { setSavingTs(false); }
  };

  const syncScroll = (e) => {
    if (labelsRef.current) labelsRef.current.scrollTop = e.currentTarget.scrollTop;
  };

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 12px', height: 52, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => nav(`/edit/${id}`)}><ArrowLeft size={15}/></button>
        <Tv size={15} color="var(--accent)" />

        {/* Playlist switcher */}
        <select className="input" value={id} onChange={e => nav(`/guide/${e.target.value}`)}
          style={{ width: 180, fontSize: 13, padding: '4px 8px' }}>
          {playlists.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>

        <span className="text-muted text-sm" style={{ flexShrink: 0 }}>TV Guide</span>
        <div style={{ flex: 1 }} />

        {/* Search */}
        <div className="flex gap-1" style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 8px', width: 200 }}>
          <Search size={12} color="var(--faint)" />
          <input value={search} onChange={e => { setSearch(e.target.value); }} placeholder="Search channel or show…"
            style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, width: '100%', fontFamily: 'inherit' }} />
          {search && <button onClick={() => { setSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--faint)' }}><X size={11}/></button>}
        </div>

        {/* Group filter */}
        <select className="input" value={groupFilter} onChange={e => { setGroupFilter(e.target.value); }}
          style={{ width: 150, fontSize: 12, padding: '4px 8px' }}>
          <option value="__all__">All groups</option>
          {groups.map(g => <option key={g.name} value={g.name}>{g.name} ({g.count})</option>)}
        </select>

        {/* Day navigation */}
        <div className="flex gap-1">
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => jumpToDay(0)}>Today</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => jumpToDay(1)}>Tomorrow</button>
          <button className="btn btn-ghost btn-sm" style={{ fontSize: 11 }} onClick={() => jumpToDay(2)}>{dayLabel(2)}</button>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={jumpToNow}><Clock size={12}/> Now</button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => shiftView(-1)}><ChevronLeft size={14}/></button>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => shiftView(1)}><ChevronRight size={14}/></button>

        <span className="text-muted text-sm">Showing {channels.length === 0 ? 0 : 1}-{channels.length} of {paging.total.toLocaleString()}</span>
        <select className="input" title="Batch size" value={paging.pageSize} onChange={e => setPaging(p => ({ ...p, pageSize: Number(e.target.value) }))}
          style={{ width: 80, fontSize: 12, padding: '4px 8px' }}>
          {[25,50,100,200].map(sz => <option key={sz} value={sz}>{sz}</option>)}
        </select>
        <button className="btn btn-ghost btn-sm" disabled={loading || paging.page >= paging.totalPages} onClick={() => load(id, paging.page + 1, true)}>Load more</button>

        <select className="input" value={windowHours} onChange={e => { setWindowHours(Number(e.target.value)); }} style={{ width: 90, fontSize: 12, padding: "4px 8px" }}><option value={12}>12h</option><option value={24}>24h</option></select>
        <ThemeToggle />
        <button className="btn btn-ghost btn-sm" onClick={() => nav('/settings')}><Settings size={13}/></button>
          <HeaderButtons />
        <button className="btn btn-ghost btn-icon btn-sm" title="Refresh" onClick={() => load(id, 1, false)}><RefreshCw size={13}/></button>
      </header>


      {data?.guide_index?.building > 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border2)' }}>
          Guide index is building. The first load after an EPG update may be slower. The Guide will be faster once indexing is complete. ({data.guide_index.building}/{data.guide_index.total} sources)
        </div>
      )}
      {data?.guide_index?.failed > 0 && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: '#ff9b9b', borderBottom: '1px solid var(--border2)' }}>
          Guide index failed for one or more sources. Check logs. {data.guide_index.last_error ? `Last error: ${data.guide_index.last_error}` : ''}
        </div>
      )}

      {loading ? (
        <div style={{ padding: 32, color: 'var(--muted)' }}>Loading guide…</div>
      ) : channels.length === 0 ? (
        <div className="empty-state">
          <Tv size={40}/>
          <p>{search || groupFilter !== '__all__' ? 'No channels match your filter' : 'No EPG data available'}</p>
          {!search && groupFilter === '__all__' && <p className="text-sm text-faint">Map EPG IDs to channels and cache your EPG source first</p>}
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Fixed channel labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0, borderRight: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ height: 40, borderBottom: '1px solid var(--border2)', flexShrink: 0, background: 'var(--surface)' }} />
            <div ref={labelsRef} style={{ flex: 1, overflowY: 'hidden' }}>
              {channels.map(ch => (
                <div key={ch.id} style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px', borderBottom: '1px solid var(--border2)', flexShrink: 0 }}>
                  {ch.tvg_logo
                    ? <img src={ch.tvg_logo} alt="" style={{ width: 34, height: 24, objectFit: 'contain', borderRadius: 3, flexShrink: 0, background: 'var(--surface2)' }} onError={e => e.target.style.display='none'} />
                    : <div style={{ width: 34, height: 24, background: 'var(--surface2)', borderRadius: 3, flexShrink: 0 }} />
                  }
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.name}</p>
                    {ch.timeshift ? <p style={{ fontSize: 10, color: 'var(--accent)' }}>{ch.timeshift > 0 ? '+' : ''}{ch.timeshift}min</p> : null}
                  </div>
                  <button className="btn btn-ghost btn-icon" style={{ padding: 3, flexShrink: 0, opacity: 0.5 }}
                    title="Adjust timeshift" onClick={() => setTsEdit({ channelId: ch.id, name: ch.name, current: ch.timeshift || 0 })}>
                    <Clock size={11}/>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable grid */}
          <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'auto', position: 'relative' }} onScroll={syncScroll}>
            <div style={{ width: totalW, minHeight: '100%', position: 'relative' }}>
              {/* Time axis */}
              <div style={{ height: 40, position: 'sticky', top: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border2)', zIndex: 10 }}>
                {/* Date headers at day boundaries */}
                {dayBoundaries.map((d, i) => (
                  <div key={i} style={{ position: 'absolute', left: timeToX(d), top: 0, bottom: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, zIndex: 2 }}>
                    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', fontSize: 11, fontWeight: 600, color: 'var(--accent)', whiteSpace: 'nowrap' }}>
                      {fmtDate(d)}
                    </div>
                  </div>
                ))}

                {timeSlots.map((t, i) => {
                  const isDayBoundary = t.getHours() === 0 && t.getMinutes() === 0;
                  return (
                    <div key={i} style={{ position: 'absolute', left: timeToX(t) }}>
                      <div style={{ paddingLeft: 6, paddingTop: 6, fontSize: 11, color: isDayBoundary ? 'var(--accent)' : 'var(--muted)', fontWeight: isDayBoundary ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {fmtTime(t)}
                      </div>
                      <div style={{ position: 'absolute', top: 0, left: 0, bottom: -9999, width: isDayBoundary ? 2 : 1, background: isDayBoundary ? 'rgba(240,165,0,0.3)' : 'var(--border2)' }} />
                    </div>
                  );
                })}
              </div>

              {/* Now line */}
              {nowX >= 0 && nowX <= totalW && (
                <div style={{ position: 'absolute', left: nowX, top: 40, bottom: 0, width: 2, background: 'var(--accent)', zIndex: 5, pointerEvents: 'none' }}>
                  <div style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%', marginLeft: -3, marginTop: -4 }} />
                </div>
              )}

              {/* Rows */}
              {channels.map(ch => (
                <ChannelRow key={ch.id} ch={ch} timeToX={timeToX} totalW={totalW} now={now}
                  viewStart={viewStart} viewEnd={viewEnd} fmtTime={fmtTime}
                  search={search}
                  onSelect={prog => setSelected({ ...prog, ch })} />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Programme detail */}
      {selected && (
        <div style={{ position: 'fixed', right: 0, top: 52, bottom: 0, width: 290, background: 'var(--surface)', borderLeft: '1px solid var(--border2)', padding: 16, overflowY: 'auto', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 15, marginBottom: 2 }}>{selected.title}</p>
              {selected.subtitle && <p className="text-sm text-muted">{selected.subtitle}</p>}
            </div>
            <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setSelected(null)}><X size={14}/></button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <span className="badge badge-muted">{selected.ch.name}</span>
            {selected.category && <span className="badge badge-blue">{selected.category}</span>}
          </div>
          <p style={{ fontSize: 13, color: 'var(--muted)' }}>
            {fmtTime(selected.start)} – {fmtTime(selected.stop)}
            {' · '}{fmtDate(selected.start)}
          </p>
          {selected.desc && <p style={{ fontSize: 13, lineHeight: 1.6 }}>{selected.desc}</p>}
        </div>
      )}

      {/* Timeshift edit overlay */}
      {tsEdit && (
        <div className="modal-overlay">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>Timeshift — {tsEdit.name}</h2>
              <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setTsEdit(null)}><X size={14}/></button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted">Shift EPG programme times for this channel. Positive = later, negative = earlier.</p>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input type="range" min={-240} max={240} step={30} value={tsEdit.current}
                  onChange={e => setTsEdit(t => ({ ...t, current: Number(e.target.value) }))} style={{ flex: 1 }} />
                <input type="number" value={tsEdit.current}
                  onChange={e => setTsEdit(t => ({ ...t, current: Number(e.target.value) }))}
                  style={{ width: 60, padding: '4px 6px', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 13, textAlign: 'center' }} />
                <span className="text-muted text-sm">min</span>
              </div>
              <p className="text-xs text-muted">
                {tsEdit.current === 0 ? 'No offset' : `${tsEdit.current > 0 ? '+' : ''}${tsEdit.current} minutes`}
              </p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={savingTs} onClick={() => saveTimeshift(tsEdit.channelId, tsEdit.current)}>
                  {savingTs ? 'Saving…' : 'Save'}
                </button>
                {tsEdit.current !== 0 && (
                  <button className="btn btn-sm" onClick={() => setTsEdit(t => ({ ...t, current: 0 }))}>Reset to 0</button>
                )}
                <button className="btn btn-sm" onClick={() => setTsEdit(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ChannelRow({ ch, timeToX, totalW, now, viewStart, viewEnd, fmtTime, onSelect, search }) {
  const progs = ch.programmes || [];
  const ts    = ch.timeshift || 0;

  return (
    <div style={{ height: ROW_HEIGHT, position: 'relative', borderBottom: '1px solid var(--border2)' }}>
      {progs.map((p, i) => {
        if (!p.start || !p.stop) return null;
        const start = new Date(new Date(p.start).getTime() + ts * 60000);
        const stop  = new Date(new Date(p.stop).getTime()  + ts * 60000);
        if (stop <= viewStart || start >= viewEnd) return null;

        const x  = Math.max(0, timeToX(start));
        const xe = Math.min(totalW, timeToX(stop));
        const w  = xe - x;
        if (w < 4) return null;

        const isNow    = start <= now && stop > now;
        const pct      = isNow ? Math.min(100, ((now - start) / (stop - start)) * 100) : 0;
        const isMatch  = search && p.title?.toLowerCase().includes(search.toLowerCase());

        return (
          <div key={i} onClick={() => onSelect({ ...p, start, stop })}
            style={{
              position: 'absolute', left: x + 1, width: w - 2, top: 4, bottom: 4,
              borderRadius: 5, overflow: 'hidden', cursor: 'pointer',
              background: isMatch ? 'rgba(88,166,255,0.15)' : isNow ? 'rgba(240,165,0,0.12)' : 'var(--surface2)',
              border: isMatch ? '1px solid rgba(88,166,255,0.5)' : isNow ? '1px solid rgba(240,165,0,0.35)' : '1px solid var(--border)',
              display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 8px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => e.currentTarget.style.filter = 'brightness(1.15)'}
            onMouseLeave={e => e.currentTarget.style.filter = ''}
          >
            {isNow && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, background: 'rgba(240,165,0,0.1)' }} />}
            <p style={{ fontSize: 12, fontWeight: isNow ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', position: 'relative' }}>{p.title}</p>
            {w > 110 && <p style={{ fontSize: 10, color: 'var(--muted)', position: 'relative' }}>{fmtTime(start)} – {fmtTime(stop)}</p>}
          </div>
        );
      })}
      {progs.length === 0 && (
        <div style={{ position: 'absolute', inset: '4px 1px', borderRadius: 5, background: 'var(--surface2)', display: 'flex', alignItems: 'center', paddingLeft: 10 }}>
          <span style={{ fontSize: 11, color: 'var(--faint)' }}>{ch.epg_id ? 'No data' : 'No EPG'}</span>
        </div>
      )}
    </div>
  );
}

function dayLabel(offset) {
  const d = new Date(); d.setDate(d.getDate() + offset);
  return d.toLocaleDateString([], { weekday: 'short' });
}
