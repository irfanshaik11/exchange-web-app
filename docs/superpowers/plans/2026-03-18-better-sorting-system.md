# Better Sorting System for Pulse & Discover (INT-170) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all 8 GMGN-parity sort criteria to Pulse and Discover pages with visual sort indicators and persistent sort state.

**Architecture:** Extend existing client-side sort logic in PulseTable.tsx and DiscoverContent.tsx with new sort keys. Create a shared `SortableColumnHeader` component for clickable headers with arrow indicators. All data fields already exist in the token objects from WebSocket/API — no backend changes needed.

**Tech Stack:** React, TypeScript, TailwindCSS, localStorage for persistence

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/components/SortableColumnHeader.tsx` | **Create** | Reusable clickable column header with sort arrow indicator |
| `src/components/PulseTable.tsx` | **Modify** | Add new sort cases, use SortableColumnHeader, add missing columns |
| `src/components/DiscoverContent.tsx` | **Modify** | Add new sort cases, use SortableColumnHeader, add missing columns |
| `src/contexts/PulseFiltersContext.tsx` | **Modify** | Add `sortTimeframe` field to PulseFilters |
| `src/utils/sortUtils.ts` | **Create** | Shared sort value extractors (getTokenLiquidity, getTokenPriceChange, getTokenTxns, getTokenHolders, getTokenTopHolderPct) |

---

### Task 1: Create Shared Sort Utility Functions

**Files:**
- Create: `src/utils/sortUtils.ts`

These extract sort values from token objects, reusable by both PulseTable and DiscoverContent.

- [ ] **Step 1: Create `src/utils/sortUtils.ts`**

```typescript
/**
 * Shared sort value extractors for token objects.
 * Used by PulseTable and DiscoverContent for consistent sorting.
 */

// Liquidity: try multiple field names
export const getTokenLiquidity = (token: any): number => {
  return Number(
    token.total_liquidity_usd ??
    token.liquidity_usd ??
    token.LiquidityUSD ??
    token.liquidityUSD ??
    token.totalLiquidityUsd ??
    token.total_liquidity ??
    token.liquidity ??
    0
  ) || 0;
};

// Price change % for a given timeframe
export const getTokenPriceChange = (token: any, timeframe: string): number => {
  switch (timeframe) {
    case "5m":
      return Number(token.price_percent_change_5m ?? token.price_change_5m ?? token.priceChange5m ?? 0) || 0;
    case "1h":
      return Number(token.price_percent_change_1h ?? token.price_change_1h ?? token.priceChange1h ?? 0) || 0;
    case "6h":
      return Number(token.price_percent_change_6h ?? token.price_change_6h ?? token.priceChange6h ?? 0) || 0;
    case "24h":
      return Number(token.price_percent_change_24h ?? token.price_change_24h ?? token.priceChange24h ?? 0) || 0;
    default:
      return Number(token.price_percent_change_5m ?? token.price_change_5m ?? token.priceChange5m ?? 0) || 0;
  }
};

// Total transactions (buys + sells) for a given timeframe
export const getTokenTxns = (token: any, timeframe: string): number => {
  switch (timeframe) {
    case "5m":
      return (Number(token.total_buys_5m ?? 0) + Number(token.total_sells_5m ?? 0)) || 0;
    case "1h":
      return (Number(token.total_buys_1h ?? 0) + Number(token.total_sells_1h ?? 0)) || 0;
    case "6h":
      return (Number(token.total_buys_6h ?? 0) + Number(token.total_sells_6h ?? 0)) || 0;
    case "24h":
      return (Number(token.total_buys_24h ?? 0) + Number(token.total_sells_24h ?? 0)) || 0;
    default:
      return (Number(token.total_buys_5m ?? 0) + Number(token.total_sells_5m ?? 0)) || 0;
  }
};

// Holder count
export const getTokenHolders = (token: any): number => {
  return Number(token.holder_count ?? token.holders ?? token.unique_wallets_24h ?? 0) || 0;
};

// Top 10 holder percentage (concentration)
export const getTokenTopHolderPct = (token: any): number => {
  return Number(token.top10_holder_percent ?? token.top10HolderPercent ?? token.top_holder_pct ?? 0) || 0;
};
```

- [ ] **Step 2: Commit**

```bash
git add src/utils/sortUtils.ts
git commit -m "feat(sort): add shared sort utility functions for token sorting"
```

---

### Task 2: Create SortableColumnHeader Component

**Files:**
- Create: `src/components/SortableColumnHeader.tsx`

A reusable header component that shows sort direction arrows and handles click-to-toggle.

- [ ] **Step 1: Create `src/components/SortableColumnHeader.tsx`**

```tsx
import React from "react";

