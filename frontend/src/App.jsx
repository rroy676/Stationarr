import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, ToastProvider, useAuth } from './context.jsx';
import { TimezoneProvider } from './timezone.jsx';
import Login       from './pages/Login.jsx';
import Register    from './pages/Register.jsx';
import Dashboard   from './pages/Dashboard.jsx';
import Editor      from './pages/Editor.jsx';
import Settings    from './pages/Settings.jsx';
import Admin       from './pages/Admin.jsx';
import Guide       from './pages/Guide.jsx';
import Scraper     from './pages/Scraper.jsx';
import Help        from './pages/Help.jsx';

function Guard({ children }) {
  const { user, ready } = useAuth();
  if (!ready) return <div style={{ padding: 32, color: 'var(--muted)' }}>Loading…</div>;
  if (!user)  return <Navigate to="/login" replace />;
  return children;
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
            <Route path="*"         element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
      </TimezoneProvider>
    </AuthProvider>
  );
}
