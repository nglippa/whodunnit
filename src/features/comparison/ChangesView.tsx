"use client";

import { diffWordsWithSpace } from "diff";
import { useMemo } from "react";

/**
 * Word-level changes between the author's text and the reconstruction.
 * Insertions carry an ink wash; deletions are struck but stay readable.
 * Paragraph breaks are preserved so the view still reads as prose.
 */
export function ChangesView({ before, after }: { before: string; after: string }) {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const p of parts) {
      const n = p.value.trim() ? p.value.trim().split(/\s+/).length : 0;
      if (p.added) added += n;
      else if (p.removed) removed += n;
    }
    return { added, removed };
  }, [parts]);

  return (
    <div>
      <p className="smallcaps mb-3 text-ink-faint">
        <span className="text-accent">+{stats.added}</span> words · <span>−{stats.removed}</span> words
      </p>
      <div className="prose-field whitespace-pre-wrap break-words">
        {parts.map((p, i) =>
          p.added ? (
            <ins key={i} className="diff-ins">
              {p.value}
            </ins>
          ) : p.removed ? (
            <del key={i} className="diff-del">
              {p.value}
            </del>
          ) : (
            <span key={i}>{p.value}</span>
          ),
        )}
      </div>
    </div>
  );
}
