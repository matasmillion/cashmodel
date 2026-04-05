import { createContext, useContext, useState, useEffect } from 'react';
import { auth } from '../firebase';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const login = (email, password) => signInWithEmailAndPassword(auth, email, password);
  const signup = (email, password) => createUserWithEmailAndPassword(auth, email, password);
  const logout = () => signOut(auth);
  const loginWithGoogle = () => signInWithPopup(auth, new GoogleAuthProvider());

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F0E8' }}>
        <div className="text-center">
          <h1 className="text-2xl tracking-wide" style={{ color: '#3A3A3A', fontFamily: "'Cormorant Garamond', Georgia, serif", letterSpacing: '0.05em' }}>
            FOREIGN RESOURCE
          </h1>
          <p className="text-xs uppercase tracking-[0.15em] mt-2" style={{ color: '#716F70', fontFamily: "'Inter', sans-serif" }}>
            Loading...
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user, login, signup, logout, loginWithGoogle }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
