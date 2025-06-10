import React, { useEffect, useState } from 'react';
import { formatSmartNumber } from '~/utils/db';
import { env } from '../../env';

interface PositionRow {
  tokenAddress: string;
  bought: number;
  boughtUsdValue: number;
  sold: number;
  soldUsdValue: number;
  remaining: number;
  remainingUsdValue: number;
  pnl: number;
  pnlPercentage: number;
  actions: string;
}

interface PositionsProps {
  userId: string;
}

function shortAddr(addr: string) {
  if (!addr) return '';
  return addr.slice(0, 4) + '...' + addr.slice(-4);
}

const Positions: React.FC<PositionsProps> = ({ userId }) => {
  const [positions, setPositions] = useState<PositionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    fetch(`${env.NEXT_PUBLIC_BACKEND_URL}/api/trade/get_active_positions_by_user?userId=${userId}`)
      .then(res => res.json())
      .then(data => {
        setPositions(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(() => setPositions([]));
  }, [userId]);

  return (
    <div className=" w-full">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-neutral-400 border-b border-neutral-800">
            <th className="px-2 py-2 text-left">Token</th>
            <th className="px-2 py-2 text-left">Bought</th>
            <th className="px-2 py-2 text-left">Sold</th>
            <th className="px-2 py-2 text-left">Remaining</th>
            <th className="px-2 py-2 text-left">PnL</th>
            <th className="px-2 py-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">Loading...</td></tr>
          ) : positions.length === 0 ? (
            <tr><td colSpan={6} className="text-center py-6 text-neutral-500">No positions found.</td></tr>
          ) : (
            positions.map((pos, idx) => (
              <tr key={pos.tokenAddress || idx} className="border-b border-neutral-800 hover:bg-neutral-800/60">
                <td className="px-2 py-2 font-mono">{shortAddr(pos.tokenAddress)}</td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.bought)}
                  <span className="ml-1 text-neutral-400">(${formatSmartNumber(pos.boughtUsdValue)})</span>
                </td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.sold)}
                  <span className="ml-1 text-neutral-400">(${formatSmartNumber(pos.soldUsdValue)})</span>
                </td>
                <td className="px-2 py-2">
                  {formatSmartNumber(pos.remaining)}
                  <span className="ml-1 text-neutral-400">(${formatSmartNumber(pos.remainingUsdValue)})</span>
                </td>
                <td className={`px-2 py-2 font-semibold ${pos.pnl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}> 
                  {pos.pnl >= 0 ? '+' : ''}{formatSmartNumber(pos.pnl)}
                  <span className="ml-1 text-xs">({(pos.pnlPercentage * 100).toFixed(2)}%)</span>
                </td>
                <td className="px-2 py-2">
                  {pos.actions === 'sell' && (
                    <button className="rounded bg-red-600 px-3 py-1 text-xs text-white hover:bg-red-700 transition">Sell</button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

export default Positions; 