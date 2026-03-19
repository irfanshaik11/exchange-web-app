import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const PIN_LENGTH = 6;
const CORRECT_PIN = process.env.NEXT_PUBLIC_PREDICTIONS_PIN || '131517';
const SESSION_KEY = '__predictions_unlocked';

function isPinUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(SESSION_KEY) === '1';
}

export default function PinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [digits, setDigits] = useState<string>('');
  const [error, setError] = useState(false);
  const [success, setSuccess] = useState(false);

  // Check session on mount
  useEffect(() => {
    if (isPinUnlocked()) setUnlocked(true);
  }, []);

  const handleDigit = useCallback((d: string) => {
    if (success || error) return;
    setDigits(prev => {
      if (prev.length >= PIN_LENGTH) return prev;
      const next = prev + d;

      // Auto-submit when full
      if (next.length === PIN_LENGTH) {
        if (next === CORRECT_PIN) {
          setSuccess(true);
          sessionStorage.setItem(SESSION_KEY, '1');
          setTimeout(() => setUnlocked(true), 500);
        } else {
          setError(true);
          setTimeout(() => {
            setError(false);
            setDigits('');
          }, 600);
        }
      }
      return next;
    });
  }, [success, error]);

  const handleDelete = useCallback(() => {
    if (success || error) return;
    setDigits(prev => prev.slice(0, -1));
  }, [success, error]);

  // Keyboard support
  useEffect(() => {
    if (unlocked) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') handleDigit(e.key);
      else if (e.key === 'Backspace') handleDelete();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [unlocked, handleDigit, handleDelete]);

  if (unlocked) return <>{children}</>;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0a0b0d',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Inter", system-ui, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Lock icon */}
      <motion.div
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', bounce: 0.4 }}
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: 'linear-gradient(135deg, #1a1d24 0%, #12141a 100%)',
          border: '1px solid #2a2d38',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        }}
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </motion.div>

      {/* Title */}
      <motion.p
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        style={{
          color: '#f0f0f0',
          fontSize: 20,
          fontWeight: 600,
          margin: 0,
          marginBottom: 8,
          letterSpacing: '-0.01em',
        }}
      >
        Enter Passcode
      </motion.p>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15 }}
        style={{
          color: '#6b7280',
          fontSize: 14,
          margin: 0,
          marginBottom: 32,
        }}
      >
        Predictions is in private beta
      </motion.p>

      {/* Dots */}
      <motion.div
        animate={error ? { x: [0, -12, 12, -8, 8, -4, 4, 0] } : {}}
        transition={{ duration: 0.5 }}
        style={{
          display: 'flex',
          gap: 16,
          marginBottom: 48,
        }}
      >
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const filled = i < digits.length;
          return (
            <motion.div
              key={i}
              animate={{
                scale: filled ? [1, 1.3, 1] : 1,
                backgroundColor: error
                  ? '#F87171'
                  : success
                    ? '#4ADE80'
                    : filled
                      ? '#f0f0f0'
                      : 'transparent',
                borderColor: error
                  ? '#F87171'
                  : success
                    ? '#4ADE80'
                    : filled
                      ? '#f0f0f0'
                      : '#3a3d48',
              }}
              transition={{ duration: 0.15 }}
              style={{
                width: 14,
                height: 14,
                borderRadius: '50%',
                border: '2px solid #3a3d48',
                backgroundColor: 'transparent',
              }}
            />
          );
        })}
      </motion.div>

      {/* Number pad */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          maxWidth: 280,
          width: '100%',
        }}
      >
        {['1','2','3','4','5','6','7','8','9','','0','del'].map((key) => {
          if (key === '') return <div key="empty" />;

          const isDel = key === 'del';

          return (
            <motion.button
              key={key}
              whileTap={{ scale: 0.9 }}
              onClick={() => isDel ? handleDelete() : handleDigit(key)}
              style={{
                width: 76,
                height: 76,
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: isDel ? 14 : 28,
                fontWeight: isDel ? 500 : 300,
                color: '#f0f0f0',
                background: isDel ? 'transparent' : 'rgba(255,255,255,0.07)',
                letterSpacing: isDel ? '0.03em' : undefined,
                margin: '0 auto',
                outline: 'none',
                WebkitTapHighlightColor: 'transparent',
                transition: 'background 0.15s',
              }}
              onMouseDown={(e) => {
                if (!isDel) (e.currentTarget.style.background = 'rgba(255,255,255,0.15)');
              }}
              onMouseUp={(e) => {
                if (!isDel) (e.currentTarget.style.background = 'rgba(255,255,255,0.07)');
              }}
              onMouseLeave={(e) => {
                if (!isDel) (e.currentTarget.style.background = 'rgba(255,255,255,0.07)');
              }}
            >
              {isDel ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#f0f0f0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 4H8l-7 8 7 8h13a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z" />
                  <line x1="18" y1="9" x2="12" y2="15" />
                  <line x1="12" y1="9" x2="18" y2="15" />
                </svg>
              ) : key}
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
