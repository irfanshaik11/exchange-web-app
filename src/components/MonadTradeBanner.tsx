"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/router";
import { FaTimes } from "react-icons/fa";
import Image from "next/image";

interface MonadTradeBannerProps {
  /** Whether the banner can be dismissed */
  dismissible?: boolean;
  /** Custom className */
  className?: string;
}

export default function MonadTradeBanner({
  dismissible = true,
  className = "",
}: MonadTradeBannerProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [logoError, setLogoError] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setIsMounted(true);
    // Check if user has dismissed the banner
    if (dismissible && typeof window !== "undefined") {
      const dismissed = localStorage.getItem("monad-banner-dismissed");
      if (dismissed === "true") {
        setIsVisible(false);
      }
    }
  }, [dismissible]);

  const handleDismiss = () => {
    setIsVisible(false);
    if (typeof window !== "undefined") {
      localStorage.setItem("monad-banner-dismissed", "true");
    }
  };

  const handleClick = () => {
    // Navigate to Monad table on pulse page
    router.push("/pulse?chain=monad");
  };

  if (!isMounted || !isVisible) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{
            type: "spring",
            stiffness: 300,
            damping: 30,
            duration: 0.6,
          }}
          className={`relative w-full overflow-hidden z-50 ${className}`}
        >
          {/* Animated gradient background with multiple layers - Purple theme */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#9333ea] via-[#7c3aed] to-[#6d28d9]" />
          
          {/* Smooth wave animation - first layer */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/12 to-transparent"
            animate={{
              x: ["-150%", "250%"],
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              ease: [0.25, 0.1, 0.25, 1], // Very smooth cubic bezier
              repeatDelay: 0.3,
            }}
            style={{
              width: "70%",
              transform: "skewX(-12deg)",
            }}
          />

          {/* Smooth wave animation - second layer */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/18 to-transparent"
            animate={{
              x: ["-150%", "250%"],
            }}
            transition={{
              duration: 7,
              repeat: Infinity,
              ease: [0.25, 0.1, 0.25, 1], // Very smooth cubic bezier
              repeatDelay: 0.6,
            }}
            style={{
              width: "60%",
              transform: "skewX(-10deg)",
            }}
          />

          {/* Smooth wave animation - third layer for depth */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-purple-200/15 to-transparent"
            animate={{
              x: ["-150%", "250%"],
            }}
            transition={{
              duration: 9,
              repeat: Infinity,
              ease: [0.25, 0.1, 0.25, 1], // Very smooth cubic bezier
              repeatDelay: 0.4,
            }}
            style={{
              width: "55%",
              transform: "skewX(-8deg)",
            }}
          />

          {/* Content */}
          <div className="relative z-10 flex items-center justify-center gap-3 md:gap-4 px-4 py-3 md:py-4">
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="relative flex items-center justify-center w-6 h-6 md:w-8 md:h-8"
            >
              {logoError ? (
                <div className="w-6 h-6 md:w-8 md:h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs md:text-sm">
                  M
                </div>
              ) : (
                <Image
                  src="https://monad.xyz/favicon.ico"
                  alt="Monad Logo"
                  width={32}
                  height={32}
                  className="w-6 h-6 md:w-8 md:h-8 object-contain"
                  unoptimized
                  onError={() => setLogoError(true)}
                />
              )}
            </motion.div>

            <motion.button
              onClick={handleClick}
              className="flex items-center gap-2 group cursor-pointer relative z-20"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <motion.span
                className="text-white font-bold text-sm md:text-base lg:text-lg tracking-wider uppercase"
                style={{
                  textShadow: "0 0 20px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3)",
                }}
                animate={{
                  textShadow: [
                    "0 0 20px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3)",
                    "0 0 30px rgba(255,255,255,0.9), 0 0 60px rgba(255,255,255,0.5)",
                    "0 0 20px rgba(255,255,255,0.6), 0 0 40px rgba(255,255,255,0.3)",
                  ],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                TRADE MONAD NOW!
              </motion.span>

              {/* Arrow indicator */}
              <motion.div
                animate={{
                  x: [0, 5, 0],
                }}
                transition={{
                  duration: 1.5,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
                className="text-white text-lg md:text-xl"
              >
                →
              </motion.div>
            </motion.button>

            {/* Pulse effect around text */}
            <motion.div
              className="absolute inset-0 pointer-events-none z-0"
              animate={{
                scale: [1, 1.15, 1],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: 2.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-20 bg-white/15 rounded-full blur-2xl" />
            </motion.div>

            {/* Dismiss button */}
            {dismissible && (
              <motion.button
                onClick={handleDismiss}
                className="ml-auto text-white/80 hover:text-white transition-colors p-1 rounded-full hover:bg-white/10"
                whileHover={{ scale: 1.1, rotate: 90 }}
                whileTap={{ scale: 0.9 }}
                aria-label="Dismiss banner"
              >
                <FaTimes className="text-sm md:text-base" />
              </motion.button>
            )}
          </div>

          {/* Bottom border glow */}
          <motion.div
            className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/50"
            animate={{
              opacity: [0.3, 1, 0.3],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

