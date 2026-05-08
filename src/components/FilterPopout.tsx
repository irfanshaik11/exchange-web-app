import React, { useState } from "react";
import InterstatePopout from "./InterstatePopout";
import InterstateButton from "./InterstateButton";
import CustomCheckbox from "./CustomCheckbox";
import { FaTimes } from "react-icons/fa";
import { useFilter } from "./FilterContext";
import { AmmList } from "~/utils/amms";
import Image from "next/image";

interface FilterPopoutProps {
  open: boolean;
  onClose: () => void;
  onApplyFilters?: (filters: any) => void;
  currentFilters?: any;
}

const FilterPopout: React.FC<FilterPopoutProps> = ({
  open,
  onClose,
  onApplyFilters,
  currentFilters,
}) => {
  // Use local state for pending changes if we have currentFilters (PulseTable mode)
  const [pendingFilters, setPendingFilters] = useState(currentFilters || {});
  const [activeTab, setActiveTab] = useState<"audit" | "metrics">("audit");

  // Use global filter context if no currentFilters provided (global mode)
  const globalFilter = useFilter();

  const isGlobalMode = !currentFilters;
  const filters = isGlobalMode ? globalFilter.pendingFilter : pendingFilters;
  const setFilters = isGlobalMode
    ? globalFilter.setPendingFilter
    : setPendingFilters;
  const hasPendingChanges = isGlobalMode
    ? globalFilter.hasPendingChanges
    : JSON.stringify(currentFilters) !== JSON.stringify(pendingFilters);

  const handleAmmToggle = (ammId: string) => {
    setFilters({
      ...filters,
      amms: filters.amms.includes(ammId)
        ? filters.amms.filter((id) => id !== ammId)
        : [...filters.amms, ammId],
    });
  };

  const handleMinMaxChange = (
    key: keyof typeof filters,
    value: string | number,
  ) => {
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

  const renderMinMaxInputs = (
    label: string,
    minKey: keyof typeof filters,
    maxKey: keyof typeof filters,
  ) => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#71717a]">{label}</h3>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          placeholder="Min"
          value={
            filters[minKey] !== undefined && filters[minKey] !== null
              ? String(filters[minKey])
              : ""
          }
          onChange={(e) => handleMinMaxChange(minKey, e.target.value)}
          className="w-full [appearance:textfield] rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] placeholder:text-[#52525b] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <input
          type="number"
          placeholder="Max"
          value={
            filters[maxKey] !== undefined && filters[maxKey] !== null
              ? String(filters[maxKey])
              : ""
          }
          onChange={(e) => handleMinMaxChange(maxKey, e.target.value)}
          className="w-full [appearance:textfield] rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] placeholder:text-[#52525b] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );

  const renderAgeInput = () => (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-[#71717a]">Age</h3>
      <div className="flex items-center gap-2">
        <input
          type="number"
          placeholder="Min"
          value={
            filters.ageMin !== undefined && filters.ageMin !== null
              ? String(filters.ageMin)
              : ""
          }
          onChange={(e) => handleMinMaxChange("ageMin", e.target.value)}
          className="flex-1 [appearance:textfield] rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] placeholder:text-[#52525b] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <select
          value={filters.ageUnit || "m"}
          onChange={(e) => handleTextChange("ageUnit", e.target.value)}
          className="rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20"
          style={{ minWidth: '70px' }}
        >
          <option value="m" className="bg-[#080a0d] text-[#f4f4f5]">m</option>
          <option value="h" className="bg-[#080a0d] text-[#f4f4f5]">h</option>
          <option value="d" className="bg-[#080a0d] text-[#f4f4f5]">d</option>
        </select>
      </div>
    </div>
  );

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="relative flex h-[85vh] max-h-[calc(100vh-60px)] w-full flex-col rounded-xl border border-[#1a1c22] bg-[#0c0e12] text-[#f4f4f5] sm:max-w-2xl"
      zIndex={99999}
    >
      <div 
        className="relative flex h-full w-full flex-col"
        style={{
          boxShadow: '0 25px 80px rgba(0, 0, 0, 0.6), 0 0 1px rgba(24, 196, 140, 0.15)'
        }}
      >
      {/* Header - Axiom style */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#1a1c22] bg-[#080a0d] px-6 py-4">
        <h2 className="text-base font-semibold text-[#f4f4f5]" style={{ letterSpacing: '0.02em' }}>Filters</h2>
        <button
          onClick={onClose}
          className="text-[#71717a] hover:text-[#f4f4f5] transition-all duration-200 p-2 rounded-lg hover:bg-white/[0.05]"
          aria-label="Close"
        >
          <FaTimes size={14} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        {/* Protocols Section - Axiom style */}
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-[#71717a]">Protocols</h3>
          <div className="flex flex-wrap gap-2">
            {AmmList.map((amm) => (
              <button
                key={amm.id}
                onClick={() => handleAmmToggle(amm.id)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200 ${
                  filters.amms.includes(amm.id)
                    ? `bg-[rgba(24,196,140,0.15)] border border-[#18c48c] text-[#18c48c]`
                    : `bg-[#080a0d] border border-[#1a1c22] text-[#71717a] hover:border-[#2a2d36] hover:text-[#a1a1aa]`
                }`}
              >
                <Image
                  src={amm.image}
                  alt={amm.displayName}
                  width={16}
                  height={16}
                  className="rounded-full flex-shrink-0"
                />
                <span>{amm.displayName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Keywords Section - Axiom style */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717a]">
              Search Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.searchKeywords}
              onChange={(e) =>
                handleTextChange("searchKeywords", e.target.value)
              }
              className="w-full rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] placeholder:text-[#52525b] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[#71717a]">
              Exclude Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.excludeKeywords}
              onChange={(e) =>
                handleTextChange("excludeKeywords", e.target.value)
              }
              className="w-full rounded-lg border border-[#1a1c22] bg-[#080a0d] px-3.5 py-2.5 text-sm text-[#f4f4f5] placeholder:text-[#52525b] transition-all duration-200 focus:border-[#18c48c] focus:outline-none focus:ring-2 focus:ring-[#18c48c]/20"
            />
          </div>
        </div>

        {/* Dex Paid Checkbox - Axiom style */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-white/[0.03] transition-colors duration-200">
          <CustomCheckbox
            checked={filters.dexPaid}
            onChange={handleDexPaidToggle}
          />
          <span className="text-xs font-semibold text-[#a1a1aa]">Dex Paid</span>
        </label>

        {/* Tabbed Audit/Metrics Section - Axiom style */}
        <div className="border-t border-[#1a1c22] pt-5">
          <div className="mb-5 flex gap-1 p-1 rounded-lg" style={{ backgroundColor: '#080a0d', border: '1px solid #1a1c22' }}>
            <button 
              onClick={() => setActiveTab("audit")} 
              className={`flex-1 px-4 py-2 text-xs font-semibold transition-all duration-200 rounded-md ${
                activeTab === "audit"
                  ? "bg-[rgba(24,196,140,0.15)] border border-[#18c48c]/40 text-[#f4f4f5]"
                  : "text-[#52525b] hover:text-[#71717a] border border-transparent"
              }`}
            >
              Audit
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className={`flex-1 px-4 py-2 text-xs font-semibold transition-all duration-200 rounded-md ${
                activeTab === "metrics"
                  ? "bg-[rgba(24,196,140,0.15)] border border-[#18c48c]/40 text-[#f4f4f5]"
                  : "text-[#52525b] hover:text-[#71717a] border border-transparent"
              }`}
            >
              $ Metrics
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "audit" && (
            <div className="space-y-4">
              {renderMinMaxInputs("Holders", "holdersMin", "holdersMax")}
              {renderMinMaxInputs(
                "Pro Traders",
                "proTradersMin",
                "proTradersMax",
              )}
              {renderMinMaxInputs(
                "Dev Migrations",
                "devMigrationsMin",
                "devMigrationsMax",
              )}
              {renderMinMaxInputs(
                "Dev Pairs Created",
                "devPairsCreatedMin",
                "devPairsCreatedMax",
              )}
              {renderAgeInput()}
            </div>
          )}

          {activeTab === "metrics" && (
            <div className="space-y-4">
              {renderMinMaxInputs(
                "Liquidity ($)",
                "liquidityMin",
                "liquidityMax",
              )}
              {renderMinMaxInputs("Volume ($)", "volumeMin", "volumeMax")}
              {renderMinMaxInputs(
                "Market Cap ($)",
                "marketCapMin",
                "marketCapMax",
              )}
              {renderMinMaxInputs(
                "B. curve %",
                "bCurvePercentMin",
                "bCurvePercentMax",
              )}
              {renderMinMaxInputs(
                "Global Fees Paid (SOL)",
                "globalFeesPaidMin",
                "globalFeesPaidMax",
              )}
              {renderMinMaxInputs("Txns", "txnsMin", "txnsMax")}
              {renderMinMaxInputs("Num Buys", "numBuysMin", "numBuysMax")}
              {renderMinMaxInputs("Num Sells", "numSellsMin", "numSellsMax")}
            </div>
          )}
        </div>
      </div>

      {/* Footer - Axiom style */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-[#1a1c22] bg-[#080a0d] px-6 py-4">
        <div className="flex gap-2">
          <button
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#1a1c22] bg-[#080a0d] text-[#71717a] hover:border-[#2a2d36] hover:text-[#a1a1aa] transition-all duration-200"
            onClick={() => {
              /* TODO: Implement export */
            }}
          >
            Export
          </button>
          <button
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#1a1c22] bg-[#080a0d] text-[#71717a] hover:border-[#2a2d36] hover:text-[#a1a1aa] transition-all duration-200"
            onClick={() => {
              /* TODO: Implement import */
            }}
          >
            Import
          </button>
        </div>
        <div className="flex gap-2">
          <button 
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-[#1a1c22] bg-[#080a0d] text-[#71717a] hover:border-[#2a2d36] hover:text-[#a1a1aa] transition-all duration-200"
            onClick={handleReset}
          >
            Reset
          </button>
          <button
            className={`px-4 py-2 text-xs font-semibold rounded-lg transition-all duration-200 ${
              hasPendingChanges
                ? "bg-[#18c48c] border border-[#18c48c] text-[#030304] hover:brightness-110 shadow-[0_0_16px_rgba(24,196,140,0.25)]"
                : "bg-[#080a0d] border border-[#1a1c22] text-[#52525b] opacity-60"
            }`}
            onClick={handleApply}
            disabled={!hasPendingChanges}
          >
            Apply All
          </button>
        </div>
      </div>
      </div>
    </InterstatePopout>
  );
};

export default FilterPopout;
