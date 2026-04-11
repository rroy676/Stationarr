import { useState } from 'react';
import { Link }      from 'react-router-dom';
import { Tv }        from 'lucide-react';
import { useAuth }   from '../context.jsx';
import { useToast }  from '../context.jsx';

export default function Login() {
  const { login }  = useAuth();
  const toast      = useToast();
  const [form, setForm]       = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(form);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Tv size={32} color="var(--accent)" style={{ marginBottom: 10 }} />
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>
            Stream<span style={{ color: "var(--accent)" }}>arr</span>
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>Sign in to your account</p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Username or email</label>
              <input className="input" value={form.username} onChange={set('username')} required autoFocus />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', marginTop: 4 }}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="text-muted text-sm" style={{ textAlign: 'center', marginTop: 16 }}>
          Don't have an account? <Link to="/register">Register</Link>
        </p>
      </div>
    </div>
  );
}
