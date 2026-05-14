import { useState, useEffect } from 'react';

const DISMISS_KEY = 'stationarr_dismissed_version';

export function useVersionCheck() {
  const [current,   setCurrent]   = useState(null);
  const [latest,    setLatest]    = useState(null);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) || '');

  useEffect(() => {
    // Fetch current version from our own backend
    fetch('/api/health')
      .then(r => r.json())
      .then(d => { if (d.version) setCurrent(d.version); })
      .catch(() => {});

    // Fetch latest release from GitHub (public, no auth needed)
    fetch('https://api.github.com/repos/rroy676/Stationarr/releases/latest')
      .then(r => r.json())
      .then(d => {
        const tag = d.tag_name?.replace(/^v/, '');
        if (tag) setLatest(tag);
      })
      .catch(() => {});
  }, []);

  // Show banner only if there's a newer version the user hasn't dismissed yet
  const hasUpdate = !!(current && latest && latest !== current && dismissed !== latest);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, latest);
    setDismissed(latest);
  };

  return { current, latest, hasUpdate, dismiss };
}
