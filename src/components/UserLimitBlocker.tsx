import React from 'react';
import { FaUsers, FaClock, FaEnvelope } from 'react-icons/fa';

interface UserLimitBlockerProps {
  isOpen: boolean;
  message?: string;
}

const UserLimitBlocker: React.FC<UserLimitBlockerProps> = ({ isOpen, message }) => {
  if (!isOpen) return null;

  const defaultMessage = message || "Maximum number of users (100) has been reached. Registration is currently closed.";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-sm">
      <div className="relative w-full max-w-md mx-4">
        <div className="bg-gradient-to-br from-neutral-900 via-neutral-800 to-neutral-900 rounded-2xl shadow-2xl border border-neutral-700 p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-red-500/20 rounded-full blur-xl"></div>
              <div className="relative bg-red-500/10 rounded-full p-4 border border-red-500/30">
                <FaUsers className="w-12 h-12 text-red-400" />
              </div>
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-bold text-white mb-3">
            User Limit Reached
          </h2>

          {/* Message */}
          <p className="text-neutral-300 mb-6 leading-relaxed">
            {defaultMessage}
          </p>

          {/* Additional Info */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center justify-center gap-3 text-sm text-neutral-400">
              <FaClock className="w-4 h-4" />
              <span>Please try again later</span>
            </div>
            <div className="flex items-center justify-center gap-3 text-sm text-neutral-400">
              <FaEnvelope className="w-4 h-4" />
              <span>Contact support if you have questions</span>
            </div>
          </div>

          {/* Decorative Elements */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
          <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-red-500/50 to-transparent"></div>
        </div>

        {/* Background Pattern */}
        <div className="absolute inset-0 -z-10 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }}></div>
        </div>
      </div>
    </div>
  );
};

export default UserLimitBlocker;

