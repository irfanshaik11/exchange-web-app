import React, { useEffect, useState } from 'react';

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
}

export default function NotificationDropdown({ open, onClose }: NotificationDropdownProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (open) {
      setShow(true);
    } else {
      const timeout = setTimeout(() => setShow(false), 220);
      return () => clearTimeout(timeout);
    }
  }, [open]);

  if (!open && !show) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-end transition-colors duration-500 ${open ? 'bg-black/40' : 'bg-black/0'}`}
      style={{ backdropFilter: 'blur(2px)' }}
    >
      <div
        className={`bg-neutral-900 rounded-xl shadow-2xl w-full max-w-sm mt-16 mr-8 p-0 relative text-neutral-100 transform transition-all duration-500
          ${open ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-75 translate-y-2'}`}
        style={{ minHeight: '340px', minWidth: '350px', border: '1px solid #23272a' }}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-800">
          <span className="text-lg font-semibold">Notifications</span>
          <div className="flex items-center gap-4">
            <button className="text-xs text-neutral-400 hover:underline" onClick={() => {}}>
              Clear All
            </button>
            <button
              className="text-neutral-400 hover:text-white text-xl ml-2"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-16">
          <span className="text-neutral-500 text-base">No notifications</span>
        </div>
      </div>
    </div>
  );
} 