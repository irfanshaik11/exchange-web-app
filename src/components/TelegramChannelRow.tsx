import React from "react";
import type { TelegramChannelDb } from "~/utils/telegramTracking";
import { FiMessageCircle } from "react-icons/fi";

type TelegramChannelRowProps = {
  channel: TelegramChannelDb;
  title?: string | null;
  onRemove: (username: string) => void;
};

const TelegramChannelRow: React.FC<TelegramChannelRowProps> = ({
  channel,
  title,
  onRemove,
}) => {
  const displayName = title || channel.username;
  const link = `https://t.me/${channel.username}`;
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  return (
    <tr className="border-b border-white/[0.03] transition-colors duration-300 hover:bg-white/[0.03]">
      <td className="px-2 py-3">
        <div className="flex items-center gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#0088cc]/20 text-[#0088cc] ring-1 ring-[#0088cc]/30 transition-colors hover:bg-[#0088cc]/30"
          >
            <FiMessageCircle className="h-4 w-4" />
          </a>
          <div className="min-w-0 flex-1">
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block font-semibold text-neutral-100 truncate hover:text-[#7FFFC9] transition-colors"
            >
              {displayName}
            </a>
            <a
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-xs text-neutral-400 truncate hover:text-neutral-300"
            >
              @{channel.username}
            </a>
          </div>
        </div>
      </td>
      <td className="px-2 py-3 text-xs text-neutral-400">
        {formatDate(channel.createdAt)}
      </td>
      <td className="px-1 py-2 sm:px-2 sm:py-3">
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-medium text-neutral-300 hover:text-neutral-100 transition-all duration-300 border border-white/[0.06] hover:border-white/[0.1] rounded-lg bg-white/[0.03] hover:bg-white/[0.07] whitespace-nowrap"
          >
            Open
          </a>
          <button
            onClick={() => onRemove(channel.username)}
            className="px-2 py-1 text-[10px] sm:px-3 sm:py-1.5 sm:text-xs font-medium text-red-400 hover:text-red-300 transition-all duration-300 border border-red-500/30 hover:border-red-500/50 rounded-lg bg-red-500/5 hover:bg-red-500/10 whitespace-nowrap"
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
};

export default TelegramChannelRow;
