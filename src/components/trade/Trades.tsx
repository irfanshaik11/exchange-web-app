import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import { getTradeHistoryByTokenAddress, getTradeActivityByUser } from '~/utils/functions';
import type { TradeRow } from '~/utils/functions';
import type { Token } from '~/utils/db';
import useTradesWebSocket from '../../hooks/useTradesWebSocket';
import { useUser } from '~/components/UserContext';
import TradeTable from './TradeTable';

interface TradesProps {
  token: Token;
  trades: any[];
}

const Trades: React.FC<TradesProps> = ({ token, trades }) => {
  const { user } = useUser();
  const [apiTrades, setApiTrades] = useState<any[]>([]);
  const [loadingApiTrades, setLoadingApiTrades] = useState(true);

  useEffect(() => {
    const fetchTrades = async () => {
      setLoadingApiTrades(true);
      try {
        let fetchedData;
        if (user?.id) {
          fetchedData = await getTradeActivityByUser(user.id);
        }
        setApiTrades(fetchedData);
      } catch (err) {
        console.error("Failed to fetch trades:", err);
        setApiTrades([]);
      } finally {
        setLoadingApiTrades(false);
      }
    };

    fetchTrades();
  }, [user?.id, token.mint]);

  const { data: wsTrades, isConnected, error } = useTradesWebSocket(token?.mint);
  const displayTrades = wsTrades.length > 0 ? wsTrades : apiTrades;
  const loading = loadingApiTrades && !isConnected;

  return (
    <TradeTable trades={trades} loading={loading} />
  );
};

export default Trades;