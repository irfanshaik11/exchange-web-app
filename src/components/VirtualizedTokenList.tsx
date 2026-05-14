import React, { useRef, useState, useEffect, useMemo, forwardRef } from "react";
import { FixedSizeList } from "react-window";
import type { ListChildComponentProps } from "react-window";

/**
 * Shared virtualized list wrapper for token tables (PulseTable, MonadTable).
 *
 * Uses react-window's FixedSizeList with:
 * - ResizeObserver to dynamically measure container height
 * - Custom outer element for scrollbar styling
 * - Configurable overscan for smooth scrolling
 */

interface VirtualizedTokenListProps<T> {
  items: T[];
  /** Fixed row height in px (content + gap) */
  itemSize: number;
  /** Render a single row. `style` must be applied to the outermost wrapper. */
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
  /** Extra rows rendered outside the visible area (default 5) */
  overscanCount?: number;
  /** Shown while loading === true */
  loading?: boolean;
  /** Rendered when items is empty and loading is false */
  emptyRenderer?: () => React.ReactNode;
  /** Optional className on the container div */
  className?: string;
  /**
   * Stable per-row key extractor for react-window. WITHOUT this, react-window
   * keys rows by index → every WS-prepend shifts row 0 → row 1 etc → React
   * reuses DOM nodes with new props → list-wide image flicker. Pass an
   * identity function (e.g. `(t) => t.mint`) per call site for full type
   * safety; the fallback in this component handles common token-shape fields
   * but degrades to numeric index for unknown shapes.
   */
  getItemKey?: (item: T, index: number) => React.Key;
}

// Token-shape fields used by the default itemKey extractor. Runtime narrowing
// (not a cast) — a token without any of these falls through to the numeric
// index, which preserves the pre-fix behavior rather than breaking.
function defaultItemKey(item: unknown, index: number): React.Key {
  if (item !== null && typeof item === "object") {
    const obj = item as Record<string, unknown>;
    const mint = obj.mint;
    if (typeof mint === "string" && mint.length > 0) return mint;
    const mintAddress = obj.mint_address;
    if (typeof mintAddress === "string" && mintAddress.length > 0) return mintAddress;
    const pairAddress = obj.pair_address;
    if (typeof pairAddress === "string" && pairAddress.length > 0) return pairAddress;
  }
  return index;
}

interface RowData<T> {
  items: T[];
  renderRow: (item: T, index: number, style: React.CSSProperties) => React.ReactNode;
}

// Stable module-level Row component — reference never changes, so react-window
// won't unmount/remount rows when data updates. Dynamic data comes via itemData.
function Row<T>({ index, style, data }: ListChildComponentProps<RowData<T>>) {
  const item = data.items[index];
  if (!item) return null;
  return <>{data.renderRow(item, index, style)}</>;
}

// Memoize the Row component so its identity is stable across renders
const MemoRow = React.memo(Row) as typeof Row;

// Custom outer element to apply scrollbar styling
const OuterElement = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (props, ref) => (
    <div ref={ref} {...props} className={`custom-scrollbar ${props.className || ""}`} />
  ),
);
OuterElement.displayName = "VirtualizedListOuter";

function VirtualizedTokenListInner<T>({
  items,
  itemSize,
  renderRow,
  overscanCount = 5,
  loading = false,
  emptyRenderer,
  className,
  getItemKey,
}: VirtualizedTokenListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(600);

  // Measure container height via ResizeObserver with 1px threshold to prevent oscillation
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const height = entry.contentRect.height;
        if (height > 0) {
          setContainerHeight((prev) => (Math.abs(height - prev) > 1 ? height : prev));
        }
      }
    });
    observer.observe(el);
    // Set initial height
    const rect = el.getBoundingClientRect();
    if (rect.height > 0) setContainerHeight(rect.height);

    return () => observer.disconnect();
  }, []);

  // Stable itemData object — only changes when items or renderRow actually change
  const itemData = useMemo<RowData<T>>(() => ({ items, renderRow }), [items, renderRow]);

  if (loading && items.length === 0) {
    return (
      <div ref={containerRef} className={className} style={{ flex: 1, minHeight: 0 }}>
        {/* Loading placeholder — parent should handle skeleton UI */}
      </div>
    );
  }

  if (!loading && items.length === 0 && emptyRenderer) {
    return (
      <div ref={containerRef} className={className} style={{ flex: 1, minHeight: 0 }}>
        {emptyRenderer()}
      </div>
    );
  }

  return (
    <div ref={containerRef} className={className} style={{ flex: 1, minHeight: 0 }}>
      <FixedSizeList
        height={containerHeight}
        width="100%"
        itemCount={items.length}
        itemSize={itemSize}
        overscanCount={overscanCount}
        outerElementType={OuterElement}
        itemData={itemData}
        // Stable per-row identity. Without this, react-window keys rows by
        // index — every WS prepend shifts row 0 → row 1, reusing the same
        // DOM node with new props, triggering FastImage's `useEffect` on
        // every existing row → list-wide image flicker. Caller-supplied
        // `getItemKey` is preferred (full type safety); otherwise we narrow
        // common token-shape fields at runtime and fall back to index for
        // unknown shapes (no worse than the pre-fix default). Closes over
        // `items` rather than relying on `data` typing, which TypeScript
        // doesn't reliably infer through react-window's generics.
        itemKey={(index) => {
          const item = items[index];
          if (item === undefined) return index;
          if (getItemKey) return getItemKey(item, index);
          return defaultItemKey(item, index);
        }}
      >
        {MemoRow}
      </FixedSizeList>
    </div>
  );
}

// Exported as a generic component
export const VirtualizedTokenList = React.memo(VirtualizedTokenListInner) as typeof VirtualizedTokenListInner;
