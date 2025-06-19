import React from 'react';
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import CustomCheckbox from './CustomCheckbox';
import { FaPowerOff } from 'react-icons/fa';
import { useFilter } from './FilterContext';

interface FilterPopoutProps {
  open: boolean;
  onClose: () => void;
}

const FilterPopout: React.FC<FilterPopoutProps> = ({ open, onClose }) => {
  const { filter, setFilter, resetFilter } = useFilter();

  // Helper for protocol toggle
  const handleProtocolToggle = (protocol: string) => {
    setFilter({
      ...filter,
      protocols: filter.protocols.includes(protocol)
        ? filter.protocols.filter(p => p !== protocol)
        : [...filter.protocols, protocol],
    });
  };

  // Helper for min/max input change
  const handleMinMaxChange = (key: keyof typeof filter, value: string | number) => {
    setFilter({ ...filter, [key]: value });
  };

  // Helper for text input change
  const handleTextChange = (key: keyof typeof filter, value: string) => {
    setFilter({ ...filter, [key]: value });
  };

  // Helper for Dex Paid toggle
  const handleDexPaidToggle = () => {
    setFilter({ ...filter, dexPaid: !filter.dexPaid });
  };

  // Helper function to render Min/Max inputs
  const renderMinMaxInputs = (label: string, minKey: keyof typeof filter, maxKey: keyof typeof filter) => (
    <div>
      <h3 className="text-neutral-300 text-sm font-semibold mb-2">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <input type="number" placeholder="Min" value={filter[minKey] !== undefined && filter[minKey] !== null ? String(filter[minKey]) : ''} onChange={e => handleMinMaxChange(minKey, e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        <input type="number" placeholder="Max" value={filter[maxKey] !== undefined && filter[maxKey] !== null ? String(filter[maxKey]) : ''} onChange={e => handleMinMaxChange(maxKey, e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
      </div>
    </div>
  );

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="bg-neutral-900 rounded-xl shadow-2xl w-full sm:max-w-md p-3 sm:p-6 relative text-neutral-100 max-h-[calc(100vh-40px)] overflow-y-auto scrollbar-thin scrollbar-thumb-neutral-700"
    >
      <div className="flex flex-col gap-4 h-full">
        {/* Sticky header */}
        <div className="flex items-center justify-between sticky top-0 z-10 bg-neutral-900 pb-2" style={{marginTop: '-1.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem'}}>
          <h2 className="text-xl font-semibold">Filters</h2>
          <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl">×</button>
        </div>
        <div className="space-y-4">
          <div>
            <h3 className="text-neutral-300 text-sm font-semibold mb-2">Protocols</h3>
            <div className="flex gap-3">
              {['Raydium', 'Pump', 'Moonit'].map(protocol => (
                <label key={protocol} className="flex items-center gap-2 cursor-pointer">
                  <CustomCheckbox checked={filter.protocols.includes(protocol)} onChange={() => handleProtocolToggle(protocol)} />
                  {protocol}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-neutral-300 text-sm font-semibold mb-1">Search Keywords</label>
              <input type="text" placeholder="keyword1, keyword2..." value={filter.searchKeywords} onChange={e => handleTextChange('searchKeywords', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <div>
              <label className="block text-neutral-300 text-sm font-semibold mb-1">Exclude Keywords</label>
              <input type="text" placeholder="keyword1, keyword2..." value={filter.excludeKeywords} onChange={e => handleTextChange('excludeKeywords', e.target.value)} className="w-full bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <CustomCheckbox checked={filter.dexPaid} onChange={handleDexPaidToggle} /> Dex Paid
          </label>
          {renderMinMaxInputs("Top 10 Holders %", 'topHoldersMin', 'topHoldersMax')}
          {renderMinMaxInputs("Liquidity ($)", 'liquidityMin', 'liquidityMax')}
          {renderMinMaxInputs("Volume ($)", 'volumeMin', 'volumeMax')}
          {renderMinMaxInputs("Market Cap ($)", 'marketCapMin', 'marketCapMax')}
          {renderMinMaxInputs("Txns", 'txnsMin', 'txnsMax')}
        </div>
        <div className="flex justify-between items-center mt-6">
          <button onClick={() => { resetFilter(); onClose(); }} className="text-neutral-400 hover:text-white flex items-center gap-2">
            <FaPowerOff /> Reset
          </button>
          <InterstateButton variant="primary" onClick={onClose}>Apply all</InterstateButton>
        </div>
      </div>
    </InterstatePopout>
  );
};

export default FilterPopout; 