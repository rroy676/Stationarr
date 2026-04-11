import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { auth as authApi } from './api.js';

// ── Auth ─────────────────────────────────────────────────────────
const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(undefined); // undefined = loading
  const [ready, setReady]   = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('token')) { setUser(null); setReady(true); return; }
    authApi.me()
      .then(setUser)
      .catch(() => { localStorage.removeItem('token'); setUser(null); })
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async (creds) => {
    const res = await authApi.login(creds);
    localStorage.setItem('token', res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const register = useCallback(async (creds) => {
    const res = await authApi.register(creds);
    localStorage.setItem('token', res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setUser(null);
  }, []);

  return (
    <AuthCtx.Provider value={{ user, ready, login, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);

// ── Toast ─────────────────────────────────────────────────────────
const ToastCtx = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const toast = useCallback((message, type = 'info', duration = 3500) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
  }, []);

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type === 'success' && '✓ '}
            {t.type === 'error'   && '✕ '}
            {t.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
