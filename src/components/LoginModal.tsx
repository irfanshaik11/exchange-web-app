import React, { useState, useEffect } from 'react';
import { env } from '../env';
import Cookies from 'js-cookie';
import { useUser } from "./UserContext";
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';

interface LoginModalProps {
  open: boolean;
  onClose: () => void;
}

export default function LoginModal({ open, onClose }: LoginModalProps) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { refreshUser } = useUser();

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  // Login handler
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/users/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (res.ok && data.token) {
        Cookies.set('token', data.token, { expires: 7, path: '/' });
        await refreshUser();
        setSuccess('Login successful!');
        
        // Trigger page reload to refresh user context
        setTimeout(() => {
          setSuccess(null);
          onClose();
          window.location.reload();
        }, 1200);
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (err) {
      setError('Login failed');
    } finally {
      setLoading(false);
    }
  }

  // Registration handler
  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name: username, password }),
      });
      const data = await res.json();
      if (res.ok && data.user && data.user.token) {
        Cookies.set('token', data.user.token, { expires: 7, path: '/' });
        Cookies.set('username', username, { expires: 7, path: '/' });
        Cookies.set('email', email, { expires: 7, path: '/' });
        await refreshUser();
        setSuccess('Registration successful!');
        setTimeout(() => {
          setMode('login');
          setSuccess(null);
        }, 1200);
      } else {
        setError(data.message || 'Registration failed');
      }
    } catch (err) {
      setError('Registration failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <InterstatePopout open={open} onClose={onClose} align="center" className="bg-neutral-900 rounded-xl shadow-2xl w-[350px] p-6 relative text-neutral-100">
      <button
        className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl"
        onClick={onClose}
      >
        ×
      </button>
      {mode === 'login' ? (
        <>
          <div className="text-xl font-bold mb-4 text-center">Login</div>
          <form onSubmit={handleLogin}>
            <div className="mb-3">
              <label className="block text-xs mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
              />
              <label className="block text-xs mb-1">Password</label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
              <div className="flex justify-end mb-2">
                <InterstateButton variant="secondary" size="sm" type="button" className="text-xs text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto">Forgot password?</InterstateButton>
              </div>
            </div>
            {error && <div className="text-xs text-red-400 mb-2 text-center">{error}</div>}
            {success && <div className="text-xs text-emerald-400 mb-2 text-center">{success}</div>}
            <InterstateButton type="submit" fullWidth loading={loading} className="mb-3">Login</InterstateButton>
          </form>
          <div className="text-center text-xs mt-3 text-neutral-400">
            Don't have an account?{' '}
            <InterstateButton variant="secondary" size="sm" type="button" className="text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto" onClick={() => setMode('signup')}>Sign up</InterstateButton>
          </div>
        </>
      ) : (
        <form onSubmit={handleRegister}>
          <div className="text-xl font-bold mb-4 text-center">Sign Up</div>
          <div className="mb-3">
            <label className="block text-xs mb-1">Username</label>
            <input
              type="text"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              required
            />
            <label className="block text-xs mb-1">Email</label>
            <input
              type="email"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
            <label className="block text-xs mb-1">Password</label>
            <input
              type="password"
              className="w-full px-3 py-2 rounded-3xl border border-neutral-700 text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder="Enter password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="text-xs text-red-400 mb-2 text-center">{error}</div>}
          {success && <div className="text-xs text-emerald-400 mb-2 text-center">{success}</div>}
          <InterstateButton type="submit" fullWidth loading={loading} className="mb-3">Sign Up</InterstateButton>
          <div className="text-center text-xs mt-3 text-neutral-400">
            Already have an account?{' '}
            <InterstateButton variant="secondary" size="sm" type="button" className="text-emerald-400 hover:underline bg-transparent border-none shadow-none px-0 py-0 h-auto" onClick={() => setMode('login')}>Login</InterstateButton>
          </div>
          <div className="text-xs text-neutral-500 mt-4 text-center">
            By creating an account, you agree to Interstate's{' '}
            <a href="#" className="underline">Privacy Policy</a> and{' '}
            <a href="#" className="underline">Terms of Service</a>.
          </div>
        </form>
      )}
    </InterstatePopout>
  );
} 