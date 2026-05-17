"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { GiTrophy } from "react-icons/gi";
import { FiUsers, FiBarChart, FiGrid } from "react-icons/fi";
import { IoClose } from "react-icons/io5";

// Menu items configuration
const arenaMenuItems = [
  { name: "Airdrop Genesis", href: "/airdrop-genesis", icon: "trophy", disabled: false },
  { name: "Referrals", href: "/referrals", icon: "users", disabled: false },
  { name: "Leaderboard", href: "/leaderboard", icon: "chart", disabled: true },
  { name: "KOL Leaderboard", href: "/kol-leaderboard", icon: "chart", disabled: false },
  { name: "Vision", href: "/vision", icon: "chart", disabled: false },
  { name: "Jackpot", href: "/jackpot", icon: "grid", disabled: true },
];

// Green/Mint color palette matching app's accent
const COLORS = {
  primaryMint: "#18c48c",
  brightMint: "#31e3ac",
  lightMint: "#4eedc0",
  backgroundGradient: "linear-gradient(180deg, rgba(24, 196, 140, 0.15) 0%, rgba(18, 168, 119, 0.2) 100%)",
  border: "rgba(24, 196, 140, 0.35)",
  disabledText: "rgba(156, 163, 175, 0.5)",
  hoverBg: "rgba(24, 196, 140, 0.15)",
  activeBg: "rgba(24, 196, 140, 0.25)",
  textMuted: "#9ca3af",
};

// Icon component mapper
function MenuIcon({ icon, size = 16, style }: { icon: string; size?: number; style?: React.CSSProperties }) {
  switch (icon) {
    case "trophy":
      return <GiTrophy size={size} style={style} />;
    case "users":
      return <FiUsers size={size} style={style} />;
    case "chart":
      return <FiBarChart size={size} style={style} />;
    case "grid":
      return <FiGrid size={size} style={style} />;
    default:
      return null;
  }
}

export default function MorphingArenaNav() {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Determine current arena page for collapsed state display
  const currentArenaPage = arenaMenuItems.find(
    (item) =>
      router.pathname === item.href ||
      (item.href === "/airdrop-genesis" &&
        router.pathname.startsWith("/airdrop-genesis") &&
        !arenaMenuItems.some((i) => i.href !== "/airdrop-genesis" && router.pathname === i.href))
  ) || arenaMenuItems[0];

  const isOnArenaPage = arenaMenuItems.some(
    (item) => router.pathname === item.href ||
    (item.href === "/airdrop-genesis" && router.pathname.startsWith("/airdrop-genesis"))
  );

  // Click outside detection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isExpanded]);

  // Escape key to close
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isExpanded) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isExpanded]);

  // Spring animation configuration
  const springConfig = {
    type: "spring" as const,
    stiffness: 400,
    damping: 30,
  };

  const buttonSpring = {
    type: "spring" as const,
    stiffness: 500,
    damping: 25,
  };

  return (
    <motion.div
      ref={containerRef}
      layout
      transition={{ layout: springConfig }}
      className="relative flex items-center rounded-md overflow-hidden"
      style={{
        background: COLORS.backgroundGradient,
        border: `1px solid ${COLORS.border}`,
      }}
    >
      <AnimatePresence mode="wait">
        {!isExpanded ? (
          // Collapsed state: Single button
          <motion.button
            key="collapsed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={() => setIsExpanded(true)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            className="flex h-8 items-center gap-1.5 px-3 cursor-pointer"
          >
            <span style={{ color: COLORS.primaryMint }}>
              <MenuIcon icon={currentArenaPage?.icon || "trophy"} size={14} />
            </span>
            <span
              style={{
                color: COLORS.brightMint,
                fontSize: "13px",
                fontWeight: 600,
                letterSpacing: "0.01em",
              }}
            >
              {isOnArenaPage ? currentArenaPage?.name?.toUpperCase() : "AIRDROP GENESIS"}
            </span>
          </motion.button>
        ) : (
          // Expanded state: Horizontal button strip
          <motion.div
            key="expanded"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-0.5 px-1 py-0.5"
          >
            {arenaMenuItems.map((item, index) => {
              const isActive =
                router.pathname === item.href ||
                (item.href === "/airdrop-genesis" && router.pathname.startsWith("/airdrop-genesis"));
              const isDisabled = item.disabled;

              if (isDisabled) {
                // Disabled item - render as non-clickable div
                return (
                  <motion.div
                    key={item.name}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: index * 0.05,
                      ...buttonSpring,
                    }}
                    className="flex h-7 items-center gap-1 px-2 rounded cursor-not-allowed"
                    style={{
                      color: COLORS.disabledText,
                    }}
                  >
                    <MenuIcon icon={item.icon} size={12} style={{ opacity: 0.5 }} />
                    <span
                      className="hidden sm:inline"
                      style={{
                        fontSize: "11px",
                        fontWeight: 600,
                        letterSpacing: "0.01em",
                        opacity: 0.5,
                      }}
                    >
                      {item.name}
                    </span>
                  </motion.div>
                );
              }

              // Active/enabled item - render as link
              return (
                <Link key={item.name} href={item.href} onClick={() => setIsExpanded(false)}>
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: index * 0.05,
                      ...buttonSpring,
                    }}
                    whileHover={{ scale: 1.02, backgroundColor: COLORS.hoverBg }}
                    whileTap={{ scale: 0.98 }}
                    className="flex h-7 items-center gap-1 px-2 rounded cursor-pointer transition-colors duration-150"
                    style={{
                      color: isActive ? COLORS.brightMint : COLORS.primaryMint,
                      backgroundColor: isActive ? COLORS.activeBg : "transparent",
                    }}
                  >
                    <MenuIcon icon={item.icon} size={12} style={{ opacity: isActive ? 1 : 0.8 }} />
                    <span
                      className="hidden sm:inline"
                      style={{
                        fontSize: "11px",
                        fontWeight: isActive ? 700 : 600,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {item.name}
                    </span>
                  </motion.div>
                </Link>
              );
            })}

            {/* Close button */}
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                delay: arenaMenuItems.length * 0.05,
                ...buttonSpring,
              }}
              whileHover={{ scale: 1.1, color: COLORS.brightMint }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setIsExpanded(false)}
              className="flex h-7 w-7 items-center justify-center rounded cursor-pointer"
              style={{
                color: COLORS.primaryMint,
              }}
            >
              <IoClose size={14} />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
