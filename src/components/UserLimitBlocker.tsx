import React from 'react';
import { FaUsers, FaClock, FaEnvelope, FaDiscord, FaTelegram } from 'react-icons/fa';

// Custom X (Twitter) icon component
const XIcon = ({ size = 20, className }: { size?: number; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

interface UserLimitBlockerProps {
  isOpen: boolean;
  message?: string;
}

const UserLimitBlocker: React.FC<UserLimitBlockerProps> = ({ isOpen, message }) => {
  if (!isOpen) return null;

  const defaultMessage = message || "Maximum number of users has been reached. Registration is currently closed.";

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

          {/* Social Links */}
          <div className="mt-6 pt-6 border-t border-neutral-700">
            <p className="text-sm text-neutral-400 mb-4">Stay updated on our social channels:</p>
            <div className="flex items-center justify-center gap-4">
              <a
                href="https://discord.gg/sACYQmCsTJ"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800 hover:bg-[#5865F2] border border-neutral-700 hover:border-[#5865F2] transition-all duration-200 group"
                title="Discord"
              >
                <FaDiscord className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
              </a>
              <a
                href="https://x.com/narrative_hq"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800 hover:bg-black border border-neutral-700 hover:border-neutral-600 transition-all duration-200 group"
                title="Twitter"
              >
                <XIcon size={20} className="text-neutral-400 group-hover:text-white transition-colors" />
              </a>
              <a
                href="https://t.me/+DDXGrsJoe3szYTAx"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 rounded-full bg-neutral-800 hover:bg-[#0088cc] border border-neutral-700 hover:border-[#0088cc] transition-all duration-200 group"
                title="Telegram"
              >
                <FaTelegram className="w-5 h-5 text-neutral-400 group-hover:text-white transition-colors" />
              </a>
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

