import { Tweet } from "react-tweet";

interface TweetCardProps {
  /** The unique numeric ID of the tweet from the X post URL */
  id: string;
  /** Optional class names for layout positioning/margins */
  className?: string;
}

export default function TweetCard({ id, className = "" }: TweetCardProps) {
  return (
    <div
      className={`tweet-card group block h-[300px] w-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2 backdrop-blur-sm transition-all duration-300 hover:border-white/[0.14] hover:scale-[1.01] ${className}`}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .tweet-card :where(.react-tweet-theme) {
          --tweet-bg-color: transparent;
          --tweet-bg-color-hover: transparent;
          --tweet-border: none;
          --tweet-font-family: var(--font-sans), -apple-system, sans-serif;
          --tweet-font-color: #ededf0;
          --tweet-font-color-secondary: #8a8a93;
          --tweet-color-blue-primary: #18c48c;
          --tweet-color-blue-primary-hover: rgba(24, 196, 140, 0.15);
          --tweet-color-blue-secondary: #18c48c;
          --tweet-color-blue-secondary-hover: rgba(24, 196, 140, 0.1);
          --tweet-twitter-icon-color: #ededf0;
          --tweet-verified-blue-color: #18c48c;
          --tweet-skeleton-gradient: linear-gradient(270deg, #0b0c0f, #111214, #111214, #0b0c0f);
          --tweet-container-margin: 0;
          max-width: 100% !important;
          margin: 0 !important;
        }
        .tweet-card [class*="actions"] {
          display: none !important;
        }
        .tweet-card [class*="infoLink"] {
          opacity: 0;
          pointer-events: none;
          user-select: none;
        }
        /* Hide react-tweet's built-in replies / "Read more" link — we render our
           own footer button pinned to the bottom of the card instead. */
        .tweet-card [class*="replies"] {
          display: none !important;
        }
        /* Internal scroll area so tall tweets (media, quotes, replies) don't elongate the card */
        .tweet-card .tweet-scroll {
          scrollbar-width: thin;
          scrollbar-color: rgba(255, 255, 255, 0.12) transparent;
        }
        .tweet-card .tweet-scroll::-webkit-scrollbar {
          width: 6px;
        }
        .tweet-card .tweet-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .tweet-card .tweet-scroll::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.12);
          border-radius: 999px;
        }
        @media (max-width: 640px) {
          .tweet-card :where(.react-tweet-theme) {
            // --tweet-header-font-size: 0.8rem;
            --tweet-header-line-height: 1.1rem;
            --tweet-body-font-size: 0.875rem;
            --tweet-body-line-height: 1.25rem;
            --tweet-info-font-size: 0.75rem;
            --tweet-info-line-height: 1rem;
          }
          .tweet-card [class*="replies"] {
            display: none !important;
          }
        }
      `}} />

      <div className="flex h-full flex-col rounded-xl transition-colors duration-300 group-hover:bg-white/[0.03]">
        <div className="tweet-scroll min-h-0 flex-1 overflow-y-auto">
          <Tweet id={id} />
        </div>
        <a
          href={`https://x.com/i/status/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block shrink-0 rounded-[10px] border border-white/[0.08] px-4 py-3 text-center text-[13px] font-medium text-[#8a8a93] transition-colors hover:border-white/[0.15] hover:bg-white/[0.04] hover:text-[#ededf0]"
        >
          Read more on X
        </a>
      </div>
    </div>
  );
}