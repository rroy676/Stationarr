import { useState, useRef } from 'react';
import { Search, X, Check } from 'lucide-react';

// tv-logos uses kebab-case with country suffix: "cnn-us.png", "bbc-one-gb.png"
// Country codes used in the repo
const LOGO_COUNTRIES = [
  { code: 'us',  label: 'United States', folder: 'united-states' },
  { code: 'ca',  label: 'Canada',        folder: 'canada' },
  { code: 'gb',  label: 'United Kingdom',folder: 'united-kingdom' },
  { code: 'au',  label: 'Australia',     folder: 'australia' },
  { code: 'fr',  label: 'France',        folder: 'france' },
  { code: 'de',  label: 'Germany',       folder: 'germany' },
  { code: 'es',  label: 'Spain',         folder: 'spain' },
  { code: 'it',  label: 'Italy',         folder: 'italy' },
  { code: 'nl',  label: 'Netherlands',   folder: 'netherlands' },
  { code: 'br',  label: 'Brazil',        folder: 'brazil' },
  { code: 'mx',  label: 'Mexico',        folder: 'mexico' },
  { code: 'in',  label: 'India',         folder: 'india' },
  { code: 'int', label: 'International', folder: 'international' },
];

const TV_LOGOS_RAW = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/\b(hd|sd|fhd|uhd|4k)\b/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function generateCandidates(name, countryCode, folder) {
  const base  = slugify(name);
  // tv-logos naming: {slug}-{country}.png  e.g. cnn-us.png, bbc-one-gb.png
  const withCC  = `${base}-${countryCode}`;
  // Also try without the country suffix
  const without = base;
  // And with common variants
  const noThe   = base.replace(/^the-/, '');

  const urls = [];
  const folders = folder === 'international'
    ? ['international']
    : [folder, 'international'];

  for (const f of folders) {
    urls.push(`${TV_LOGOS_RAW}/${f}/${withCC}.png`);
    urls.push(`${TV_LOGOS_RAW}/${f}/${without}.png`);
    if (noThe !== base) {
      urls.push(`${TV_LOGOS_RAW}/${f}/${noThe}-${countryCode}.png`);
      urls.push(`${TV_LOGOS_RAW}/${f}/${noThe}.png`);
    }
  }

  return [...new Set(urls)];
}

async function testUrl(url) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload  = () => resolve(url);
    img.onerror = () => resolve(null);
    img.src = url;
    setTimeout(() => resolve(null), 6000);
  });
}

