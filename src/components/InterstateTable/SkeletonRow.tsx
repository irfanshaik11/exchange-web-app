export default function SkeletonRow() {
  return (
    <tr className="h-16">
      {/* Pair Info skeleton */}
      <td className="w-80 px-4 py-2 align-middle">
        <div className="flex items-center gap-2">
          <div className="h-12 w-12 rounded bg-neutral-800 animate-pulse flex-shrink-0" />
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="h-4 w-24 rounded bg-neutral-800 animate-pulse" />
            <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
          </div>
        </div>
      </td>
      {/* Market Cap skeleton */}
      <td className="w-32 px-4 py-2 align-middle">
        <div className="flex flex-col items-end gap-1">
          <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse" />
          <div className="h-3 w-12 rounded bg-neutral-800 animate-pulse" />
        </div>
      </td>
      {/* Liquidity skeleton */}
      <td className="w-28 px-4 py-2 align-middle">
        <div className="flex justify-end">
          <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse" />
        </div>
      </td>
      {/* Volume skeleton */}
      <td className="w-28 px-4 py-2 align-middle">
        <div className="flex justify-end">
          <div className="h-4 w-20 rounded bg-neutral-800 animate-pulse" />
        </div>
      </td>
      {/* TXNS/Rank skeleton */}
      <td className="w-28 px-4 py-2 align-middle">
        <div className="flex flex-col items-end gap-1">
          <div className="h-4 w-12 rounded bg-neutral-800 animate-pulse" />
          <div className="h-3 w-16 rounded bg-neutral-800 animate-pulse" />
        </div>
      </td>
      {/* Action skeleton */}
      <td className="w-32 px-4 py-2 align-middle">
        <div className="flex justify-center">
          <div className="h-10 w-28 rounded-full bg-neutral-800 animate-pulse" />
        </div>
      </td>
    </tr>
  );
} 