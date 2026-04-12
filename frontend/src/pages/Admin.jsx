import { useEffect, useState } from 'react';
import { useNavigate }          from 'react-router-dom';
import { ArrowLeft, Tv, Plus, Trash2, Shield, ShieldOff, KeyRound, Users } from 'lucide-react';
import { admin as api }         from '../api.js';
import { useAuth, useToast }    from '../context.jsx';

export default function Admin() {
  const { user }  = useAuth();
  const toast     = useToast();
  const nav       = useNavigate();

  const [users,   setUsers]   = useState([]);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newUser, setNewUser] = useState({ username: '', email: '', password: '', is_admin: false });
  const [resetPw, setResetPw] = useState({ id: null, pw: '' });

  useEffect(() => {
    if (!user?.is_admin) { nav('/'); return; }
    Promise.all([api.users(), api.stats()])
      .then(([u, s]) => { setUsers(u); setStats(s); })
      .catch(e => toast(e.message, 'error'))
      .finally(() => setLoading(false));
  }, [user]);

  const createUser = async (e) => {
    e.preventDefault();
    try {
      const created = await api.createUser(newUser);
      setUsers(u => [created, ...u]);
      setNewUser({ username: '', email: '', password: '', is_admin: false });
      setShowCreate(false);
      toast(`User "${created.username}" created`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const toggleAdmin = async (u) => {
    try {
      await api.updateUser(u.id, { is_admin: !u.is_admin });
      setUsers(prev => prev.map(x => x.id === u.id ? { ...x, is_admin: !u.is_admin } : x));
      toast(`${u.username} is now ${!u.is_admin ? 'admin' : 'regular user'}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const deleteUser = async (u) => {
    if (!confirm(`Delete user "${u.username}" and all their playlists? This cannot be undone.`)) return;
    try {
      await api.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast(`User "${u.username}" deleted`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    try {
      await api.updateUser(resetPw.id, { password: resetPw.pw });
      setResetPw({ id: null, pw: '' });
      toast('Password updated', 'success');
    } catch (err) { toast(err.message, 'error'); }
  };

  const set = (k) => (e) => setNewUser(f => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ background: 'var(--surface)', borderBottom: '1px solid var(--border2)', padding: '0 24px', height: 54, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button className="btn btn-ghost btn-icon btn-sm" onClick={() => nav('/')}><ArrowLeft size={15}/></button>
        <Tv size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700 }}>Station<span style={{ color: "var(--accent)" }}>arr</span></span>
        <span className="text-muted" style={{ marginLeft: 4 }}>/ Admin</span>
      </header>

      <main style={{ flex: 1, maxWidth: 860, width: '100%', margin: '0 auto', padding: '32px 24px', display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Stats */}
        {stats && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
            {[
              { label: 'Users',       value: stats.users },
              { label: 'Playlists',   value: stats.playlists },
              { label: 'Channels',    value: stats.channels.toLocaleString() },
              { label: 'EPG sources', value: stats.epg_sources },
            ].map(s => (
              <div key={s.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 16px' }}>
                <p className="text-xs text-muted" style={{ marginBottom: 4 }}>{s.label}</p>
                <p style={{ fontSize: 22, fontWeight: 600 }}>{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {/* User management */}
        <div>
          <div className="flex" style={{ marginBottom: 14 }}>
            <div className="flex gap-2" style={{ flex: 1 }}>
              <Users size={16} color="var(--accent)" />
              <h2 style={{ fontSize: 15, fontWeight: 600 }}>Users</h2>
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(s => !s)}>
              <Plus size={13} /> New user
            </button>
          </div>

          {/* Create user form */}
          {showCreate && (
            <div className="card" style={{ marginBottom: 14 }}>
              <p style={{ fontWeight: 500, marginBottom: 12, fontSize: 13 }}>Create user</p>
              <form onSubmit={createUser} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Username</label>
                  <input className="input" value={newUser.username} onChange={set('username')} required />
                </div>
                <div className="field">
                  <label>Email</label>
                  <input className="input" type="email" value={newUser.email} onChange={set('email')} required />
                </div>
                <div className="field">
                  <label>Password</label>
                  <input className="input" type="password" value={newUser.password} onChange={set('password')} required minLength={8} />
                </div>
                <div className="field" style={{ justifyContent: 'flex-end' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontWeight: 400 }}>
                    <input type="checkbox" checked={newUser.is_admin} onChange={set('is_admin')} />
                    Admin
                  </label>
                </div>
                <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm">Create</button>
                  <button type="button" className="btn btn-sm" onClick={() => setShowCreate(false)}>Cancel</button>
                </div>
              </form>
            </div>
          )}

          {/* Reset password modal */}
          {resetPw.id && (
            <div className="modal-overlay">
              <div className="modal" style={{ maxWidth: 360 }}>
                <div className="modal-header">
                  <h2>Reset password</h2>
                  <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setResetPw({ id: null, pw: '' })}>✕</button>
                </div>
                <div className="modal-body">
                  <form onSubmit={resetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="field">
                      <label>New password</label>
                      <input className="input" type="password" value={resetPw.pw}
                        onChange={e => setResetPw(r => ({ ...r, pw: e.target.value }))}
                        required minLength={8} autoFocus />
                    </div>
                    <button type="submit" className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start' }}>Set password</button>
                  </form>
                </div>
              </div>
            </div>
          )}

          {loading ? (
            <p className="text-muted">Loading…</p>
          ) : (
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Playlists</th>
                    <th style={{ width: 90, textAlign: 'center' }}>Channels</th>
                    <th style={{ width: 90 }}>Role</th>
                    <th style={{ width: 80 }}>Joined</th>
                    <th style={{ width: 100 }} />
                  </tr>
                </thead>
                <tbody>
                  {users.map(u => (
                    <tr key={u.id}>
                      <td style={{ fontWeight: 500 }}>{u.username}{u.id === user.id && <span className="badge badge-accent" style={{ marginLeft: 6, fontSize: 10 }}>you</span>}</td>
                      <td className="text-muted">{u.email}</td>
                      <td style={{ textAlign: 'center' }}>{u.playlist_count}</td>
                      <td style={{ textAlign: 'center' }}>{u.channel_count.toLocaleString()}</td>
                      <td>
                        {u.is_admin
                          ? <span className="badge badge-accent">Admin</span>
                          : <span className="badge badge-muted">User</span>
                        }
                      </td>
                      <td className="text-muted text-xs">{new Date(u.created_at).toLocaleDateString()}</td>
                      <td>
                        <div className="flex gap-1">
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title={u.is_admin ? 'Remove admin' : 'Make admin'}
                            onClick={() => toggleAdmin(u)}
                            disabled={u.id === user.id}
                          >
                            {u.is_admin ? <ShieldOff size={13} /> : <Shield size={13} />}
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm"
                            title="Reset password"
                            onClick={() => setResetPw({ id: u.id, pw: '' })}
                          >
                            <KeyRound size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-icon btn-sm btn-danger"
                            title="Delete user"
                            onClick={() => deleteUser(u)}
                            disabled={u.id === user.id}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
