import type React from "react";

const BottomCardHolderInfo: React.FC<{ PassedIcon: any; value: string | number, green?: boolean}> = ({
  PassedIcon,
  value,
  green = true
}) => {
  return (
    <div className={`flex flex-row items-center gap-1 rounded-lg border border-neutral-700 px-2 py-0.5 text-sm ${green ? `text-emerald-500` : `text-red-500`}`}>
      <PassedIcon size={12} />
      {value}%
    </div>
  );
};

export default BottomCardHolderInfo;
