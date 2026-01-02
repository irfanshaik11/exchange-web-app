import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import MonadWalletTransactions from '../../components/MonadWalletTransactions';

export default function MonadWalletPage() {
  const router = useRouter();
  const { address } = router.query;
  const [walletAddress, setWalletAddress] = useState<string>('');

  useEffect(() => {
    if (address && typeof address === 'string') {
      // Normalize address (lowercase, remove 0x prefix if needed)
      let normalized = address.toLowerCase().trim();
      if (!normalized.startsWith('0x')) {
        normalized = '0x' + normalized;
      }
      setWalletAddress(normalized);
    }
  }, [address]);

  if (!walletAddress) {
    return (
      <div className="container mx-auto p-4">
        <div className="text-red-500">Invalid wallet address</div>
      </div>
    );
  }

  const shortAddress = `${walletAddress.slice(0, 8)}...${walletAddress.slice(-6)}`;

  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold dark:text-white mb-2">
          Monad Wallet Transactions
        </h1>
        <div className="text-gray-600 dark:text-gray-400 font-mono text-sm">
          {shortAddress}
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(walletAddress)}
          className="mt-2 text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
        >
          Copy full address
        </button>
      </div>
      
      <MonadWalletTransactions 
        walletAddress={walletAddress}
        showFilters={true}
      />
    </div>
  );
}