interface SortableColumnHeaderProps {
  label: string;
  sortKey: string;
  activeSortKey: string;
  sortOrder: "asc" | "desc";
  onSort: (key: string) => void;
  className?: string;
  /** Optional secondary label like timeframe e.g. "(1h)" */
  sublabel?: string;
}

export const SortableColumnHeader: React.FC<SortableColumnHeaderProps> = ({
  label,
  sortKey,
  activeSortKey,
  sortOrder,
  onSort,
  className = "",
  sublabel,
}) => {
  const isActive = activeSortKey === sortKey;

  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 text-xs font-medium text-gray-400 hover:text-white transition-colors cursor-pointer select-none ${className}`}
    >
      <span>{label}</span>
      {sublabel && <span className="text-gray-500">{sublabel}</span>}
      <span className="flex flex-col leading-none ml-0.5">
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          className={`${isActive && sortOrder === "asc" ? "text-white" : "text-gray-600"}`}
          fill="currentColor"
        >
          <path d="M4 0L8 5H0L4 0Z" />
        </svg>
        <svg
          width="8"
          height="5"
          viewBox="0 0 8 5"
          className={`${isActive && sortOrder === "desc" ? "text-white" : "text-gray-600"}`}
          fill="currentColor"
        >
          <path d="M4 5L0 0H8L4 5Z" />
        </svg>
      </span>
    </button>
  );
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/SortableColumnHeader.tsx
git commit -m "feat(sort): add SortableColumnHeader component with arrow indicators"
```

---

### Task 3: Add `sortTimeframe` to PulseFiltersContext

**Files:**
- Modify: `src/contexts/PulseFiltersContext.tsx`

Add a `sortTimeframe` field so Volume, Price Change %, and TXs sorts can be timeframe-aware.

- [ ] **Step 1: Add `sortTimeframe` to PulseFilters interface and defaults**

In `PulseFiltersContext.tsx`:
- Add `sortTimeframe: string;` to the `PulseFilters` interface (after line 68, the `sortOrder` field)
- Add `sortTimeframe: "5m",` to `defaultPulseFilters` (after line 128, the `sortOrder` default)

- [ ] **Step 2: Commit**

```bash
git add src/contexts/PulseFiltersContext.tsx
git commit -m "feat(sort): add sortTimeframe to PulseFilters context"
```

---

### Task 4: Extend PulseTable Sort Logic with New Criteria

**Files:**
- Modify: `src/components/PulseTable.tsx:4713-4740` (the switch statement in sort logic)

Add cases for: `liquidity`, `priceChange`, `txns`, `holders`, `topHolderPct`.

- [ ] **Step 1: Add import for sort utils at top of PulseTable.tsx**

Add after other util imports:
```typescript
import { getTokenLiquidity, getTokenPriceChange, getTokenTxns, getTokenHolders, getTokenTopHolderPct } from "~/utils/sortUtils";
```

- [ ] **Step 2: Extend the switch statement at ~line 4713**

Add these cases before the `default:` case:

```typescript
case "liquidity":
  aValue = getTokenLiquidity(a);
  bValue = getTokenLiquidity(b);
  break;
case "priceChange":
  aValue = getTokenPriceChange(a, filters.sortTimeframe || "5m");
  bValue = getTokenPriceChange(b, filters.sortTimeframe || "5m");
  break;
case "txns":
  aValue = getTokenTxns(a, filters.sortTimeframe || "5m");
  bValue = getTokenTxns(b, filters.sortTimeframe || "5m");
  break;
case "holders":
  aValue = getTokenHolders(a);
  bValue = getTokenHolders(b);
  break;
case "topHolderPct":
  aValue = getTokenTopHolderPct(a);
  bValue = getTokenTopHolderPct(b);
  break;
```

- [ ] **Step 3: Also make the existing `volume` case timeframe-aware**

The current `calculateVolumeUsd` function may not take a timeframe parameter. Check its signature and either:
- Pass `filters.sortTimeframe` to it if it supports it, OR
- Replace with a direct field lookup similar to the other sort utils

- [ ] **Step 4: Add `filters.sortTimeframe` to the useMemo dependency array** (~line 4820 area)

- [ ] **Step 5: Verify the app compiles without errors**

Run: `cd "exchange-web-app" && npx next build --no-lint 2>&1 | head -30` (or just check the dev server terminal for errors)

- [ ] **Step 6: Commit**

```bash
git add src/components/PulseTable.tsx
git commit -m "feat(sort): add liquidity, priceChange, txns, holders, topHolderPct sort to PulseTable"
```

---

### Task 5: Add Sort Headers to PulseTable UI

**Files:**
- Modify: `src/components/PulseTable.tsx` (header rendering section)

Replace plain text headers with `SortableColumnHeader` components and add a sort handler function.

- [ ] **Step 1: Find the header rendering section in PulseTable.tsx**

Search for where column headers like "MC", "Vol", etc. are rendered. This is likely in a JSX section with a row/flex container for column titles.

- [ ] **Step 2: Add a `handleSort` function**

Add inside the PulseTable component, before the return/JSX:

```typescript
const handleSort = useCallback((key: string) => {
  setFilters((prev: PulseFilters) => ({
    ...prev,
    sortBy: key,
    sortOrder: prev.sortBy === key && prev.sortOrder === "desc" ? "asc" : "desc",
  }));
}, [setFilters]);
```

- [ ] **Step 3: Add a `handleTimeframeChange` function for Volume/PriceChange/TXs**

```typescript
const handleSortTimeframeChange = useCallback((timeframe: string) => {
  setFilters((prev: PulseFilters) => ({
    ...prev,
    sortTimeframe: timeframe,
  }));
}, [setFilters]);
```

- [ ] **Step 4: Replace header text with SortableColumnHeader**

Import at top:
```typescript
import { SortableColumnHeader } from "./SortableColumnHeader";
```

Replace each column header text (MC, Vol, Liq, Age, etc.) with:
```tsx
<SortableColumnHeader label="MC" sortKey="marketCap" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} />
<SortableColumnHeader label="Vol" sortKey="volume" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} sublabel={`(${filters.sortTimeframe || "5m"})`} />
<SortableColumnHeader label="Liq" sortKey="liquidity" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} />
<SortableColumnHeader label="Age" sortKey="timestamp" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} />
<SortableColumnHeader label="Chg%" sortKey="priceChange" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} sublabel={`(${filters.sortTimeframe || "5m"})`} />
<SortableColumnHeader label="TXs" sortKey="txns" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} sublabel={`(${filters.sortTimeframe || "5m"})`} />
<SortableColumnHeader label="Holders" sortKey="holders" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} />
<SortableColumnHeader label="Top10%" sortKey="topHolderPct" activeSortKey={filters.sortBy} sortOrder={filters.sortOrder as "asc" | "desc"} onSort={handleSort} />
```

**Note:** The exact placement depends on the current header layout. Some columns may already exist and just need the component swap. New columns (Chg%, TXs, Holders, Top10%) may need new header cells AND corresponding data cells in the row rendering.

- [ ] **Step 5: Add a timeframe selector near the sort headers**

Add a small timeframe toggle (5m | 1h | 6h | 24h) that affects Volume, PriceChange, and TXs sorts:

```tsx
<div className="flex items-center gap-1 text-xs">
  {["5m", "1h", "6h", "24h"].map((tf) => (
    <button
      key={tf}
      onClick={() => handleSortTimeframeChange(tf)}
      className={`px-1.5 py-0.5 rounded ${
        (filters.sortTimeframe || "5m") === tf
          ? "bg-white/10 text-white"
          : "text-gray-500 hover:text-gray-300"
      }`}
    >
      {tf}
    </button>
  ))}
</div>
```

- [ ] **Step 6: Verify in browser — click headers, check sort changes**

- [ ] **Step 7: Commit**

```bash
git add src/components/PulseTable.tsx
git commit -m "feat(sort): add sortable column headers with arrow indicators to PulseTable"
```

---

### Task 6: Extend DiscoverContent Sort Logic with New Criteria

**Files:**
- Modify: `src/components/DiscoverContent.tsx:70` (sortKey state) and `~779-847` (sort logic)

Add cases for: `age`, `priceChange`, `holders`, `topHolderPct`.

- [ ] **Step 1: Add import for sort utils**

```typescript
import { getTokenLiquidity, getTokenPriceChange, getTokenTxns, getTokenHolders, getTokenTopHolderPct } from "~/utils/sortUtils";
```

- [ ] **Step 2: Extend the sortKey union type (~line 70)**

Change from:
```typescript
const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value">("volume");
```
To:
```typescript
const [sortKey, setSortKey] = useState<"market_cap_total" | "liquidity" | "volume" | "txns" | "name" | "total_liquidity_usd" | "fully_diluted_value" | "age" | "priceChange" | "holders" | "topHolderPct">("volume");
```

- [ ] **Step 3: Add a `sortTimeframe` state**

```typescript
const [sortTimeframe, setSortTimeframe] = useState<string>("5m");
```

- [ ] **Step 4: Add new sort cases to the sorting logic (~line 779-847)**

In the `handleSort` / sorting section, add:

```typescript
} else if (sortKey === 'age') {
  const aTime = new Date(a.created_at || a.pair_created_at || a.launch_time || 0).getTime();
  const bTime = new Date(b.created_at || b.pair_created_at || b.launch_time || 0).getTime();
  aVal = aTime || 0;
  bVal = bTime || 0;
} else if (sortKey === 'priceChange') {
  aVal = getTokenPriceChange(a, sortTimeframe);
  bVal = getTokenPriceChange(b, sortTimeframe);
} else if (sortKey === 'holders') {
  aVal = getTokenHolders(a);
  bVal = getTokenHolders(b);
} else if (sortKey === 'topHolderPct') {
  aVal = getTokenTopHolderPct(a);
  bVal = getTokenTopHolderPct(b);
```

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverContent.tsx
git commit -m "feat(sort): add age, priceChange, holders, topHolderPct sort to DiscoverContent"
```

---

### Task 7: Add Sort Headers to DiscoverContent UI

**Files:**
- Modify: `src/components/DiscoverContent.tsx` (header rendering section)

- [ ] **Step 1: Import SortableColumnHeader**

```typescript
import { SortableColumnHeader } from "./SortableColumnHeader";
```

- [ ] **Step 2: Replace header text with SortableColumnHeader components**

Same pattern as PulseTable — replace plain text headers with clickable `SortableColumnHeader` components. Add new column headers for Age, Chg%, Holders, Top10%.

- [ ] **Step 3: Add timeframe selector for Discover page**

Same pattern as PulseTable — a small toggle for 5m/1h/6h/24h.

- [ ] **Step 4: Verify in browser**

- [ ] **Step 5: Commit**

```bash
git add src/components/DiscoverContent.tsx
git commit -m "feat(sort): add sortable column headers to DiscoverContent"
```

---

### Task 8: Ensure Sort Persistence in localStorage

**Files:**
- Modify: `src/components/PulseTable.tsx` (where filters are loaded/saved to localStorage)

- [ ] **Step 1: Verify PulseTable already persists sortBy and sortOrder to localStorage**

The current code saves filters to localStorage keys like `pulse_filters_*`. Check that `sortBy`, `sortOrder`, and the new `sortTimeframe` are included.

- [ ] **Step 2: If not already included, add `sortTimeframe` to the save/load logic**

Find the `localStorage.setItem` and `localStorage.getItem` calls for pulse filters and ensure `sortTimeframe` is persisted.

- [ ] **Step 3: For DiscoverContent, persist sortKey, sortDirection, and sortTimeframe**

Add localStorage save/load around the useState calls:

```typescript
const [sortKey, setSortKey] = useState<...>(() => {
  if (typeof window !== 'undefined') {
    return (localStorage.getItem('discover_sortKey') as any) || "volume";
  }
  return "volume";
});

// Add useEffect to persist
useEffect(() => {
  localStorage.setItem('discover_sortKey', sortKey);
}, [sortKey]);
```

Same for `sortDirection` and `sortTimeframe`.

- [ ] **Step 4: Commit**

```bash
git add src/components/PulseTable.tsx src/components/DiscoverContent.tsx
git commit -m "feat(sort): persist sort state including timeframe to localStorage"
```

---

### Task 9: Manual QA & Final Polish

- [ ] **Step 1: Test all 8 sort criteria on Pulse page**
  - Click each column header — verify sort direction toggles
  - Verify arrow indicator highlights active sort
  - Change timeframe — verify Volume, PriceChange, TXs recalculate
  - Refresh page — verify sort persists

- [ ] **Step 2: Test all sort criteria on Discover page**
  - Same checks as Pulse

- [ ] **Step 3: Verify no performance regression**
  - Sorting 100+ tokens should be instant (< 50ms)
  - No visible jank when toggling sorts
  - VirtualizedTokenList re-renders correctly

- [ ] **Step 4: Check for edge cases**
  - Tokens with missing data (no holder_count, no price_change) should sort to bottom
  - Switching between Pulse tabs (New, Migrated, Final Stretch) should maintain sort preference

- [ ] **Step 5: Final commit and push**

```bash
git push -u origin naikaj/int-170-better-sorting-system-for-pulse-discover-gmgn-parity
```
