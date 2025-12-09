import React from 'react';
import toast, { type ToastOptions } from 'react-hot-toast';
import { 
  FaCheckCircle, 
  FaExclamationTriangle, 
  FaTimesCircle, 
  FaInfoCircle, 
  FaSpinner,
  FaLightbulb
} from 'react-icons/fa';

// Toast types with icons
export type ToastType = 'info' | 'loading' | 'success' | 'warning' | 'error' | 'tip';

// Action button type
export interface ToastAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

// Enhanced toast options
export interface EnhancedToastOptions extends ToastOptions {
  title?: string;
  description?: string;
  actions?: ToastAction[];
  showExplorerLink?: boolean;
  txHash?: string;
  suggestions?: string[];
  customContent?: React.ReactNode;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

const baseStyle = {
  background: '#1E1F26',
  color: '#E6E7EA',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: '500',
  maxWidth: '480px',
  padding: '16px',
  zIndex: 9999,
  boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  cursor: 'pointer', // Make entire toast clickable
} as const;

// Priority-based durations
const priorityDurations: Record<ToastType, number> = {
  info: 3000,      // 4 seconds
  loading: Infinity, // Until updated
  success: 2000,   // 3 seconds (fastest - just confirmation)
  warning: 4000,   // 4 seconds
  error: 5000,     // 5 seconds (slowest - needs reading)
  tip: 4000,       // 4 seconds
};

const typeStyles: Record<ToastType, { border: string; icon: React.ReactNode; color: string }> = {
  info: { border: '1px solid #3B82F6', icon: <FaInfoCircle />, color: '#3B82F6' },
  loading: { border: '1px solid #F59E0B', icon: <FaSpinner className="animate-spin" />, color: '#F59E0B' },
  success: { border: '1px solid #70E0B0', icon: <FaCheckCircle />, color: '#70E0B0' },
  warning: { border: '1px solid #F59E0B', icon: <FaExclamationTriangle />, color: '#F59E0B' },
  error: { border: '1px solid #ff6b6b', icon: <FaTimesCircle />, color: '#ff6b6b' },
  tip: { border: '1px solid #A78BFA', icon: <FaLightbulb />, color: '#A78BFA' },
};

// Get Solana explorer link
export const getExplorerLink = (txHash: string, cluster: 'mainnet' | 'devnet' = 'mainnet'): string => {
  return `https://solscan.io/tx/${txHash}${cluster === 'devnet' ? '?cluster=devnet' : ''}`;
};

// Format SOL amount
export const formatSol = (amount: number): string => {
  if (amount < 0.0001) return amount.toFixed(6);
  if (amount < 0.01) return amount.toFixed(4);
  return amount.toFixed(3);
};

// Enhanced toast component
const EnhancedToastContent = ({
  type,
  title,
  description,
  message,
  actions,
  showExplorerLink,
  txHash,
  suggestions,
  toastId,
  customContent,
}: {
  type: ToastType;
  title?: string;
  description?: string;
  message?: string;
  actions?: ToastAction[];
  showExplorerLink?: boolean;
  txHash?: string;
  suggestions?: string[];
  toastId?: string;
  customContent?: React.ReactNode;
}) => {
  const style = typeStyles[type];

  // If custom content is provided, render it instead of default content
  if (customContent) {
    return (
      <div 
        style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '320px' }}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (!target.closest('a') && !target.closest('button')) {
            if (toastId) toast.dismiss(toastId);
          }
        }}
      >
        {customContent}
      </div>
    );
  }

  return (
    <div 
      style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '320px' }}
      onClick={(e) => {
        // Click anywhere on toast to dismiss (except on links/buttons)
        const target = e.target as HTMLElement;
        if (!target.closest('a') && !target.closest('button')) {
          if (toastId) toast.dismiss(toastId);
        }
      }}
    >
      {/* Header with icon and title */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: style.icon ? '12px' : '0' }}>
        {style.icon && <span style={{ fontSize: '20px', flexShrink: 0, color: style.color }}>{style.icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {title && (
            <div style={{ fontWeight: '600', fontSize: '15px', color: style.color, marginBottom: '4px' }}>
              {title}
            </div>
          )}
          {(description || message) && (
            <div style={{ fontSize: '13px', color: '#E6E7EA', lineHeight: '1.5' }}>
              {description || message}
            </div>
          )}
        </div>
      </div>

      {/* Explorer link */}
      {showExplorerLink && txHash && (
        <a
          href={getExplorerLink(txHash)}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: '12px',
            color: style.color,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            marginTop: '4px',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <span>View on Solscan</span>
          <span style={{ fontSize: '10px' }}>→</span>
        </a>
      )}

      {/* Suggestions */}
      {suggestions && suggestions.length > 0 && (
        <div style={{ 
          marginTop: '8px', 
          padding: '8px 12px', 
          background: 'rgba(167, 139, 250, 0.1)',
          borderRadius: '8px',
          borderLeft: '3px solid #A78BFA'
        }}>
          <div style={{ fontSize: '12px', fontWeight: '600', color: '#A78BFA', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FaLightbulb style={{ fontSize: '14px' }} /> Suggestions:
          </div>
          {suggestions.map((suggestion, idx) => (
            <div key={idx} style={{ fontSize: '12px', color: '#E6E7EA', marginLeft: '8px', marginTop: '2px' }}>
              • {suggestion}
            </div>
          ))}
        </div>
      )}

      {/* Action buttons */}
      {actions && actions.length > 0 && (
        <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
          {actions.map((action, idx) => (
            <button
              key={idx}
              onClick={(e) => {
                e.stopPropagation();
                action.onClick();
              }}
              style={{
                flex: 1,
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: '600',
                borderRadius: '6px',
                border: 'none',
                cursor: 'pointer',
                background: action.variant === 'primary' ? style.color : 'rgba(255, 255, 255, 0.1)',
                color: action.variant === 'primary' ? '#1E1F26' : '#E6E7EA',
                transition: 'all 0.2s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.opacity = '0.8';
                e.currentTarget.style.transform = 'translateY(-1px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.opacity = '1';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Get toast position from localStorage
const getToastPosition = (): 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' => {
  if (typeof window === 'undefined') return 'top-center';
  try {
    const saved = localStorage.getItem('toast-position');
    
    // Migrate from bottom-center to top-center (or if no value exists)
    if (!saved || saved === 'bottom-center') {
      localStorage.setItem('toast-position', 'top-center');
      return 'top-center';
    }
    
    if (['top-left', 'top-center', 'top-right', 'bottom-left', 'bottom-center', 'bottom-right'].includes(saved)) {
      return saved as any;
    }
    
    // Invalid value, migrate to top-center
    localStorage.setItem('toast-position', 'top-center');
    return 'top-center';
  } catch {
    // Ignore
  }
  return 'top-center';
};

// Main enhanced toast function
export const showEnhancedToast = (
  type: ToastType,
  message: string,
  options?: EnhancedToastOptions
): string => {
  const style = typeStyles[type];
  
  // Use priority-based duration, but allow override via options
  const duration = options?.duration || priorityDurations[type];
  
  // Get position from options or localStorage
  const position = options?.position || getToastPosition();
  
  const toastOptions: ToastOptions = {
    duration,
    position,
    ...options,
    style: {
      ...baseStyle,
      ...(options?.style ?? {}),
      border: options?.style?.border ?? style.border,
    },
  };

  // Create a temporary ID for the toast
  let finalId: string = '';
  
  const content = (
    <EnhancedToastContent
      type={type}
      title={options?.title}
      description={options?.description}
      message={message}
      actions={options?.actions}
      showExplorerLink={options?.showExplorerLink}
      txHash={options?.txHash}
      suggestions={options?.suggestions}
      toastId={finalId}
      customContent={options?.customContent}
    />
  );

  // Use base toast() for ALL types to prevent react-hot-toast from adding its own icons
  // This gives us full control over icons (no duplicate checkmarks or spinners)
  finalId = toast(content, toastOptions);
  
  // Update the toast with the correct ID so click-to-dismiss works
  toast(
    <EnhancedToastContent
      type={type}
      title={options?.title}
      description={options?.description}
      message={message}
      actions={options?.actions}
      showExplorerLink={options?.showExplorerLink}
      txHash={options?.txHash}
      suggestions={options?.suggestions}
      toastId={finalId}
      customContent={options?.customContent}
    />,
    { ...toastOptions, id: finalId }
  );
  
  return finalId;
};

// Update existing toast
export const updateEnhancedToast = (
  id: string | null,
  type: ToastType,
  message: string,
  options?: EnhancedToastOptions
) => {
  if (!id) return;
  
  const style = typeStyles[type];
  
  // Use priority-based duration, but allow override via options
  const duration = options?.duration || priorityDurations[type];
  
  // Get position from options or localStorage
  const position = options?.position || getToastPosition();
  
  const toastOptions: ToastOptions = {
    id,
    duration,
    position,
    ...options,
    style: {
      ...baseStyle,
      ...(options?.style ?? {}),
      border: options?.style?.border ?? style.border,
    },
  };

  const content = (
    <EnhancedToastContent
      type={type}
      title={options?.title}
      description={options?.description}
      message={message}
      actions={options?.actions}
      showExplorerLink={options?.showExplorerLink}
      txHash={options?.txHash}
      suggestions={options?.suggestions}
      toastId={id}
      customContent={options?.customContent}
    />
  );

  // Use base toast() to prevent react-hot-toast from adding its own icons
  toast(content, toastOptions);
};

// Dismiss toast
export const dismissToast = (id: string | null) => {
  if (id) toast.dismiss(id);
};

