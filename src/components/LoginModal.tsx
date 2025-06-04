import React, { useState, useEffect } from 'react';

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

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-colors duration-500 ${open ? 'bg-black/40' : 'bg-black/0'}`}
      style={{ backdropFilter: 'blur(2px)' }}
    >
      <div
        className={`bg-neutral-900 rounded-xl shadow-2xl w-[350px] p-6 relative text-neutral-100 transform transition-all duration-500
          ${open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-2'}`}
      >
        <button
          className="absolute top-3 right-3 text-neutral-400 hover:text-white text-xl"
          onClick={onClose}
        >
          x
        </button>
        {mode === 'login' ? (
          <>
            <div className="text-xl font-bold mb-4 text-center">Login</div>
            <div className="mb-3">
              <label className="block text-xs mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <label className="block text-xs mb-1">Password</label>
              <input
                type="password"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <div className="flex justify-end mb-2">
                <button className="text-xs text-emerald-400 hover:underline">Forgot password?</button>
              </div>
            </div>
            <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded mb-3 transition">Login</button>
            <div className="text-center text-xs mt-3 text-neutral-400">
              Don't have an account?{' '}
              <button className="text-emerald-400 hover:underline" onClick={() => setMode('signup')}>Sign up</button>
            </div>
          </>
        ) : (
          <>
            <div className="text-xl font-bold mb-4 text-center">Sign Up</div>
            <div className="mb-3">
              <label className="block text-xs mb-1">Username</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter username"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
              <label className="block text-xs mb-1">Email</label>
              <input
                type="email"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
              <label className="block text-xs mb-1">Password</label>
              <input
                type="text"
                className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                placeholder="Enter password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </div>
            <button className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-2 rounded mb-3 transition">Sign Up</button>
            <div className="text-center text-xs mt-3 text-neutral-400">
              Already have an account?{' '}
              <button className="text-emerald-400 hover:underline" onClick={() => setMode('login')}>Login</button>
            </div>
            <div className="text-xs text-neutral-500 mt-4 text-center">
              By creating an account, you agree to Interstate's{' '}
              <a href="#" className="underline">Privacy Policy</a> and{' '}
              <a href="#" className="underline">Terms of Service</a>.
            </div>
          </>
        )}
      </div>
    </div>
  );
} 