import toast from 'react-hot-toast';
import type React from 'react';

export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
}

export interface EnhancedToastOptions {
  id?: string;
  title?: string;
  description?: string;
  actions?: ToastAction[];
  suggestions?: string[];
  duration?: number;
  dismissible?: boolean;
  showExplorerLink?: boolean;
  txHash?: string;
  style?: React.CSSProperties;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  customContent?: React.ReactNode;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';

/**
 * Show an enhanced toast with optional title, actions, and suggestions
 */
export function showEnhancedToast(
  type: ToastType,
  message: string,
  options?: EnhancedToastOptions
): string {
  const { title, description, actions, suggestions, duration = 4000, dismissible = true } = options || {};

  // Build the toast message with optional components
  let toastMessage = message;
  
  if (title) {
    toastMessage = `${title}\n${message}`;
  }
  
  if (description) {
    toastMessage += `\n${description}`;
  }
  
  if (suggestions && suggestions.length > 0) {
    toastMessage += `\n\nSuggestions:\n${suggestions.map(s => `• ${s}`).join('\n')}`;
  }

  const toastOptions = {
    duration,
    style: {
      background: '#1a1b1e',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '12px 16px',
      maxWidth: '500px',
    },
  };

  // Show appropriate toast type
  switch (type) {
    case 'success':
      return toast.success(toastMessage, toastOptions);
    case 'error':
      return toast.error(toastMessage, { ...toastOptions, duration: 6000 });
    case 'warning':
      return toast(toastMessage, {
        ...toastOptions,
        icon: '⚠️',
        duration: 5000,
      });
    case 'info':
      return toast(toastMessage, {
        ...toastOptions,
        icon: 'ℹ️',
      });
    case 'loading':
      return toast.loading(toastMessage, { ...toastOptions, duration: Infinity });
    default:
      return toast(toastMessage, toastOptions);
  }
}

/**
 * Update an existing toast
 */
export function updateEnhancedToast(
  id: string,
  type: ToastType,
  message: string,
  options?: EnhancedToastOptions
): void {
  const { title, description, duration = 4000 } = options || {};

  let toastMessage = message;
  
  if (title) {
    toastMessage = `${title}\n${message}`;
  }
  
  if (description) {
    toastMessage += `\n${description}`;
  }

  const toastOptions = {
    duration,
    style: {
      background: '#1a1b1e',
      color: '#fff',
      border: '1px solid rgba(255, 255, 255, 0.1)',
      borderRadius: '8px',
      padding: '12px 16px',
      maxWidth: '500px',
    },
  };

  if (type === 'success') {
    toast.success(toastMessage, { ...toastOptions, id });
  } else if (type === 'error') {
    toast.error(toastMessage, { ...toastOptions, id, duration: 6000 });
  } else if (type === 'loading') {
    toast.loading(toastMessage, { ...toastOptions, id, duration: Infinity });
  } else {
    toast(toastMessage, { ...toastOptions, id });
  }
}

/**
 * Dismiss a toast by ID
 */
export function dismissToast(id: string): void {
  toast.dismiss(id);
}

/**
 * Format SOL amount for display
 */
export function formatSol(amount: number): string {
  if (amount >= 1) {
    return amount.toFixed(4);
  } else if (amount >= 0.001) {
    return amount.toFixed(6);
  } else {
    return amount.toFixed(9);
  }
}

/**
 * Get Solana explorer link for transaction
 */
export function getExplorerLink(txHash: string, cluster: 'mainnet' | 'devnet' = 'mainnet'): string {
  const baseUrl = cluster === 'mainnet' 
    ? 'https://solscan.io/tx' 
    : 'https://solscan.io/tx?cluster=devnet';
  return `${baseUrl}/${txHash}`;
}

