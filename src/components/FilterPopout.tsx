import React, { useState } from 'react';
import InterstatePopout from './InterstatePopout';
import InterstateButton from './InterstateButton';
import CustomCheckbox from './CustomCheckbox';
import { FaTimes } from 'react-icons/fa';
import { useFilter } from './FilterContext';
import { AmmList } from '~/utils/amms';
import Image from 'next/image';

interface FilterPopoutProps {
  open: boolean;
  onClose: () => void;
  onApplyFilters?: (filters: any) => void;
  currentFilters?: any;
}

const FilterPopout: React.FC<FilterPopoutProps> = ({ open, onClose, onApplyFilters, currentFilters }) => {
  // Use local state for pending changes if we have currentFilters (PulseTable mode)
  const [pendingFilters, setPendingFilters] = useState(currentFilters || {});
  const [activeTab, setActiveTab] = useState<'audit' | 'metrics'>('audit');
  
  // Use global filter context if no currentFilters provided (global mode)
  const globalFilter = useFilter();
  
  const isGlobalMode = !currentFilters;
  const filters = isGlobalMode ? globalFilter.pendingFilter : pendingFilters;
  const setFilters = isGlobalMode ? globalFilter.setPendingFilter : setPendingFilters;
  const hasPendingChanges = isGlobalMode ? globalFilter.hasPendingChanges : JSON.stringify(currentFilters) !== JSON.stringify(pendingFilters);

  const handleAmmToggle = (ammId: string) => {
    setFilters({
      ...filters,
      amms: filters.amms.includes(ammId)
        ? filters.amms.filter(id => id !== ammId)
        : [...filters.amms, ammId],
    });
  };

  const handleMinMaxChange = (key: keyof typeof filters, value: string | number) => {
    setFilters({ ...filters, [key]: value });
  };

  const handleTextChange = (key: keyof typeof filters, value: string) => {
    setFilters({ ...filters, [key]: value });
  };

  const handleDexPaidToggle = () => {
    setFilters({ ...filters, dexPaid: !filters.dexPaid });
  };

  const handleApply = () => {
    if (isGlobalMode) {
      globalFilter.applyFilters();
    } else if (onApplyFilters) {
      onApplyFilters(pendingFilters);
    }
    onClose();
  };

  const handleReset = () => {
    if (isGlobalMode) {
      globalFilter.resetFilter();
    } else if (currentFilters) {
      setPendingFilters(currentFilters);
    }
  };

  const renderMinMaxInputs = (label: string, minKey: keyof typeof filters, maxKey: keyof typeof filters) => (
    <div>
      <h3 className="text-neutral-300 text-sm font-semibold mb-2">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <input 
          type="number" 
          placeholder="Min" 
          value={filters[minKey] !== undefined && filters[minKey] !== null ? String(filters[minKey]) : ''} 
          onChange={e => handleMinMaxChange(minKey, e.target.value)} 
          className="w-full bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
        />
        <input 
          type="number" 
          placeholder="Max" 
          value={filters[maxKey] !== undefined && filters[maxKey] !== null ? String(filters[maxKey]) : ''} 
          onChange={e => handleMinMaxChange(maxKey, e.target.value)} 
          className="w-full bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
        />
      </div>
    </div>
  );

  const renderAgeInput = () => (
    <div>
      <h3 className="text-neutral-300 text-sm font-semibold mb-2">Age</h3>
      <div className="flex gap-2 items-center">
        <input 
          type="number" 
          placeholder="Min" 
          value={filters.ageMin !== undefined && filters.ageMin !== null ? String(filters.ageMin) : ''} 
          onChange={e => handleMinMaxChange('ageMin', e.target.value)} 
          className="flex-1 bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none" 
        />
        <select 
          value={filters.ageUnit || 'm'} 
          onChange={e => handleTextChange('ageUnit', e.target.value)}
          className="bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500 text-neutral-300"
        >
          <option value="m">m</option>
          <option value="h">h</option>
          <option value="d">d</option>
        </select>
      </div>
    </div>
  );

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="bg-neutral-900 rounded-xl shadow-2xl w-full sm:max-w-lg p-3 sm:p-6 relative text-neutral-100 h-[80vh] max-h-[calc(100vh-40px)] flex flex-col"
    >
      <div className="flex items-center justify-between flex-shrink-0 pb-2" style={{marginTop: '-1.5rem', marginLeft: '-1.5rem', marginRight: '-1.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem'}}>
        <h2 className="text-xl font-semibold mt-4">Filters</h2>
        <button onClick={onClose} className="text-neutral-400 hover:text-white text-xl" aria-label="Close">
          <FaTimes />
        </button>
      </div>
      <div className="space-y-4 flex-1 overflow-y-auto py-2">
        <div>
          <h3 className="text-neutral-300 text-sm font-semibold mb-3">AMMs</h3>
          <div className="flex flex-wrap gap-3">
            {AmmList.map(amm => (
              <button
                key={amm.id}
                onClick={() => handleAmmToggle(amm.id)}
                className={`flex flex-row items-center gap-2 p-0.25 rounded-full text-sm font-medium transition-all duration-300 ease-in-out transform cursor-pointer ${
                  filters.amms.includes(amm.id)
                    ? `p-0.5 bg-gradient-to-br ${amm.borderColor} text-white shadow-lg`
                    : `p-0.5 bg-gradient-to-br ${amm.borderColor} text-white shadow-lg opacity-50`
                }`}>
                <div className={`bg-neutral-800 rounded-full px-2 py-1 flex-row flex gap-1`}>
                  <Image src={amm.image} alt={amm.displayName} width={16} height={16} className="rounded-full" />
                  <span>{amm.displayName}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-neutral-300 text-sm font-semibold mb-1">Search Keywords</label>
            <input type="text" placeholder="keyword1, keyword2..." value={filters.searchKeywords} onChange={e => handleTextChange('searchKeywords', e.target.value)} className="w-full bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
          <div>
            <label className="block text-neutral-300 text-sm font-semibold mb-1">Exclude Keywords</label>
            <input type="text" placeholder="keyword1, keyword2..." value={filters.excludeKeywords} onChange={e => handleTextChange('excludeKeywords', e.target.value)} className="w-full bg-neutral-800 border-2 border-neutral-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-emerald-500" />
          </div>
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <CustomCheckbox checked={filters.dexPaid} onChange={handleDexPaidToggle} /> Dex Paid
        </label>
        
        {/* Tabbed Audit/Metrics Section */}
        <div className="mt-6 pt-6 border-t border-neutral-700">
          <div className="flex gap-6 mb-6">
            <button
              onClick={() => setActiveTab('audit')}
              className="relative"
            >
              <span className={`text-base font-semibold transition-colors ${
                activeTab === 'audit' ? 'text-emerald-400' : 'text-neutral-500'
              }`}>
                Audit
              </span>
              {activeTab === 'audit' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('metrics')}
              className="relative"
            >
              <span className={`text-base font-semibold transition-colors ${
                activeTab === 'metrics' ? 'text-emerald-400' : 'text-neutral-500'
              }`}>
                $ Metrics
              </span>
              {activeTab === 'metrics' && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-emerald-400" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === 'audit' && (
            <div className="space-y-4">
              {renderMinMaxInputs("Holders", 'holdersMin', 'holdersMax')}
              {renderMinMaxInputs("Pro Traders", 'proTradersMin', 'proTradersMax')}
              {renderMinMaxInputs("Dev Migrations", 'devMigrationsMin', 'devMigrationsMax')}
              {renderMinMaxInputs("Dev Pairs Created", 'devPairsCreatedMin', 'devPairsCreatedMax')}
              {renderAgeInput()}
            </div>
          )}

          {activeTab === 'metrics' && (
            <div className="space-y-4">
              {renderMinMaxInputs("Liquidity ($)", 'liquidityMin', 'liquidityMax')}
              {renderMinMaxInputs("Volume ($)", 'volumeMin', 'volumeMax')}
              {renderMinMaxInputs("Market Cap ($)", 'marketCapMin', 'marketCapMax')}
              {renderMinMaxInputs("B. curve %", 'bCurvePercentMin', 'bCurvePercentMax')}
              {renderMinMaxInputs("Global Fees Paid (SOL)", 'globalFeesPaidMin', 'globalFeesPaidMax')}
              {renderMinMaxInputs("Txns", 'txnsMin', 'txnsMax')}
              {renderMinMaxInputs("Num Buys", 'numBuysMin', 'numBuysMax')}
              {renderMinMaxInputs("Num Sells", 'numSellsMin', 'numSellsMax')}
            </div>
          )}
        </div>
      </div>
      <div className="flex justify-between items-center flex-shrink-0 mt-6 pt-4" style={{marginLeft: '-1.5rem', marginRight: '-1.5rem', paddingLeft: '1.5rem', paddingRight: '1.5rem'}}>
        <div className="flex gap-2">
          <InterstateButton 
            variant="secondary"
            onClick={() => {/* TODO: Implement export */}}
          >
            Export
          </InterstateButton>
          <InterstateButton 
            variant="secondary"
            onClick={() => {/* TODO: Implement import */}}
          >
            Import
          </InterstateButton>
        </div>
        <div className="flex gap-2">
          <InterstateButton 
            variant="secondary" 
            onClick={handleReset}
          >
            Reset
          </InterstateButton>
          <InterstateButton 
            variant="primary" 
            onClick={handleApply}
            disabled={!hasPendingChanges}
          >
            Apply Filters
          </InterstateButton>
        </div>
      </div>
    </InterstatePopout>
  );
};

export default FilterPopout; 
