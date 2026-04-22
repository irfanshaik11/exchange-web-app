/**
 * Username Edit Modal
 *
 * Premium dark theme matching Arena page design.
 * Features:
 * - Debounced availability check as user types
 * - Format validation (3-20 chars, alphanumeric + underscore)
 * - Reserved word checking
 * - Visual feedback for valid/invalid/taken states
 */

import React, { useState, useEffect, useCallback } from 'react';
import { FiX, FiCheck, FiAlertCircle } from 'react-icons/fi';
import { toast } from 'react-hot-toast';
import { checkUsernameAvailability, updateUsername } from '~/utils/api';
import { isBotUsername } from '~/utils/botUsernames';
import { useUser } from './UserContext';

interface UsernameEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUsername?: string | null;
  onSuccess?: (newUsername: string) => void;
}

// Debounce hook for username checking
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

// Loading spinner component
const Spinner = ({ className = '' }: { className?: string }) => (
  <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
  </svg>
);

export default function UsernameEditModal({
  isOpen,
  onClose,
  currentUsername,
  onSuccess,
}: UsernameEditModalProps) {
  const { user, refreshUser } = useUser();
  const [username, setUsername] = useState(currentUsername || '');
  const [isChecking, setIsChecking] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationState, setValidationState] = useState<{
    isValid: boolean;
    isAvailable: boolean | null;
    error: string | null;
  }>({
    isValid: false,
    isAvailable: null,
    error: null,
  });

  // Debounce the username for API checks
  const debouncedUsername = useDebounce(username, 500);

  // Username format validation
  const validateFormat = useCallback((value: string): { valid: boolean; error: string | null } => {
    if (!value || value.length === 0) {
      return { valid: false, error: null };
    }

    if (value.length < 3) {
      return { valid: false, error: 'Username must be at least 3 characters' };
    }

    if (value.length > 20) {
      return { valid: false, error: 'Username must be 20 characters or less' };
    }

    const usernameRegex = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
    if (!usernameRegex.test(value)) {
      if (!/^[a-zA-Z_]/.test(value)) {
        return { valid: false, error: 'Must start with a letter or underscore' };
      }
      return { valid: false, error: 'Only letters, numbers, and underscores allowed' };
    }

    const reservedWords = ['admin', 'administrator', 'root', 'system', 'interstate', 'support', 'help', 'null', 'undefined'];
    if (reservedWords.includes(value.toLowerCase()) || isBotUsername(value)) {
      return { valid: false, error: 'This username is reserved' };
    }

    return { valid: true, error: null };
  }, []);

  // Check availability when debounced username changes
  useEffect(() => {
    const checkAvailability = async () => {
      // Skip if same as current username (case-insensitive)
      if (debouncedUsername.toLowerCase() === currentUsername?.toLowerCase()) {
        setValidationState({
          isValid: true,
          isAvailable: true,
          error: null,
        });
        return;
      }

      // First validate format
      const formatValidation = validateFormat(debouncedUsername);
      if (!formatValidation.valid) {
        setValidationState({
          isValid: false,
          isAvailable: null,
          error: formatValidation.error,
        });
        return;
      }

      // Check availability via API
      setIsChecking(true);
      try {
        const result = await checkUsernameAvailability(debouncedUsername);
        setValidationState({
          isValid: result.valid,
          isAvailable: result.available,
          error: result.available ? null : 'Username is already taken',
        });
      } catch (error: any) {
        setValidationState({
          isValid: false,
          isAvailable: false,
          error: error?.message || 'Failed to check availability',
        });
      } finally {
        setIsChecking(false);
      }
    };

    if (debouncedUsername) {
      checkAvailability();
    } else {
      setValidationState({
        isValid: false,
        isAvailable: null,
        error: null,
      });
    }
  }, [debouncedUsername, currentUsername, validateFormat]);

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validationState.isValid || !validationState.isAvailable) {
      return;
    }

    if (!user?.bearerToken) {
      toast.error('Please log in to update your username');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await updateUsername(user.bearerToken, username);

      if (result.success) {
        toast.success('Username updated successfully!');
        // Refresh user data to get the new username
        await refreshUser();
        onSuccess?.(result.username);
        onClose();
      }
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update username');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle input change - allow uppercase letters
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
    setUsername(value);
  };

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setUsername(currentUsername || '');
      setValidationState({
        isValid: false,
        isAvailable: null,
        error: null,
      });
    }
  }, [isOpen, currentUsername]);

  if (!isOpen) return null;

  const canSubmit =
    validationState.isValid &&
    validationState.isAvailable &&
    !isChecking &&
    !isSubmitting &&
    username.toLowerCase() !== currentUsername?.toLowerCase();

  const hasChanged = username.toLowerCase() !== currentUsername?.toLowerCase();

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-[420px] bg-[#0a0a0a] border border-neutral-800/60 rounded-2xl shadow-2xl overflow-hidden">
        {/* Subtle gradient glow */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] to-transparent pointer-events-none" />

        {/* Header */}
        <div className="relative flex items-center justify-between px-6 py-5 border-b border-neutral-800/60">
          <div>
            <h2 className="text-lg font-bold text-white tracking-wide">Edit Username</h2>
            <p className="text-xs text-neutral-500 mt-0.5">Choose a unique display name</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-lg transition-colors group"
          >
            <FiX className="w-5 h-5 text-neutral-500 group-hover:text-white transition-colors" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="relative p-6">
          {/* Username Input */}
          <div className="mb-5">
            <label className="block text-xs font-medium text-neutral-400 mb-2 uppercase tracking-wider">
              Username
            </label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-600 font-medium">
                @
              </span>
              <input
                type="text"
                value={username}
                onChange={handleInputChange}
                placeholder="your_username"
                maxLength={20}
                autoFocus
                className={`w-full pl-9 pr-12 py-3.5 bg-neutral-900/80 border rounded-xl text-white placeholder-neutral-600 focus:outline-none transition-all font-medium ${
                  validationState.error
                    ? 'border-red-500/40 focus:border-red-500/60'
                    : validationState.isAvailable && hasChanged
                    ? 'border-emerald-500/40 focus:border-emerald-500/60'
                    : 'border-neutral-800 focus:border-neutral-700'
                }`}
              />
              {/* Status indicator */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2">
                {isChecking ? (
                  <Spinner className="w-5 h-5 text-neutral-500" />
                ) : validationState.isAvailable && hasChanged ? (
                  <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <FiCheck className="w-4 h-4 text-emerald-400" />
                  </div>
                ) : validationState.error ? (
                  <div className="w-6 h-6 rounded-full bg-red-500/20 flex items-center justify-center">
                    <FiAlertCircle className="w-4 h-4 text-red-400" />
                  </div>
                ) : null}
              </div>
            </div>

            {/* Validation message */}
            <div className="h-5 mt-2">
              {validationState.error ? (
                <p className="text-xs text-red-400">{validationState.error}</p>
              ) : validationState.isAvailable && hasChanged && !isChecking ? (
                <p className="text-xs text-emerald-400">Username is available!</p>
              ) : (
                <p className="text-xs text-neutral-600">
                  3-20 characters • Letters, numbers, underscores
                </p>
              )}
            </div>
          </div>

          {/* Current username display */}
          {currentUsername && (
            <div className="mb-5 p-4 bg-neutral-900/50 rounded-xl border border-neutral-800/40">
              <p className="text-[10px] text-neutral-500 uppercase tracking-wider mb-1">Current Username</p>
              <p className="text-white font-mono font-medium">@{currentUsername}</p>
            </div>
          )}

          {/* Referral link preview */}
          {username && validationState.isValid && hasChanged && (
            <div className="mb-6 p-4 bg-emerald-500/5 rounded-xl border border-emerald-500/20">
              <p className="text-[10px] text-emerald-400/80 uppercase tracking-wider mb-1">Your New Referral Link</p>
              <p className="text-emerald-300 font-mono text-sm">
                interstate.trade?ref={username.toLowerCase().substring(0, 10)}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-4 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 hover:text-white font-semibold rounded-xl transition-all border border-neutral-800 hover:border-neutral-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!canSubmit}
              className={`flex-1 py-3.5 px-4 font-semibold rounded-xl transition-all ${
                canSubmit
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-black'
                  : 'bg-neutral-800 text-neutral-600 cursor-not-allowed'
              }`}
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <Spinner className="w-4 h-4" />
                  Saving...
                </span>
              ) : (
                'Save Username'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
