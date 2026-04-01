import { useRef, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { RiLayoutLeftLine, RiLayoutTopLine } from 'react-icons/ri';
import { T } from './theme';
import { CATEGORIES } from './categories';
import type { NavLayout } from '~/hooks/useNavLayout';

interface PredictionsTopNavProps {
  selectedCategory: string;
  onSelectCategory: (category: string) => void;
  layout: NavLayout;
  onToggleLayout: () => void;
}

export default function PredictionsTopNav({
  selectedCategory,
  onSelectCategory,
  layout,
  onToggleLayout,
}: PredictionsTopNavProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setShowLeftFade(el.scrollLeft > 8);
      setShowRightFade(el.scrollLeft < el.scrollWidth - el.clientWidth - 8);
    };
    let resizeTimer: ReturnType<typeof setTimeout>;
    const debouncedCheck = () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(check, 100);
    };
    check();
    el.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', debouncedCheck);
    return () => {
      clearTimeout(resizeTimer);
      el.removeEventListener('scroll', check);
      window.removeEventListener('resize', debouncedCheck);
    };
  }, []);

  return (
    <div
      className="flex items-center w-full"
      style={{
        borderBottom: `1px solid ${T.border}`,
        backgroundColor: T.bg,
      }}
    >
      {/* Scrollable categories */}
      <div className="relative flex-1 min-w-0">
        {showLeftFade && (
          <div
            className="pointer-events-none absolute left-0 top-0 bottom-0 w-8 z-10"
            style={{ background: `linear-gradient(to right, ${T.bg} 0%, transparent 100%)` }}
          />
        )}
        {showRightFade && (
          <div
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 z-10"
            style={{ background: `linear-gradient(to left, ${T.bg} 0%, transparent 100%)` }}
          />
        )}

        <div
          ref={scrollRef}
          className="flex items-center overflow-x-auto scrollbar-hide px-4"
        >
          {CATEGORIES.map((cat) => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
                className="relative flex-shrink-0 px-3 py-2.5 text-[13px] font-medium transition-colors duration-150 cursor-pointer whitespace-nowrap"
                style={{ color: isActive ? T.text : T.muted }}
              >
                {cat.id === 'all' ? 'All' : cat.label}
                {isActive && (
                  <motion.div
                    layoutId="topnav-active"
                    className="absolute bottom-0 left-3 right-3 h-[2px] rounded-full"
                    style={{ backgroundColor: T.accent }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Layout toggle */}
      <button
        onClick={onToggleLayout}
        className="flex-shrink-0 p-2 mr-3 rounded-md transition-colors duration-150 cursor-pointer"
        style={{ color: T.muted }}
        title={layout === 'top' ? 'Switch to sidebar layout' : 'Switch to top navbar layout'}
      >
        {layout === 'top' ? (
          <RiLayoutLeftLine className="w-4 h-4" />
        ) : (
          <RiLayoutTopLine className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
