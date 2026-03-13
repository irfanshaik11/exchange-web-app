import React from "react";
import type { TelegramMessageEntity } from "~/utils/telegramTracking";

/**
 * Renders Telegram message text with entities (bold, italic, code, links, etc.)
 * like in the Telegram app.
 */
export function TelegramMessageBody({
  text,
  entities = [],
  className = "",
}: {
  text: string;
  entities?: TelegramMessageEntity[];
  className?: string;
}) {
  if (!text) return <span className={className}>(no text)</span>;
  if (!entities.length)
    return (
      <span className={`whitespace-pre-wrap break-words ${className}`}>
        {text}
      </span>
    );

  // Build non-overlapping segments with their applied entity types.
  // Boundaries = all entity start/end positions, sorted.
  const boundaries = new Set<number>();
  boundaries.add(0);
  boundaries.add(text.length);
  for (const e of entities) {
    boundaries.add(e.offset);
    boundaries.add(Math.min(e.offset + e.length, text.length));
  }
  const sorted = Array.from(boundaries).sort((a, b) => a - b);

  const segments: { start: number; end: number; types: TelegramMessageEntity[] }[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const start = sorted[i];
    const end = sorted[i + 1];
    const types = entities.filter(
      (e) => e.offset <= start && e.offset + e.length >= end,
    );
    if (start < end) segments.push({ start, end, types });
  }

  return (
    <span className={`whitespace-pre-wrap break-words ${className}`}>
      {segments.map((seg, idx) => {
        const slice = text.slice(seg.start, seg.end);
        if (!slice) return null;
        let node: React.ReactNode = slice;
        // Apply innermost first (last in list); order: link, bold, italic, underline, strikethrough, spoiler, code, pre, blockquote
        const order = [
          "text_link",
          "url",
          "mention",
          "hashtag",
          "bold",
          "italic",
          "underline",
          "strikethrough",
          "spoiler",
          "code",
          "pre",
          "blockquote",
        ];
        const sortedTypes = [...seg.types].sort(
          (a, b) => order.indexOf(a.type) - order.indexOf(b.type),
        );
        for (const ent of sortedTypes) {
					if (ent.type === "bold")
						node = <strong className="font-semibold">{node}</strong>;
					else if (ent.type === "italic")
						node = <em className="italic">{node}</em>;
					else if (ent.type === "underline")
						node = <span className="underline">{node}</span>;
					else if (ent.type === "strikethrough")
						node = <span className="line-through">{node}</span>;
					else if (ent.type === "spoiler")
						node = (
							<span className="rounded bg-white/20 px-0.5 text-inherit">
								{node}
							</span>
						);
					else if (ent.type === "code")
						node = (
							<code className="rounded bg-white/10 px-1 font-mono text-[0.9em]">
								{node}
							</code>
						);
					else if (ent.type === "pre")
						node = (
							<code className="block rounded bg-white/10 p-2 font-mono text-[0.85em] whitespace-pre">
								{node}
							</code>
						);
					else if (ent.type === "blockquote")
						node = (
							<span className="border-l-2 border-white/20 pl-2 text-neutral-400">
								{node}
							</span>
						);
					else if (ent.type === "text_link" && ent.url)
						node = (
							<a
								href={ent.url}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#0088cc] underline hover:opacity-90"
								onClick={(e) => e.stopPropagation()}
							>
								{node}
							</a>
						);
					else if (ent.type === "url")
						node = (
							<a
								href={slice.startsWith("http") ? slice : `https://${slice}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#0088cc] underline hover:opacity-90"
								onClick={(e) => e.stopPropagation()}
							>
								{node}
							</a>
						);
					else if (ent.type === "mention")
						node = (
							<a
								href={`https://t.me/${slice.startsWith("@") ? slice.slice(1) : slice}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#0088cc] hover:opacity-90"
								onClick={(e) => e.stopPropagation()}
							>
								{node}
							</a>
						);
					else if (ent.type === "hashtag") {
						let encodedQuery = "";
						const raw = slice.replace(/^#/, "");
						try {
							encodedQuery = encodeURIComponent(raw);
						} catch {
							// Fallback for malformed surrogate pairs or invalid sequences
							encodedQuery = encodeURIComponent(
								raw
									.normalize("NFKD")
									.replace(/[^\w\s-]/g, "")
									.trim(),
							);
						}
						node = (
							<a
								href={`https://t.me/search?q=${encodedQuery}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-[#0088cc] hover:opacity-90"
								onClick={(e) => e.stopPropagation()}
							>
								{node}
							</a>
						);
					}
        }
        return <React.Fragment key={idx}>{node}</React.Fragment>;
      })}
    </span>
  );
}
