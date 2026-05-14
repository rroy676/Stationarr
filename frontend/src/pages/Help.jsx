import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronRight, Tv, List, Radio, Rss, Tv2 } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle.jsx';
import HeaderButtons from '../components/HeaderButtons.jsx';

const sections = [
  {
    id: 'getting-started',
    icon: <Tv size={16} />,
    title: 'Getting Started',
    steps: [
      {
        heading: '1. Create your first playlist',
        body: 'From the Dashboard, click New playlist and give it a name (e.g. "My IPTV"). A playlist is a container for your channels — you can have multiple playlists for different providers or device setups.',
      },
      {
        heading: '2. Import channels',
        body: 'Open the playlist and click Import. Paste your M3U URL or upload an M3U file. Stationarr will pull in all channels and group them automatically. You can also connect directly using an Xtream Codes provider login.',
      },
      {
        heading: '3. Match EPG data',
        body: 'Go to the EPG tab, add your XMLTV source URL, and click Fetch & cache. Then click Auto-match to automatically link channels to their guide data. You can also match manually per-channel.',
      },
      {
        heading: '4. Get your serve URLs',
        body: 'Click the Serve button on any playlist to see your personal M3U and EPG URLs. These are the URLs you paste into your media player or DVR app.',
      },
    ],
  },
  {
    id: 'importing',
    icon: <List size={16} />,
    title: 'Importing Playlists & Channels',
    steps: [
      {
        heading: 'M3U URL import',
        body: 'In the playlist editor, click Import → URL. Paste your provider\'s M3U link and click Fetch. Stationarr downloads and parses the playlist server-side, so large files (50,000+ channels) work fine. Enable Auto-refresh in playlist settings to keep channels in sync on a schedule.',
      },
      {
        heading: 'M3U file upload',
        body: 'Click Import → File and select a local .m3u or .m3u8 file. The file is parsed immediately — no server-side download needed.',
      },
      {
        heading: 'Xtream Codes / provider login',
        body: 'Click Import → Xtream and enter your provider\'s server address, username, and password. Stationarr fetches all streams directly using the Xtream API. You can save these credentials in playlist settings for auto-refresh.',
      },
      {
        heading: 'Organising channels',
        body: 'Use the group sidebar to filter by category. Drag rows to reorder channels, or use the bulk toolbar to enable/disable, move to group, or delete multiple channels at once. Changes only affect your Stationarr copy — the source playlist is untouched.',
      },
      {
        heading: 'Duplicate & filter',
        body: 'On the Dashboard, use Duplicate to clone a playlist, or Create filtered copy to make a new playlist containing only channels that match a keyword or group. Useful for creating a "Sports only" or "Kids" playlist from your main one.',
      },
    ],
  },
  {
    id: 'epg',
    icon: <Rss size={16} />,
    title: 'EPG Setup & Matching',
    steps: [
      {
        heading: 'Add an EPG source',
        body: 'In the playlist editor, go to the EPG tab and click Add source. Enter a name and your XMLTV URL (e.g. from a provider or a scraper). Click Fetch & cache — Stationarr downloads the file once and stores it locally. Large files are handled with streaming so memory usage stays low.',
      },
      {
        heading: 'Auto-match channels',
        body: 'Once a source is cached, click Auto-match. Stationarr tries to match each channel to an EPG entry using the tvg-id, then normalised channel name, then fuzzy name matching (ignoring HD/SD suffixes, country codes, etc.). Matched channels show guide data in the Guide view immediately.',
      },
      {
        heading: 'Manual matching',
        body: 'For channels that didn\'t auto-match, click a channel row to open the Channel panel. Use the EPG search box to find the right entry and click it to assign. You can also set a backup EPG source per channel — useful when a primary source has gaps.',
      },
      {
        heading: 'Timeshift / offset',
        body: 'If a channel\'s guide data is offset by a fixed number of hours (common with regional variants), set the Timeshift field in the channel panel. Enter a positive or negative number of minutes. The EPG output adjusts all programme times accordingly.',
      },
      {
        heading: 'Auto-refresh EPG',
        body: 'In the EPG source settings, enable Auto-refresh and set an interval. Stationarr will re-fetch and re-cache the XMLTV file on a schedule so your guide data stays current without manual intervention.',
      },
      {
        heading: 'ChannelsDVR setup',
        body: 'In ChannelsDVR, add a new source and choose M3U Playlist. Enter your Stationarr M3U URL. For guide data, add your Stationarr EPG URL as a separate guide data source. ChannelsDVR matches channels by tvg-id — make sure your channels have EPG entries assigned in Stationarr for guide data to appear.',
      },
    ],
  },
  {
    id: 'serving',
    icon: <Tv2 size={16} />,
    title: 'Serving to Players',
    steps: [
      {
        heading: 'Your serve URLs',
        body: 'Click Serve on any playlist. You\'ll see two URLs: a playlist M3U URL and an EPG XML URL. These are public — no login required — so you can paste them directly into any player. The slug in the URL is unique to your playlist.',
      },
      {
        heading: 'ChannelsDVR',
        body: 'Settings → Sources → Add Source → M3U Playlist. Paste the M3U URL. For EPG, go to Settings → Guide → Add Guide Source and paste the EPG URL. ChannelsDVR will refresh guide data automatically.',
      },
      {
        heading: 'TiviMate',
        body: 'In TiviMate, go to Add Playlist → M3U URL, paste your playlist URL. For EPG, go to the playlist settings → EPG source and paste the EPG URL.',
      },
      {
        heading: 'Kodi (PVR IPTV Simple)',
        body: 'In Kodi, install the PVR IPTV Simple Client add-on. In its settings, set M3U Playlist URL to your playlist URL and XMLTV URL to your EPG URL. Kodi downloads both on startup.',
      },
      {
        heading: 'VLC / direct stream',
        body: 'Open VLC, go to Media → Open Network Stream, and paste your M3U URL. VLC will show all channels as a playlist. EPG is not supported in VLC.',
      },
      {
        heading: 'Access from other devices',
        body: 'The serve URLs use the BASE_URL you set during setup (or in Settings). Make sure this points to your Stationarr server\'s accessible address — e.g. http://192.168.1.x:3000 for local network, or your domain if publicly accessible. Devices on a different network won\'t be able to reach a local IP.',
      },
    ],
  },
];

