import { useEffect, useState } from 'react';
import { supabase, IS_SUPABASE_ENABLED } from '../lib/supabase';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70' };

// Exposes the current user via a simple context so other components can access it
let _currentUser = null;
let _listeners = [];

export function getCurrentUser() { return _currentUser; }
export function onUserChange(fn) {
  _listeners.push(fn);
  return () => { _listeners = _listeners.filter(l => l !== fn); };
}
function setCurrentUser(user) {
  _currentUser = user;
  _listeners.forEach(fn => fn(user));
}

export default function AuthGate({ children }) {
  // undefined = loading, null = not signed in (or auth not enabled), object = signed-in user
  const [session, setSession] = useState(IS_SUPABASE_ENABLED ? undefined : null);

  useEffect(() => {
    if (!IS_SUPABASE_ENABLED) return;

    supabase.auth.getSession().then(({ data: { session } }) => {
      setCurrentUser(session?.user ?? null);
      setSession(session ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setCurrentUser(session?.user ?? null);
      setSession(session ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: FR.salt }}>
        <p style={{ color: FR.stone, fontFamily: "'Cormorant Garamond', serif", fontSize: 20 }}>
          Loading…
        </p>
      </div>
    );
  }

  if (IS_SUPABASE_ENABLED && !session) {
    return <LoginPage />;
  }

  return children;
}

function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin'); // 'signin' | 'signup' | 'magic'
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    if (mode === 'magic') {
      const { error } = await supabase.auth.signInWithOtp({ email });
      if (error) setError(error.message);
      else setMessage('Check your email — a magic link is on its way.');
    } else if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setMessage('Check your email to confirm your account, then sign in.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    }
    setLoading(false);
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.href },
    });
    if (error) setError(error.message);
  }

  const inputStyle = {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 8,
    border: `1px solid ${FR.sand}`,
    background: FR.salt,
    color: FR.slate,
    fontSize: 14,
    outline: 'none',
    boxSizing: 'border-box',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: FR.salt }}>
      <div style={{ width: '100%', maxWidth: 360 }}>
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
            style={{ background: FR.slate }}>
            <span style={{ color: FR.salt, fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 500 }}>FR</span>
          </div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 26, color: FR.slate, letterSpacing: '0.08em', margin: 0 }}>
            FOREIGN RESOURCE
          </h1>
          <p style={{ color: FR.stone, fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', marginTop: 4, fontFamily: "'Inter', sans-serif" }}>
            Cash Model
          </p>
        </div>

        <div className="rounded-2xl border p-6 space-y-4" style={{ background: 'white', borderColor: FR.sand }}>
          <h2 style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif", fontSize: 20, margin: '0 0 4px', textAlign: 'center' }}>
            {mode === 'signup' ? 'Create Account' : mode === 'magic' ? 'Magic Link' : 'Sign In'}
          </h2>

          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input type="email" placeholder="Email address" value={email}
              onChange={e => setEmail(e.target.value)} required style={inputStyle} />
            {mode !== 'magic' && (
              <input type="password" placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} required style={inputStyle} />
            )}
            <button type="submit" disabled={loading}
              style={{
                background: loading ? FR.stone : FR.slate, color: FR.salt,
                padding: '9px 12px', borderRadius: 8, border: 'none',
                fontSize: 14, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: "'Inter', sans-serif",
              }}>
              {loading ? 'Please wait…'
                : mode === 'magic' ? 'Send Magic Link'
                : mode === 'signup' ? 'Create Account'
                : 'Sign In'}
            </button>
          </form>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, height: 1, background: FR.sand }} />
            <span style={{ color: FR.stone, fontSize: 12 }}>or</span>
            <div style={{ flex: 1, height: 1, background: FR.sand }} />
          </div>

          <button onClick={handleGoogle}
            style={{
              width: '100%', padding: '9px 12px', borderRadius: 8,
              border: `1px solid ${FR.sand}`, background: 'white', color: FR.slate,
              fontSize: 14, cursor: 'pointer', fontFamily: "'Inter', sans-serif",
            }}>
            Continue with Google
          </button>

          {error && (
            <p style={{ color: '#C0392B', fontSize: 12, textAlign: 'center', margin: 0 }}>{error}</p>
          )}
          {message && (
            <p style={{ color: '#27AE60', fontSize: 12, textAlign: 'center', margin: 0 }}>{message}</p>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button onClick={() => { setMode(mode === 'signup' ? 'signin' : 'signup'); setError(''); setMessage(''); }}
              style={{ color: FR.stone, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {mode === 'signup' ? 'Sign in instead' : 'Create account'}
            </button>
            <button onClick={() => { setMode(mode === 'magic' ? 'signin' : 'magic'); setError(''); setMessage(''); }}
              style={{ color: FR.stone, fontSize: 12, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {mode === 'magic' ? 'Use password' : 'Magic link'}
            </button>
          </div>
        </div>

        <p style={{ color: FR.stone, fontSize: 11, textAlign: 'center', marginTop: 16, fontFamily: "'Inter', sans-serif" }}>
          Foreign Resource — private access only
        </p>
      </div>
    </div>
  );
}
