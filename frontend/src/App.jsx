import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ToastProvider, useAuth } from './context.jsx';
import { TimezoneProvider } from './timezone.jsx';
import { useVersionCheck } from './useVersionCheck.js';
import Login       from './pages/Login.jsx';
import Register    from './pages/Register.jsx';
import Dashboard   from './pages/Dashboard.jsx';
import Editor      from './pages/Editor.jsx';
import Settings    from './pages/Settings.jsx';
import Admin       from './pages/Admin.jsx';
import Guide       from './pages/Guide.jsx';
import Scraper     from './pages/Scraper.jsx';
import Help        from './pages/Help.jsx';
import Logs        from './pages/Logs.jsx';
import Tasks       from './pages/Tasks.jsx';

function UpdateBanner() {
  const { latest, hasUpdate, dismiss } = useVersionCheck();
  if (!hasUpdate) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 16, right: 16, zIndex: 9999,
      background: 'var(--accent)', color: '#fff',
      borderRadius: 10, padding: '12px 16px',
      display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
      fontSize: 13, maxWidth: 340,
    }}>
      <span style={{ flex: 1 }}>
        🎉 <strong>Stationarr v{latest}</strong> is available!{' '}
        <a
          href="/settings?section=updates"
          style={{ color: '#fff', textDecoration: 'underline' }}
        >
          Open Updates
        </a>
      </span>
      <button
        onClick={dismiss}
        aria-label="Dismiss update notification"
        style={{
          background: 'rgba(255,255,255,0.25)', border: 'none', borderRadius: 6,
          color: '#fff', cursor: 'pointer', fontSize: 13, padding: '4px 10px', flexShrink: 0,
        }}
      >
        Dismiss
      </button>
    </div>
  );
}

function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>;
  if (!user)  return <Navigate to="/login" replace />;
  return (
    <>
      {children}
      <UpdateBanner />
    </>
  );
}

function Public({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return null;
  if (user)   return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <TimezoneProvider>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login"    element={<Public><Login /></Public>} />
            <Route path="/register" element={<Public><Register /></Public>} />
            <Route path="/"         element={<Guard><Dashboard /></Guard>} />
            <Route path="/edit/:id" element={<Guard><Editor /></Guard>} />
            <Route path="/settings" element={<Guard><Settings /></Guard>} />
            <Route path="/admin"    element={<Guard><Admin /></Guard>} />
            <Route path="/guide/:id"   element={<Guard><Guide /></Guard>} />
            <Route path="/scraper"     element={<Guard><Scraper /></Guard>} />
            <Route path="/help"        element={<Guard><Help /></Guard>} />
            <Route path="/logs"        element={<Guard><Logs /></Guard>} />
            <Route path="/tasks"       element={<Guard><Tasks /></Guard>} />
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
      </TimezoneProvider>
    </AuthProvider>
  );
}
