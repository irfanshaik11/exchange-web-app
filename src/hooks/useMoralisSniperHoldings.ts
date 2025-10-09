import { useState, useEffect, useCallback } from 'react';

interface SniperTransaction {
  transactionHash: string;
  blocksAfterCreation: string;
  transactionTimestamp: string;
}

interface SellTransaction {
  transactionHash: string;
  blocksAfterCreation: string;
  transactionTimestamp: string;
}

interface SniperWallet {
  walletAddress: string;
  totalTokensSniped: string;
  totalSnipedUsd: string;
  totalSnipedTransactions: string;
  totalTokensSold: string;
  totalSoldUsd: string;
  totalSellTransactions: string;
  currentBalance: string;
  currentBalanceUsdValue: string;
  realizedProfitPercentage: string;
  realizedProfitUsd: string;
  snipedTransactions: SniperTransaction[];
  sellTransactions: SellTransaction[];
}

interface MoralisSniperResponse {
  transactionHash: string;
  blockTimestamp: string;
  blockNumber: string;
  result: SniperWallet[];
}

interface UseMoralisSniperHoldingsProps {
  pairAddress?: string;
  chainId?: string;
  blocksAfterCreation?: number;
  enabled?: boolean;
}

interface SniperHoldingsData {
  totalSnipers: number;
  totalSnipedUsd: number;
  totalRealizedProfitUsd: number;
  averageProfitPercentage: number;
  snipers: SniperWallet[];
}

export const useMoralisSniperHoldings = ({ 
  pairAddress, 
  chainId = 'eth', 
  blocksAfterCreation = 1000,
  enabled = true 
}: UseMoralisSniperHoldingsProps) => {
  const [data, setData] = useState<SniperHoldingsData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const MORALIS_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJub25jZSI6ImM2ZjA1Y2Y2LTJiZWItNDM5Yi1hOTg2LWZiNzliYjQzOTc2OSIsIm9yZ0lkIjoiNDc0OTI1IiwidXNlcklkIjoiNDg4NTc0IiwidHlwZUlkIjoiMTU2N2UxYWYtZGFlOS00NTA4LThmODYtODgxODg1YTcyOWQzIiwidHlwZSI6IlBST0pFQ1QiLCJpYXQiOjE3NTk5NjY2MjcsImV4cCI6NDkxNTcyNjYyN30.1lM_JN0QQGVsTRpspgzvy-T5Ae9XlyEEpYlYMGvVhCs';

  const fetchSniperHoldings = useCallback(async (address: string) => {
    if (!address || !enabled) return;

    setLoading(true);
    setError(null);

    try {
      const url = `https://deep-index.moralis.io/api/v2.2/pairs/${address}/snipers?chain=${chainId}&blocksAfterCreation=${blocksAfterCreation}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'accept': 'application/json',
          'X-API-Key': MORALIS_API_KEY,
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      const responseData: MoralisSniperResponse = await response.json();
      
      // Process the data
      const snipers = responseData.result || [];
      const totalSnipers = snipers.length;
      
      // Check if we have valid data (not just empty strings)
      const hasValidData = snipers.some(sniper => 
        sniper.totalSnipedUsd && 
        sniper.totalSnipedUsd !== '' && 
        parseFloat(sniper.totalSnipedUsd) > 0
      );
      
      if (!hasValidData) {
        setData(null);
        setLoading(false);
        return;
      }
      
      const totalSnipedUsd = snipers.reduce((sum, sniper) => {
        const value = sniper.totalSnipedUsd && sniper.totalSnipedUsd !== '' 
          ? parseFloat(sniper.totalSnipedUsd) 
          : 0;
        return sum + value;
      }, 0);

      const totalRealizedProfitUsd = snipers.reduce((sum, sniper) => {
        const value = sniper.realizedProfitUsd && sniper.realizedProfitUsd !== '' 
          ? parseFloat(sniper.realizedProfitUsd) 
          : 0;
        return sum + value;
      }, 0);

      const averageProfitPercentage = snipers.length > 0 
        ? snipers.reduce((sum, sniper) => {
            const value = sniper.realizedProfitPercentage && sniper.realizedProfitPercentage !== '' 
              ? parseFloat(sniper.realizedProfitPercentage) 
              : 0;
            return sum + value;
          }, 0) / snipers.length
        : 0;

      const processedData: SniperHoldingsData = {
        totalSnipers,
        totalSnipedUsd,
        totalRealizedProfitUsd,
        averageProfitPercentage,
        snipers,
      };

      setData(processedData);
    } catch (err) {
      console.error('Error fetching sniper holdings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch sniper holdings');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [chainId, blocksAfterCreation, enabled]);

  useEffect(() => {
    if (pairAddress) {
      fetchSniperHoldings(pairAddress);
    }
  }, [pairAddress, fetchSniperHoldings]);

  const refetch = useCallback(() => {
    if (pairAddress) {
      fetchSniperHoldings(pairAddress);
    }
  }, [pairAddress, fetchSniperHoldings]);

  return {
    data,
    loading,
    error,
    refetch,
  };
};
