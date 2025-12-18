import type React from "react";
import { useState } from "react";

const BottomCardHolderInfo: React.FC<{ 
  PassedIcon: any; 
  value: string | number; 
  green?: boolean;
  tooltip?: string;
  count?: number;
}> = ({
  PassedIcon,
  value,
  green = true,
  tooltip,
  count
}) => {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div 
      className="relative"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div className={`flex flex-row items-center gap-1 rounded-lg border border-neutral-700 px-2 py-0.5 text-xs ${green ? `text-emerald-500` : `text-red-500`}`}>
        <PassedIcon size={12} />
        {value}%
      </div>
      {showTooltip && (tooltip || count !== undefined) && (
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900 text-white text-xs rounded shadow-lg z-50 whitespace-nowrap border border-gray-700">
          {tooltip && <div>{tooltip}</div>}
          {count !== undefined && (
            <div className="mt-1 pt-1 border-t border-gray-700">
              Count: {count}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default BottomCardHolderInfo;
