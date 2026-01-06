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
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>{label}</h3>
      <div className="grid grid-cols-2 gap-3">
        <input
          type="number"
          placeholder="Min"
          value={
            filters[minKey] !== undefined && filters[minKey] !== null
              ? String(filters[minKey])
              : ""
          }
          onChange={(e) => handleMinMaxChange(minKey, e.target.value)}
          className="w-full [appearance:textfield] rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] placeholder:text-[#6B7280] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          className="w-full [appearance:textfield] rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] placeholder:text-[#6B7280] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );

  const renderAgeInput = () => (
    <div className="space-y-2.5">
      <h3 className="text-sm font-semibold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>Age</h3>
      <div className="flex items-center gap-3">
        <input
          type="number"
          placeholder="Min"
          value={
            filters.ageMin !== undefined && filters.ageMin !== null
              ? String(filters.ageMin)
              : ""
          }
          onChange={(e) => handleMinMaxChange("ageMin", e.target.value)}
          className="flex-1 [appearance:textfield] rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] placeholder:text-[#6B7280] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <select
          value={filters.ageUnit || "m"}
          onChange={(e) => handleTextChange("ageUnit", e.target.value)}
          className="rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20"
          style={{ minWidth: '60px' }}
        >
          <option value="m" className="bg-[#0f1110] text-[#E6E7EA]">m</option>
          <option value="h" className="bg-[#0f1110] text-[#E6E7EA]">h</option>
          <option value="d" className="bg-[#0f1110] text-[#E6E7EA]">d</option>
        </select>
      </div>
    </div>
  );

  return (
    <InterstatePopout
      open={open}
      onClose={onClose}
      align="center"
      className="relative flex h-[85vh] max-h-[calc(100vh-60px)] w-full flex-col rounded-xl border border-[#2a2b33] bg-[#0f1110] text-[#E6E7EA] sm:max-w-2xl"
      zIndex={200}
    >
      <div 
        className="relative flex h-full w-full flex-col"
        style={{
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5), 0 0 1px rgba(133, 217, 159, 0.1)'
        }}
      >
      {/* Header */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#2a2b33] px-6 py-4">
        <h2 className="text-xl font-bold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>Filters</h2>
        <button
          onClick={onClose}
          className="text-[#6B7280] hover:text-[#E6E7EA] transition-colors duration-200 p-1.5 rounded-lg hover:bg-[rgba(133, 217, 159, 0.1)]"
          aria-label="Close"
        >
          <FaTimes size={18} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        {/* AMMs Section */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>AMMs</h3>
          <div className="flex flex-wrap gap-2.5">
            {AmmList.map((amm) => (
              <button
                key={amm.id}
                onClick={() => handleAmmToggle(amm.id)}
                className={`flex transform cursor-pointer flex-row items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
                  filters.amms.includes(amm.id)
                    ? `bg-[rgba(133, 217, 159, 0.15)] border border-[#85d99f] text-[#85d99f] shadow-sm`
                    : `bg-[#0f1110] border border-[#2a2b33] text-[#6B7280] hover:border-[rgba(133, 217, 159, 0.3)] hover:text-[#85d99f] hover:bg-[rgba(133, 217, 159, 0.05)]`
                }`}
              >
                <Image
                  src={amm.image}
                  alt={amm.displayName}
                  width={18}
                  height={18}
                  className="rounded-full flex-shrink-0"
                />
                <span>{amm.displayName}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Keywords Section */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <label className="block text-sm font-semibold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>
              Search Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.searchKeywords}
              onChange={(e) =>
                handleTextChange("searchKeywords", e.target.value)
              }
              className="w-full rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] placeholder:text-[#6B7280] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20"
            />
          </div>
          <div className="space-y-2.5">
            <label className="block text-sm font-semibold text-[#E6E7EA]" style={{ letterSpacing: '0.01em' }}>
              Exclude Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.excludeKeywords}
              onChange={(e) =>
                handleTextChange("excludeKeywords", e.target.value)
              }
              className="w-full rounded-lg border border-[#2a2b33] bg-[#0f1110] px-3.5 py-2.5 text-sm text-[#E6E7EA] placeholder:text-[#6B7280] transition-all duration-200 focus:border-[#85d99f] focus:outline-none focus:ring-1 focus:ring-[#85d99f] focus:ring-opacity-20"
            />
          </div>
        </div>

        {/* Dex Paid Checkbox */}
        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-[rgba(133, 217, 159, 0.05)] transition-colors duration-200">
          <CustomCheckbox
            checked={filters.dexPaid}
            onChange={handleDexPaidToggle}
          />
          <span className="text-sm font-medium text-[#E6E7EA]">Dex Paid</span>
        </label>

        {/* Tabbed Audit/Metrics Section */}
        <div className="border-t border-[#2a2b33] pt-6">
          <div className="mb-6 flex gap-1 border-b border-[#2a2b33]">
            <button 
              onClick={() => setActiveTab("audit")} 
              className="relative px-4 py-2.5 transition-all duration-200"
            >
              <span
                className={`text-sm font-semibold transition-colors ${
                  activeTab === "audit"
                    ? "text-[#85d99f]"
                    : "text-[#6B7280] hover:text-[#E6E7EA]"
                }`}
                style={{ letterSpacing: '0.01em' }}
              >
                Audit
              </span>
              {activeTab === "audit" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#85d99f] rounded-t-full" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className="relative px-4 py-2.5 transition-all duration-200"
            >
              <span
                className={`text-sm font-semibold transition-colors ${
                  activeTab === "metrics"
                    ? "text-[#85d99f]"
                    : "text-[#6B7280] hover:text-[#E6E7EA]"
                }`}
                style={{ letterSpacing: '0.01em' }}
              >
                $ Metrics
              </span>
              {activeTab === "metrics" && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#85d99f] rounded-t-full" />
              )}
            </button>
          </div>

          {/* Tab Content */}
          {activeTab === "audit" && (
            <div className="space-y-5">
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
            <div className="space-y-5">
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

      {/* Footer */}
      <div className="flex flex-shrink-0 items-center justify-between border-t border-[#2a2b33] px-6 py-4">
        <div className="flex gap-2">
          <InterstateButton
            variant="secondary"
            onClick={() => {
              /* TODO: Implement export */
            }}
          >
            Export
          </InterstateButton>
          <InterstateButton
            variant="secondary"
            onClick={() => {
              /* TODO: Implement import */
            }}
          >
            Import
          </InterstateButton>
        </div>
        <div className="flex gap-2">
          <InterstateButton variant="secondary" onClick={handleReset}>
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
      </div>
    </InterstatePopout>
  );
};

export default FilterPopout;
