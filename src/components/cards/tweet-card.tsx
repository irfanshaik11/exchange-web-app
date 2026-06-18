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
      className={`tweet-card w-full overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/40 p-2 backdrop-blur-sm transition-all duration-300 hover:border-neutral-700 hover:scale-[1.01] ${className}`}
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .tweet-card :where(.react-tweet-theme) {
          --tweet-bg-color: transparent;
          --tweet-bg-color-hover: rgba(255, 255, 255, 0.03);
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
        .tweet-card [class*="replies"] [class*="link"] {
          width: 100%;
          color: #8a8a93;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 10px;
          padding: 0.75rem 1rem;
          margin-top: 0.75rem;
        //   display: none;
          transition: background-color 0.2s, border-color 0.2s, color 0.2s;
        }
        .tweet-card [class*="replies"] [class*="link"]:hover {
          background-color: rgba(255, 255, 255, 0.04);
          border-color: rgba(255, 255, 255, 0.15);
          color: #ededf0;
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

      <Tweet id={id} />
    </div>
  );
}