import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const FR = { slate: '#3A3A3A', salt: '#F5F0E8', sand: '#EBE5D5', stone: '#716F70', soil: '#9A816B' };

export default function LoginPage() {
  const { login, signup, loginWithGoogle } = useAuth();
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (isSignup) {
        await signup(email, password);
      } else {
        await login(email, password);
      }
    } catch (err) {
      const msg = err.code === 'auth/invalid-credential' ? 'Invalid email or password'
        : err.code === 'auth/email-already-in-use' ? 'Email already in use'
        : err.code === 'auth/weak-password' ? 'Password must be at least 6 characters'
        : err.code === 'auth/invalid-email' ? 'Invalid email address'
        : err.message;
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError('');
    setLoading(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        setError('Google sign-in failed');
      }
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: `1px solid ${FR.sand}`, background: 'white',
    color: FR.slate, fontSize: 14, fontFamily: "'Inter', sans-serif",
    outline: 'none',
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: FR.salt }}>
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl tracking-wide" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '0.05em' }}>
            FOREIGN RESOURCE
          </h1>
          <p className="text-xs uppercase tracking-[0.15em] mt-1" style={{ color: FR.stone, fontFamily: "'Inter', sans-serif" }}>
            Growth Model & Operating Dashboard
          </p>
        </div>

        <div className="rounded-xl p-6 border" style={{ background: 'white', borderColor: FR.sand }}>
          <h2 className="text-lg mb-4" style={{ color: FR.slate, fontFamily: "'Cormorant Garamond', serif" }}>
            {isSignup ? 'Create Account' : 'Sign In'}
          </h2>

          {error && (
            <div className="mb-4 p-3 rounded-lg text-xs" style={{ background: '#FEF2F2', color: '#991B1B', border: '1px solid #FECACA' }}>
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={inputStyle} placeholder="you@company.com" />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.1em] block mb-1" style={{ color: FR.stone }}>Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} style={inputStyle} placeholder="Min. 6 characters" />
            </div>
            <button type="submit" disabled={loading}
              className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity disabled:opacity-50"
              style={{ background: FR.slate, color: FR.salt, fontFamily: "'Inter', sans-serif" }}>
              {loading ? '...' : isSignup ? 'Create Account' : 'Sign In'}
            </button>
          </form>

          <div className="flex items-center gap-3 my-4">
            <div className="flex-1 h-px" style={{ background: FR.sand }} />
            <span className="text-[10px] uppercase tracking-[0.1em]" style={{ color: FR.stone }}>or</span>
            <div className="flex-1 h-px" style={{ background: FR.sand }} />
          </div>

          <button onClick={handleGoogle} disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium border transition-opacity disabled:opacity-50"
            style={{ background: 'white', color: FR.slate, borderColor: FR.sand, fontFamily: "'Inter', sans-serif" }}>
            Continue with Google
          </button>

          <p className="text-center text-xs mt-4" style={{ color: FR.stone }}>
            {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button onClick={() => { setIsSignup(!isSignup); setError(''); }} className="underline" style={{ color: FR.soil }}>
              {isSignup ? 'Sign in' : 'Create one'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
