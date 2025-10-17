import React, { useState } from 'react';
import { 
  FaBars, 
  FaChevronDown, 
  FaBookmark, 
  FaTh, 
  FaVolumeUp, 
  FaCrosshairs, 
  FaCog, 
  FaWallet 
} from 'react-icons/fa';
import { SiSolana } from 'react-icons/si';

interface PulseControlBarProps {
  className?: string;
}

export default function PulseControlBar({ className = '' }: PulseControlBarProps) {
  const [displayDropdownOpen, setDisplayDropdownOpen] = useState(false);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  return (
    <div className={`flex items-center justify-end ${className}`}>
      {/* Display Button - Pill Shape */}
      <div className="relative mr-4">
        <button
          onClick={() => setDisplayDropdownOpen(!displayDropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-full transition-colors"
        >
          <FaBars className="text-neutral-300" size={12} />
          <span className="text-neutral-300 text-xs font-medium">Display</span>
          <FaChevronDown className="text-neutral-400" size={10} />
        </button>
        
        {displayDropdownOpen && (
          <div className="absolute top-full right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-10 min-w-[200px]">
            <div className="py-2">
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Table View
              </div>
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Card View
              </div>
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Compact View
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Individual Icons */}
      <div className="flex items-center gap-3 mr-4">
        <button className="p-1.5 text-neutral-400 hover:text-neutral-300 transition-colors" title="Bookmarks">
          <FaBookmark size={14} />
        </button>
        
        <button className="p-1.5 text-neutral-400 hover:text-neutral-300 transition-colors" title="Grid View">
          <FaTh size={14} />
        </button>
        
        <button className="p-1.5 text-neutral-400 hover:text-neutral-300 transition-colors" title="Audio Alerts">
          <FaVolumeUp size={14} />
        </button>
        
        <button className="p-1.5 text-neutral-400 hover:text-neutral-300 transition-colors" title="Target Settings">
          <div className="relative">
            <FaCrosshairs size={14} />
            <FaCog 
              size={8} 
              className="absolute -bottom-0.5 -right-0.5 text-neutral-500" 
            />
          </div>
        </button>
      </div>

      {/* Wallet/Solana Status - Sleek Pill */}
      <div className="relative">
        <button
          onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
          className="flex items-center gap-2 px-3 py-1.5 bg-transparent border border-neutral-600 hover:border-neutral-500 rounded-full transition-all duration-200"
        >
          <FaWallet className="text-neutral-300" size={12} />
          <span className="text-neutral-300 text-xs font-medium">1</span>
          
          {/* Separation Line */}
          <div className="w-px h-3 bg-neutral-500"></div>
          
          {/* Solana Logo with Official Colors */}
          <div className="flex items-center">
            <SiSolana 
              className="text-white" 
              size={12} 
              style={{ 
                color: 'unset',
                fill: 'url(#solana-gradient-control)',
                filter: 'none'
              }} 
            />
            <svg className="absolute w-0 h-0">
              <defs>
                <linearGradient id="solana-gradient-control" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#9945FF" />
                  <stop offset="100%" stopColor="#14F195" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          
          <span className="text-neutral-300 text-xs font-medium">0</span>
          <FaChevronDown className="text-neutral-400" size={10} />
        </button>
        
        {statusDropdownOpen && (
          <div className="absolute top-full right-0 mt-1 bg-neutral-800 border border-neutral-700 rounded-lg shadow-lg z-10 min-w-[200px]">
            <div className="py-2">
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Wallet Status
              </div>
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Connection Settings
              </div>
              <div className="px-3 py-2 text-neutral-300 text-sm hover:bg-neutral-700 cursor-pointer">
                Preferences
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
