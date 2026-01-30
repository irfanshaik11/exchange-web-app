/**
 * ReferralCodeShare Component
 *
 * Displays the user's referral code and link with copy functionality.
 */

import React, { useState } from 'react';
import { Copy, Check, Share2, Twitter } from 'lucide-react';
import InterstateButton from '~/components/InterstateButton';
import { toast } from 'react-hot-toast';

interface ReferralCodeShareProps {
  referralCode: string;
  referralLink: string;
  className?: string;
}

export default function ReferralCodeShare({
  referralCode,
  referralLink,
  className = '',
}: ReferralCodeShareProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  const copyToClipboard = async (text: string, type: 'link' | 'code') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'link') {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      } else {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      }
      toast.success(`${type === 'link' ? 'Link' : 'Code'} copied!`);
    } catch (err) {
      toast.error('Failed to copy');
    }
  };

  const shareOnTwitter = () => {
    const text = `Join me on Interstate and start trading! Use my referral link:`;
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(referralLink)}`;
    window.open(url, '_blank');
  };

  return (
    <div className={`bg-neutral-900/50 rounded-2xl p-6 border border-neutral-800 ${className}`}>
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
          <Share2 className="w-6 h-6 text-emerald-400" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Share Your Referral</h3>
          <p className="text-sm text-neutral-400">Earn SOL from every trade your referrals make</p>
        </div>
      </div>

      {/* Referral Code */}
      <div className="mb-4">
        <label className="text-sm text-neutral-400 block mb-2">Your Referral Code</label>
        <div className="flex gap-2">
          <div className="flex-1 px-4 py-3 bg-neutral-800 rounded-lg font-mono text-lg text-white">
            {referralCode}
          </div>
          <InterstateButton
            variant="secondary"
            onClick={() => copyToClipboard(referralCode, 'code')}
            icon={copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          >
            {copiedCode ? 'Copied' : 'Copy'}
          </InterstateButton>
        </div>
      </div>

      {/* Referral Link */}
      <div className="mb-6">
        <label className="text-sm text-neutral-400 block mb-2">Your Referral Link</label>
        <div className="flex gap-2">
          <div className="flex-1 px-4 py-3 bg-neutral-800 rounded-lg text-sm text-neutral-300 truncate">
            {referralLink}
          </div>
          <InterstateButton
            variant="primary"
            onClick={() => copyToClipboard(referralLink, 'link')}
            icon={copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          >
            {copiedLink ? 'Copied!' : 'Copy Link'}
          </InterstateButton>
        </div>
      </div>

      {/* Social Share */}
      <div className="flex gap-3">
        <InterstateButton
          variant="secondary"
          onClick={shareOnTwitter}
          icon={<Twitter className="w-4 h-4" />}
          fullWidth
        >
          Share on X
        </InterstateButton>
      </div>

      {/* Info */}
      <div className="mt-6 p-4 bg-neutral-800/50 rounded-lg">
        <p className="text-sm text-neutral-400">
          <span className="text-emerald-400 font-semibold">Pro tip:</span> Share your
          referral link with a specific token to earn when they trade:
        </p>
        <code className="text-xs text-neutral-500 mt-2 block">
          {referralLink.replace('?referrer=', '/trade/TOKEN_ADDRESS?ref=')}
        </code>
      </div>
    </div>
  );
}
