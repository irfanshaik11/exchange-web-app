import { useRef, useCallback, useEffect } from 'react';

interface TiltOptions {
  max?: number;        // Maximum tilt angle in degrees (default: 2.5)
  perspective?: number; // CSS perspective value in px (default: 1200)
  speed?: number;       // Transition speed in ms for reset (default: 400)
  scale?: number;       // Scale on hover (default: 1.0 — no scale)
}

/**
 * Professional 3D tilt effect for cards.
 * Uses CSS perspective transforms — runs entirely on the compositor thread (60fps).
 * Respects prefers-reduced-motion.
 */
export default function useTiltEffect<T extends HTMLElement>(options: TiltOptions = {}) {
  const {
    max = 2.5,
    perspective = 1200,
    speed = 400,
    scale = 1.0,
  } = options;

  const ref = useRef<T>(null);
  const rafId = useRef<number>(0);
  const prefersReducedMotion = useRef(false);

  useEffect(() => {
    prefersReducedMotion.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (prefersReducedMotion.current || !ref.current) return;

    cancelAnimationFrame(rafId.current);
    rafId.current = requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;  // 0 to 1
      const y = (e.clientY - rect.top) / rect.height;   // 0 to 1

      const rotateX = (0.5 - y) * max * 2;  // Tilt up/down
      const rotateY = (x - 0.5) * max * 2;  // Tilt left/right

      el.style.transform = `perspective(${perspective}px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(${scale}, ${scale}, ${scale})`;
      el.style.transition = 'transform 100ms ease-out';
    });
  }, [max, perspective, scale]);

  const handleMouseLeave = useCallback(() => {
    cancelAnimationFrame(rafId.current);
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
    el.style.transition = `transform ${speed}ms cubic-bezier(0.16, 1, 0.3, 1)`;
  }, [speed]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    el.style.willChange = 'transform';
    el.style.transformStyle = 'preserve-3d';

    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      cancelAnimationFrame(rafId.current);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [handleMouseMove, handleMouseLeave]);

  return ref;
}
