import React from 'react';
import type { DexToken } from '~/utils/db';

interface TradeTableProps {
  token: DexToken;
}

const holders = [
  {
    wallet: 'LIQUIDITY POOL',
    balance: '0.023',
    bought: '$0',
    sold: '$0',
    holding: '$0',
    pnl: '+$0 (0%)',
  },
  {
    wallet: 'BgJfHt...rYhX',
    balance: '4.478',
    bought: '$3.08K',
    sold: '$0',
    holding: '$0',
    pnl: '+$0 (0%)',
  },
];

const TradeTable: React.FC<TradeTableProps> = ({ token }) => {
  return (
    <div className="mx-auto mt-4 max-w-4xl rounded-lg bg-neutral-900 p-4">
      <div className="mb-2 text-lg font-bold text-white">Holders</div>
      <table className="w-full text-left text-xs">
        <thead>
          <tr className="text-neutral-400">
            <th className="px-2 py-1">Wallet</th>
            <th className="px-2 py-1">Balance</th>
            <th className="px-2 py-1">Bought</th>
            <th className="px-2 py-1">Sold</th>
            <th className="px-2 py-1">Holding</th>
            <th className="px-2 py-1">PnL</th>
          </tr>
        </thead>
        <tbody>
          {holders.map((row, idx) => (
            <tr key={idx} className="border-t border-neutral-800">
              <td className="px-2 py-1">{row.wallet}</td>
              <td className="px-2 py-1">{row.balance}</td>
              <td className="px-2 py-1">{row.bought}</td>
              <td className="px-2 py-1">{row.sold}</td>
              <td className="px-2 py-1">{row.holding}</td>
              <td className="px-2 py-1">{row.pnl}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default TradeTable; 