export default function LogoBrowser({ channelName, currentLogo, onSelect, onClose }) {
  const [country,   setCountry]   = useState(LOGO_COUNTRIES[0]);
  const [query,     setQuery]     = useState(channelName || '');
  const [results,   setResults]   = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [searched,  setSearched]  = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [previewOk, setPreviewOk] = useState(null);
  const abortRef = useRef(false);

  const search = async () => {
    if (!query.trim()) return;
    setLoading(true);
    setResults([]);
    setSearched(false);
    abortRef.current = false;

    const candidates = generateCandidates(query.trim(), country.code, country.folder);

    const found = [];
    // Test in batches of 4 for speed
    for (let i = 0; i < candidates.length; i += 4) {
      if (abortRef.current) break;
      const batch = candidates.slice(i, i + 4);
      const settled = await Promise.all(batch.map(testUrl));
      settled.forEach(url => url && found.push(url));
    }

    if (!abortRef.current) {
      setResults(found);
      setSearched(true);
    }
    setLoading(false);
  };

  const handleCountryChange = (e) => {
    const c = LOGO_COUNTRIES.find(x => x.code === e.target.value);
    setCountry(c);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 200 }}>
      <div className="modal" style={{ maxWidth: 500 }}>
        <div className="modal-header">
          <div>
            <h2>Find channel logo</h2>
            <p className="text-xs text-muted" style={{ marginTop: 2 }}>
              Searches <a href="https://github.com/tv-logo/tv-logos" target="_blank" rel="noreferrer" style={{ color: 'var(--blue)' }}>tv-logo/tv-logos</a> — 10,000+ logos
            </p>
          </div>
          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => { abortRef.current = true; onClose(); }}><X size={14}/></button>
        </div>
        <div className="modal-body">

          {currentLogo && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'var(--surface2)', borderRadius: 8 }}>
              <img src={currentLogo} alt="" style={{ height: 32, maxWidth: 80, objectFit: 'contain' }} onError={e => e.target.style.display='none'} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p className="text-xs text-muted">Current logo</p>
                <p className="text-xs mono truncate">{currentLogo}</p>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 8 }}>
            <div className="field" style={{ width: 160, flexShrink: 0 }}>
              <label>Country</label>
              <select className="input" value={country.code} onChange={handleCountryChange}>
                {LOGO_COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
              </select>
            </div>
            <div className="field" style={{ flex: 1 }}>
              <label>Channel name</label>
              <input
                className="input" value={query}
                onChange={e => { setQuery(e.target.value); setSearched(false); }}
                onKeyDown={e => e.key === 'Enter' && search()}
                placeholder="e.g. BBC One, CNN, ESPN…"
                autoFocus
              />
            </div>
          </div>

          <button className="btn btn-primary btn-sm" onClick={search} disabled={loading || !query.trim()}>
            <Search size={12}/> {loading ? 'Searching…' : 'Search logos'}
          </button>

          {loading && (
            <p className="text-xs text-muted">Testing logo URLs… this takes a few seconds</p>
          )}

          {searched && results.length === 0 && !loading && (
            <div style={{ background: 'var(--surface2)', borderRadius: 8, padding: '12px 14px' }}>
              <p className="text-sm text-muted" style={{ marginBottom: 6 }}>No logos found automatically for <strong style={{ color: 'var(--text)' }}>{query}</strong> in {country.label}.</p>
              <p className="text-xs text-faint">Try: different country, shorter name (e.g. "BBC" instead of "BBC One"), or use a manual URL below.</p>
              <a
                href={`https://github.com/tv-logo/tv-logos/tree/main/countries/${country.folder}`}
                target="_blank" rel="noreferrer"
                className="btn btn-ghost btn-sm"
                style={{ marginTop: 8, fontSize: 12 }}
              >
                Browse {country.label} logos on GitHub ↗
              </a>
            </div>
          )}

          {results.length > 0 && (
            <div>
              <p className="text-xs text-muted" style={{ marginBottom: 8 }}>Found {results.length} logo{results.length !== 1 ? 's' : ''} — click to use</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {results.map((url, i) => (
                  <button key={i} onClick={() => onSelect(url)}
                    style={{
                      background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 8, padding: '10px 12px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                  >
                    <img src={url} alt="" style={{ height: 36, maxWidth: 90, objectFit: 'contain' }} />
                    <span style={{ fontSize: 10, color: 'var(--faint)', maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {url.split('/').pop()}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border2)', paddingTop: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>Or paste a logo URL directly</p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="input" value={manualUrl}
                onChange={e => { setManualUrl(e.target.value); setPreviewOk(null); }}
                placeholder="https://example.com/logo.png" style={{ flex: 1 }} />
              {manualUrl && (
                <img src={manualUrl} alt="" style={{ height: 32, maxWidth: 60, objectFit: 'contain', borderRadius: 4, background: 'var(--surface2)', flexShrink: 0 }}
                  onLoad={() => setPreviewOk(true)} onError={() => setPreviewOk(false)} />
              )}
            </div>
            {previewOk === false && <p className="text-xs" style={{ color: 'var(--red)', marginTop: 4 }}>Could not load image from that URL</p>}
            {manualUrl && previewOk !== false && (
              <button className="btn btn-primary btn-sm" style={{ marginTop: 8 }} onClick={() => onSelect(manualUrl)}>
                <Check size={12}/> Use this URL
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
