import { Github } from 'lucide-react';

export default function HeaderButtons() {
  return (
    <>
      <a
        href="https://ko-fi.com/rroy676"
        target="_blank"
        rel="noreferrer"
        className="btn btn-ghost btn-sm"
        style={{ color: '#FF5E5B', borderColor: 'transparent' }}
        title="Support Stationarr on Ko-fi"
      >
        ☕ Support
      </a>
      <a
        href="https://github.com/rroy676/Stationarr"
        target="_blank"
        rel="noreferrer"
        className="btn btn-ghost btn-sm"
        style={{ borderColor: 'transparent' }}
        title="Stationarr on GitHub"
      >
        <Github size={14} />
      </a>
    </>
  );
}
