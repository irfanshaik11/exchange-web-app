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
    <div>
      <h3 className="mb-2 text-sm font-semibold text-neutral-300">{label}</h3>
      <div className="grid grid-cols-2 gap-4">
        <input
          type="number"
          placeholder="Min"
          value={
            filters[minKey] !== undefined && filters[minKey] !== null
              ? String(filters[minKey])
              : ""
          }
          onChange={(e) => handleMinMaxChange(minKey, e.target.value)}
          className="w-full [appearance:textfield] rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
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
          className="w-full [appearance:textfield] rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
      </div>
    </div>
  );

  const renderAgeInput = () => (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-neutral-300">Age</h3>
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
          className="flex-1 [appearance:textfield] rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <select
          value={filters.ageUnit || "m"}
          onChange={(e) => handleTextChange("ageUnit", e.target.value)}
          className="rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-300 focus:border-emerald-500 focus:outline-none"
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
      className="relative flex h-[80vh] max-h-[calc(100vh-40px)] w-full flex-col rounded-xl bg-neutral-900 p-3 text-neutral-100 shadow-2xl sm:max-w-lg sm:p-6"
      zIndex={200}
    >
      <div
        className="flex flex-shrink-0 items-center justify-between pb-2 -mt-6 -ml-6 -mr-6 -pl-6 -pr-6"
      >
        <h2 className="mt-4 text-xl font-semibold">Filters</h2>
        <button
          onClick={onClose}
          className="text-xl text-neutral-400 hover:text-white"
          aria-label="Close"
        >
          <FaTimes />
        </button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto py-2">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-neutral-300">AMMs</h3>
          <div className="flex flex-wrap gap-3">
            {AmmList.map((amm) => (
              <button
                key={amm.id}
                onClick={() => handleAmmToggle(amm.id)}
                className={`flex transform cursor-pointer flex-row items-center gap-2 rounded-full p-0.25 text-sm font-medium transition-all duration-300 ease-in-out ${
                  filters.amms.includes(amm.id)
                    ? `bg-gradient-to-br p-0.5 ${amm.borderColor} text-white shadow-lg`
                    : `bg-gradient-to-br p-0.5 ${amm.borderColor} text-white opacity-50 shadow-lg`
                }`}
              >
                <div
                  className={`flex flex-row gap-1 rounded-full bg-neutral-800 px-2 py-1`}
                >
                  <Image
                    src={amm.image}
                    alt={amm.displayName}
                    width={16}
                    height={16}
                    className="rounded-full"
                  />
                  <span>{amm.displayName}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-300">
              Search Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.searchKeywords}
              onChange={(e) =>
                handleTextChange("searchKeywords", e.target.value)
              }
              className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-neutral-300">
              Exclude Keywords
            </label>
            <input
              type="text"
              placeholder="keyword1, keyword2..."
              value={filters.excludeKeywords}
              onChange={(e) =>
                handleTextChange("excludeKeywords", e.target.value)
              }
              className="w-full rounded-lg border-2 border-neutral-700 bg-neutral-800 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <CustomCheckbox
            checked={filters.dexPaid}
            onChange={handleDexPaidToggle}
          />{" "}
          Dex Paid
        </label>

        {/* Tabbed Audit/Metrics Section */}
        <div className="mt-6 border-t border-neutral-700 pt-6">
          <div className="mb-6 flex gap-6">
            <button onClick={() => setActiveTab("audit")} className="relative">
              <span
                className={`text-base font-semibold transition-colors ${
                  activeTab === "audit"
                    ? "text-emerald-400"
                    : "text-neutral-500"
                }`}
              >
                Audit
              </span>
              {activeTab === "audit" && (
                <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-emerald-400" />
              )}
            </button>
            <button
              onClick={() => setActiveTab("metrics")}
              className="relative"
            >
              <span
                className={`text-base font-semibold transition-colors ${
                  activeTab === "metrics"
                    ? "text-emerald-400"
                    : "text-neutral-500"
                }`}
              >
                $ Metrics
              </span>
              {activeTab === "metrics" && (
                <div className="absolute right-0 bottom-0 left-0 h-0.5 bg-emerald-400" />
              )}
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
      <div
        className="mt-6 flex flex-shrink-0 items-center justify-between pt-4 -ml-6 -mr-6 -pl-6 -pr-6"
      >
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
    </InterstatePopout>
  );
};

export default FilterPopout;
