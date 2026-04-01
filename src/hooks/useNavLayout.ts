import { useState, useEffect, useCallback } from 'react';

export type NavLayout = 'top' | 'left';

const STORAGE_KEY = 'predictions-nav-layout';

export default function useNavLayout() {
  const [layout, setLayoutState] = useState<NavLayout>('top');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as NavLayout | null;
    if (saved === 'top' || saved === 'left') setLayoutState(saved);
  }, []);

  const setLayout = useCallback((l: NavLayout) => {
    setLayoutState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const toggle = useCallback(() => {
    setLayout(layout === 'top' ? 'left' : 'top');
  }, [layout, setLayout]);

  return { layout, setLayout, toggle };
}
