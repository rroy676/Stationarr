import { useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';

const THEMES = [
  { value: 'auto',  icon: Monitor, label: 'Auto'  },
  { value: 'light', icon: Sun,     label: 'Light' },
  { value: 'dark',  icon: Moon,    label: 'Dark'  },
];

export function applyTheme(t) {
  localStorage.setItem('stationarr_theme', t);
  const root = document.documentElement;
  if (t === 'light')      root.setAttribute('data-theme', 'light');
  else if (t === 'dark')  root.setAttribute('data-theme', 'dark');
  else                    root.removeAttribute('data-theme');
}

export function getTheme() {
  return localStorage.getItem('stationarr_theme') || 'auto';
}

export default function ThemeToggle({ size = 'sm' }) {
  const [theme, setTheme] = useState(getTheme);

  const cycle = () => {
    const order = ['auto', 'light', 'dark'];
    const next  = order[(order.indexOf(theme) + 1) % order.length];
    applyTheme(next);
    setTheme(next);
  };

  const current = THEMES.find(t => t.value === theme);
  const Icon    = current.icon;

  return (
    <button
      className="btn btn-ghost btn-sm"
      onClick={cycle}
      title={`Theme: ${current.label} (click to cycle)`}
      style={{ gap: 5 }}
    >
      <Icon size={13} />
      <span style={{ fontSize: 12 }}>{current.label}</span>
    </button>
  );
}
