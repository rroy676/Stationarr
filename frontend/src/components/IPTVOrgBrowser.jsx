import { useState } from 'react';
import { X, ExternalLink, Plus, Search } from 'lucide-react';

// Real, free, publicly accessible XMLTV EPG sources
const EPG_SOURCES = [
  {
    region: 'Canada',
    sources: [
      { name: 'EPG.pw — Canada',          url: 'https://epg.pw/xmltv/epg_CA.xml',            note: 'Free · Broad Canadian coverage' },
      { name: 'i.mjh.nz — PlutoTV CA',    url: 'https://i.mjh.nz/PlutoTV/ca.xml.gz',         note: 'Free · PlutoTV Canada channels' },
      { name: 'i.mjh.nz — Plex CA',       url: 'https://i.mjh.nz/Plex/ca.xml.gz',            note: 'Free · Plex live Canada' },
      { name: 'i.mjh.nz — Samsung CA',    url: 'https://i.mjh.nz/SamsungTVPlus/ca.xml.gz',   note: 'Free · Samsung TV+ Canada' },
      { name: 'xmltv.net — Canada',        url: 'http://www.xmltv.net/xml_files/canada.xml.gz',note: 'Free · Community maintained' },
    ],
  },
  {
    region: 'United States',
    sources: [
      { name: 'EPG.pw — United States',   url: 'https://epg.pw/xmltv/epg_US.xml',            note: 'Free · Broad US coverage' },
      { name: 'i.mjh.nz — PlutoTV US',    url: 'https://i.mjh.nz/PlutoTV/us.xml.gz',         note: 'Free · PlutoTV US channels' },
      { name: 'i.mjh.nz — Plex US',       url: 'https://i.mjh.nz/Plex/us.xml.gz',            note: 'Free · Plex live US' },
      { name: 'i.mjh.nz — Samsung US',    url: 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz',   note: 'Free · Samsung TV+ US' },
      { name: 'i.mjh.nz — DirecTV',       url: 'https://i.mjh.nz/DirecTV/all.xml.gz',        note: 'Free · DirecTV channels' },
      { name: 'xmltv.net — USA',           url: 'http://www.xmltv.net/xml_files/usa.xml.gz',  note: 'Free · Community maintained' },
    ],
  },
  {
    region: 'United Kingdom',
    sources: [
      { name: 'EPG.pw — United Kingdom',  url: 'https://epg.pw/xmltv/epg_GB.xml',            note: 'Free · Broad UK coverage' },
      { name: 'i.mjh.nz — Samsung UK',    url: 'https://i.mjh.nz/SamsungTVPlus/gb.xml.gz',   note: 'Free · Samsung TV+ UK' },
      { name: 'i.mjh.nz — Plex UK',       url: 'https://i.mjh.nz/Plex/gb.xml.gz',            note: 'Free · Plex live UK' },
      { name: 'xmltv.net — UK',            url: 'http://www.xmltv.net/xml_files/uk.xml.gz',   note: 'Free · Community maintained' },
    ],
  },
  {
    region: 'Australia & NZ',
    sources: [
      { name: 'EPG.pw — Australia',       url: 'https://epg.pw/xmltv/epg_AU.xml',            note: 'Free · Broad AU coverage' },
      { name: 'i.mjh.nz — Plex AU',       url: 'https://i.mjh.nz/Plex/au.xml.gz',            note: 'Free · Plex live AU' },
      { name: 'i.mjh.nz — Samsung AU',    url: 'https://i.mjh.nz/SamsungTVPlus/au.xml.gz',   note: 'Free · Samsung TV+ AU' },
      { name: 'nzxmltv.com — New Zealand',url: 'https://nzxmltv.com/epg.xml',                note: 'Free · NZ community source' },
    ],
  },
  {
    region: 'Europe',
    sources: [
      { name: 'EPG.pw — France',          url: 'https://epg.pw/xmltv/epg_FR.xml',            note: 'Free' },
      { name: 'EPG.pw — Germany',         url: 'https://epg.pw/xmltv/epg_DE.xml',            note: 'Free' },
      { name: 'EPG.pw — Spain',           url: 'https://epg.pw/xmltv/epg_ES.xml',            note: 'Free' },
      { name: 'EPG.pw — Italy',           url: 'https://epg.pw/xmltv/epg_IT.xml',            note: 'Free' },
      { name: 'EPG.pw — Netherlands',     url: 'https://epg.pw/xmltv/epg_NL.xml',            note: 'Free' },
      { name: 'EPG.pw — Poland',          url: 'https://epg.pw/xmltv/epg_PL.xml',            note: 'Free' },
      { name: 'i.mjh.nz — Samsung DE',    url: 'https://i.mjh.nz/SamsungTVPlus/de.xml.gz',   note: 'Free · Germany' },
      { name: 'i.mjh.nz — Samsung FR',    url: 'https://i.mjh.nz/SamsungTVPlus/fr.xml.gz',   note: 'Free · France' },
    ],
  },
  {
    region: 'Latin America',
    sources: [
      { name: 'EPG.pw — Brazil',          url: 'https://epg.pw/xmltv/epg_BR.xml',            note: 'Free' },
      { name: 'EPG.pw — Mexico',          url: 'https://epg.pw/xmltv/epg_MX.xml',            note: 'Free' },
      { name: 'EPG.pw — Argentina',       url: 'https://epg.pw/xmltv/epg_AR.xml',            note: 'Free' },
      { name: 'i.mjh.nz — PlutoTV MX',   url: 'https://i.mjh.nz/PlutoTV/mx.xml.gz',         note: 'Free · Mexico' },
      { name: 'i.mjh.nz — PlutoTV BR',   url: 'https://i.mjh.nz/PlutoTV/br.xml.gz',         note: 'Free · Brazil' },
    ],
  },
  {
    region: 'Asia & Middle East',
    sources: [
      { name: 'EPG.pw — India',           url: 'https://epg.pw/xmltv/epg_IN.xml',            note: 'Free' },
      { name: 'EPG.pw — Turkey',          url: 'https://epg.pw/xmltv/epg_TR.xml',            note: 'Free' },
      { name: 'EPG.pw — Israel',          url: 'https://epg.pw/xmltv/epg_IL.xml',            note: 'Free' },
      { name: 'EPG.pw — Saudi Arabia',    url: 'https://epg.pw/xmltv/epg_SA.xml',            note: 'Free' },
    ],
  },
  {
    region: 'Multi-country',
    sources: [
      { name: 'i.mjh.nz — PlutoTV ALL',  url: 'https://i.mjh.nz/PlutoTV/all.xml.gz',        note: 'Free · All PlutoTV regions combined' },
      { name: 'i.mjh.nz — Plex ALL',     url: 'https://i.mjh.nz/Plex/all.xml.gz',           note: 'Free · All Plex regions combined' },
      { name: 'i.mjh.nz — Samsung ALL',  url: 'https://i.mjh.nz/SamsungTVPlus/all.xml.gz',  note: 'Free · All Samsung regions combined' },
    ],
  },
];

export default function IPTVOrgBrowser({ onAdd, onClose }) {
  const [search,  setSearch]  = useState('');
  const [region,  setRegion]  = useState('all');
  const [adding,  setAdding]  = useState(null);

  const allRegions = ['all', ...EPG_SOURCES.map(g => g.region)];

  const filtered = EPG_SOURCES
    .filter(g => region === 'all' || g.region === region)
    .map(g => ({
      ...g,
      sources: g.sources.filter(s =>
        !search ||
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.note.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter(g => g.sources.length > 0);

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal" style={{ maxWidth: 620, maxHeight: '88vh' }}>
        <div className="modal-header">
          <div>
            <h2>Free EPG source library</h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              All sources are free and publicly accessible · Tip: EPG.pw has the broadest coverage for most countries
            </p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={onClose}><X size={14}/></button>
        </div>
        <div className="modal-body">
          <div style={{ display: 'flex', gap: 8 }}>
            <div className="flex gap-1" style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 6, padding: '5px 10px' }}>
              <Search size={13} color="var(--faint)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search sources…"
                style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, width: '100%', fontFamily: 'inherit' }} />
            </div>
            <select className="input" value={region} onChange={e => setRegion(e.target.value)} style={{ width: 180 }}>
              {allRegions.map(r => <option key={r} value={r}>{r === 'all' ? 'All regions' : r}</option>)}
            </select>
          </div>

          {filtered.map(g => (
            <div key={g.region}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--faint)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>{g.region}</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {g.sources.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 500 }}>{s.name}</p>
                      <p className="text-xs text-faint">{s.note}</p>
                      <p className="text-xs mono text-faint truncate" style={{ marginTop: 2 }}>{s.url}</p>
                    </div>
                    <a href={s.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-icon btn-sm" title="Open URL">
                      <ExternalLink size={12}/>
                    </a>
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={adding === s.url}
                      onClick={async () => {
                        setAdding(s.url);
                        await onAdd({ name: s.name, url: s.url });
                        setAdding(null);
                      }}>
                      <Plus size={12}/> {adding === s.url ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>
            After adding — click <strong style={{ color: 'var(--text)' }}>Fetch & cache URL</strong> on the source to download programme data.
            Then run <strong style={{ color: 'var(--text)' }}>Match EPG</strong> in the editor, choosing this source from the dropdown.
          </div>
        </div>
      </div>
    </div>
  );
}
