import React, { useState, useEffect } from 'react';
import { FiX, FiChevronLeft, FiChevronRight } from 'react-icons/fi';
import Cookies from 'js-cookie';

interface Update {
  id: string;
  title: string;
  description: string;
  badge?: string;
  badgeColor?: string;
  image?: string;
  actionText?: string;
  actionLink?: string;
}

interface UpdatesModalProps {
  updates: Update[];
  onClose: () => void;
  storageKey?: string;
}

export default function UpdatesModal({ updates, onClose, storageKey = 'trenches-updates-viewed' }: UpdatesModalProps) {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Fade in animation
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  const handleClose = () => {
    // Set cookie immediately when closing to prevent modal from showing again
    if (storageKey) {
      // Use cookies instead of localStorage for better persistence across hard refreshes
      // Set cookie to expire in 1 year - this ensures it persists across all refreshes
      Cookies.set(storageKey, 'viewed', { expires: 365, path: '/' });
    }
    setIsVisible(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  const handleNext = () => {
    if (currentSlide < updates.length - 1) {
      setCurrentSlide(currentSlide + 1);
    }
  };

  const handlePrev = () => {
    if (currentSlide > 0) {
      setCurrentSlide(currentSlide - 1);
    }
  };

  const handleDotClick = (index: number) => {
    setCurrentSlide(index);
  };

  if (updates.length === 0) return null;

  const currentUpdate = updates[currentSlide];

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-opacity duration-300 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.85)' }}
      onClick={handleClose}
    >
      <div
        className={`relative w-full max-w-2xl rounded-2xl border border-neutral-700/50 bg-[#0a0b10] shadow-2xl transition-all duration-300 ${
          isVisible ? 'scale-100' : 'scale-95'
        }`}
        style={{
          minHeight: '600px',
          maxHeight: '600px',
          height: '600px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 z-10 rounded-full bg-neutral-800/60 p-2 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          aria-label="Close"
        >
          <FiX className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="flex h-full flex-col items-center justify-center px-8 py-12 overflow-y-auto"
          style={{
            maxHeight: '600px',
          }}
        >
          {/* Image/Logo Section */}
          <div className="mb-8 flex h-40 w-full items-center justify-center overflow-hidden rounded-xl bg-black/40"
            style={{ minHeight: '160px', maxHeight: '160px' }}
          >
            {currentUpdate.image && (
              <img
                src={currentUpdate.image}
                alt={currentUpdate.title}
                className="max-h-full max-w-full object-contain"
              />
            )}
          </div>

          {/* Title */}
          <h2 className="mb-3 text-center text-2xl font-bold text-white">
            {currentUpdate.title}
          </h2>

          {/* Badge */}
          {currentUpdate.badge && (
            <div
              className={`mb-4 inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wider ${
                currentUpdate.badgeColor || 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              }`}
            >
              <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current opacity-60"></span>
              {currentUpdate.badge}
            </div>
          )}

          {/* Description */}
          <div className="mb-6 max-w-md text-center"
            style={{ minHeight: '80px' }}
          >
            <p className="text-base text-neutral-300">
              {currentUpdate.description}
            </p>
          </div>

          {/* Action Link */}
          <div className="mb-6 text-center"
            style={{ minHeight: '24px' }}
          >
            {currentUpdate.actionText && currentUpdate.actionLink && (
              <a
                href={currentUpdate.actionLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-emerald-400 hover:text-emerald-300 hover:underline"
              >
                {currentUpdate.actionText}
              </a>
            )}
          </div>

          {/* Navigation Dots */}
          {updates.length > 1 && (
            <div className="mb-6 flex items-center gap-2">
              {updates.map((_, index) => (
                <button
                  key={index}
                  onClick={() => handleDotClick(index)}
                  className={`h-2 rounded-full transition-all ${
                    index === currentSlide
                      ? 'w-8 bg-emerald-500'
                      : 'w-2 bg-neutral-600 hover:bg-neutral-500'
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          )}

          {/* Navigation Buttons */}
          <div className="flex w-full items-center justify-between gap-4">
            {updates.length > 1 ? (
              <>
                <button
                  onClick={handlePrev}
                  disabled={currentSlide === 0}
                  className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                    currentSlide === 0
                      ? 'cursor-not-allowed text-neutral-600'
                      : 'text-neutral-300 hover:bg-neutral-800 hover:text-white'
                  }`}
                >
                  <FiChevronLeft className="h-4 w-4" />
                  Previous
                </button>
                {currentSlide === updates.length - 1 ? (
                  <button
                    onClick={handleClose}
                    className="flex-1 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40"
                  >
                    Finish
                  </button>
                ) : (
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-neutral-300 transition-colors hover:bg-neutral-800 hover:text-white"
                  >
                    Next
                    <FiChevronRight className="h-4 w-4" />
                  </button>
                )}
              </>
            ) : (
              <button
                onClick={handleClose}
                className="w-full rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-500 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-500/25 transition-all hover:shadow-emerald-500/40"
              >
                Finish
              </button>
            )}
          </div>
        </div>

        {/* Bottom Notification Badge */}
        <div className="absolute -bottom-12 left-0 right-0 flex items-center justify-center">
          <div className="flex items-center gap-2 rounded-full border border-emerald-500/30 bg-[#0a0b10] px-4 py-2 shadow-lg">
            <svg
              className="h-5 w-5 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            <span className="text-sm font-medium text-neutral-200">
              Trenches just Updated!
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