export default function Help() {
  const nav = useNavigate();
  const [open, setOpen] = useState({ 'getting-started': true });

  const toggle = (id) => setOpen(o => ({ ...o, [id]: !o[id] }));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 16 }}>
        <div className="flex gap-2" style={{ flex: 1 }}>
          <Tv size={18} color="var(--accent)" />
          <span style={{ fontWeight: 700, letterSpacing: '-0.01em' }}>Station<span style={{ color: 'var(--accent)' }}>arr</span></span>
        </div>
        <div className="flex gap-2">
          <ThemeToggle />
          <HeaderButtons />
          <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}>
            <ArrowLeft size={14} /> Back
          </button>
        </div>
      </header>

      <main style={{ flex: 1, maxWidth: 760, width: '100%', margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ marginBottom: 28 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700 }}>Help & Documentation</h1>
          <p className="text-muted text-sm" style={{ marginTop: 4 }}>
            Everything you need to set up and use Stationarr.
          </p>
        </div>

        {/* Quick nav */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
          {sections.map(s => (
            <button
              key={s.id}
              className="btn btn-sm"
              onClick={() => {
                setOpen(o => ({ ...o, [s.id]: true }));
                setTimeout(() => document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
              }}
            >
              {s.icon} {s.title}
            </button>
          ))}
        </div>

        {/* Sections */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {sections.map(s => (
            <div key={s.id} id={s.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Section header */}
              <button
                onClick={() => toggle(s.id)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  padding: '14px 16px', background: 'none', border: 'none',
                  cursor: 'pointer', color: 'var(--text)', textAlign: 'left',
                }}
              >
                <span style={{ color: 'var(--accent)' }}>{s.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 15, flex: 1 }}>{s.title}</span>
                {open[s.id]
                  ? <ChevronDown size={15} color="var(--muted)" />
                  : <ChevronRight size={15} color="var(--muted)" />
                }
              </button>

              {/* Section body */}
              {open[s.id] && (
                <div style={{ borderTop: '1px solid var(--border2)', padding: '4px 0 8px' }}>
                  {s.steps.map((step, i) => (
                    <div key={i} style={{ padding: '12px 16px', borderBottom: i < s.steps.length - 1 ? '1px solid var(--border2)' : 'none' }}>
                      <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 5 }}>{step.heading}</p>
                      <p className="text-muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{step.body}</p>
                      {step.code && (
                        <pre style={{
                          marginTop: 8, background: 'var(--surface2)', borderRadius: 6,
                          padding: '8px 12px', fontSize: 12, color: 'var(--blue)',
                          overflowX: 'auto', border: '1px solid var(--border2)',
                        }}>{step.code}</pre>
                      )}
                      {step.tip && (
                        <div style={{
                          marginTop: 8, background: 'var(--accent-dim)', borderRadius: 6,
                          padding: '7px 10px', fontSize: 12, color: 'var(--text)',
                          border: '1px solid var(--accent)', opacity: 0.9,
                        }}>
                          💡 {step.tip}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Support card */}
        <div style={{ marginTop: 28, padding: '20px 20px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border2)', textAlign: 'center' }}>
          <p style={{ fontSize: 18 }}>☕</p>
          <p style={{ fontWeight: 600, fontSize: 14, marginTop: 6 }}>Support Stationarr</p>
          <p className="text-muted text-sm" style={{ marginTop: 6, maxWidth: 420, margin: '6px auto 0' }}>
            Stationarr is free and open source. If it saves you time, a small donation helps cover hosting costs
            and keeps new features coming — things like better EPG matching, new player integrations, and performance improvements.
          </p>
          <a
            href="https://ko-fi.com/rroy676"
            target="_blank"
            rel="noreferrer"
            style={{ display: 'inline-block', marginTop: 14 }}
          >
            <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Support on Ko-fi" style={{ height: 36 }} />
          </a>
        </div>

        {/* Footer tip */}
        <div style={{ marginTop: 10, padding: '14px 16px', background: 'var(--surface)', borderRadius: 8, border: '1px solid var(--border2)' }}>
          <p className="text-muted text-sm">
            Found a bug or want a feature?{' '}
            <a href="https://github.com/rroy676/Stationarr/issues" target="_blank" rel="noreferrer">
              Open an issue on GitHub
            </a>
            {' '}— contributions are welcome.
          </p>
        </div>
      </main>
    </div>
  );
}
