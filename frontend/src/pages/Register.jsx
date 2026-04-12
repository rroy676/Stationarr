import { useState }       from 'react';
import { Link }           from 'react-router-dom';
import { Tv }             from 'lucide-react';
import { useAuth, useToast } from '../context.jsx';

export default function Register() {
  const { register } = useAuth();
  const toast        = useToast();
  const [form, setForm]       = useState({ username: '', email: '', password: '', confirm: '' });
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast('Passwords do not match', 'error');
    setLoading(true);
    try {
      await register({ username: form.username, email: form.email, password: form.password });
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
            Station<span style={{ color: "var(--accent)" }}>arr</span>
          </h1>
          <p className="text-muted text-sm" style={{ marginTop: 6 }}>Create an account</p>
        </div>

        <div className="card" style={{ padding: 24 }}>
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="field">
              <label>Username</label>
              <input className="input" value={form.username} onChange={set('username')} required autoFocus />
            </div>
            <div className="field">
              <label>Email</label>
              <input className="input" type="email" value={form.email} onChange={set('email')} required />
            </div>
            <div className="field">
              <label>Password</label>
              <input className="input" type="password" value={form.password} onChange={set('password')} required minLength={8} />
            </div>
            <div className="field">
              <label>Confirm password</label>
              <input className="input" type="password" value={form.confirm} onChange={set('confirm')} required />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', marginTop: 4 }}>
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="text-muted text-sm" style={{ textAlign: 'center', marginTop: 16 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
