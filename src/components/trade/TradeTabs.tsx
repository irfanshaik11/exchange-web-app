import React, { useState } from 'react';

const tabs = [
  'Trades',
  'Positions',
  'Orders',
  'Holders',
  'Top Traders',
  'Dev Tokens',
];

const TradeTabs: React.FC = () => {
  const [selected, setSelected] = useState('Positions');
  return (
    <div className="mt-2 flex gap-4 rounded-lg bg-neutral-900 p-2 text-xs">
      {tabs.map(tab => (
        <button
          key={tab}
          className={`rounded px-3 py-1 font-semibold ${selected === tab ? 'bg-neutral-800 text-white' : 'text-neutral-400'}`}
          onClick={() => setSelected(tab)}
        >
          {tab}
        </button>
      ))}
    </div>
  );
};

export default TradeTabs; 