"use client";

import { diffWordsWithSpace } from "diff";
import { useMemo } from "react";
import type { ResultMeta } from "@/features/reconstruction/useWorkspace";

/**
 * Word-level changes between the author's text and the reconstruction.
 * Insertions carry an ink wash; deletions are struck but stay readable.
 * Paragraph breaks are preserved so the view still reads as prose.
 */
/** At most three quiet lines: what was removed, which facts were kept, which habits were matched. */
function annotations(meta: ResultMeta | null | undefined): string[] {
  if (!meta || meta.editedByHand) return [];
  const out: string[] = [];
  const resolved = meta.patterns?.resolved ?? [];
  if (resolved.length) out.push(`Removed ${resolved.slice(0, 3).map((r) => r.name.toLowerCase()).join(", ")}${resolved.length > 3 ? ` and ${resolved.length - 3} more` : ""}`);
  const p = meta.preserved;
  if (p) {
    const kept = [
      p.numbers && `${p.numbers} figure${p.numbers > 1 ? "s" : ""}`,
      p.dates && `${p.dates} date${p.dates > 1 ? "s" : ""}`,
      p.names && `${p.names} name${p.names > 1 ? "s" : ""}`,
      p.quotations && `${p.quotations} quotation${p.quotations > 1 ? "s" : ""}`,
      p.links && `${p.links} link${p.links > 1 ? "s" : ""}`,
    ].filter(Boolean);
    if (kept.length) out.push(`Kept ${kept.join(", ")}`);
  }
  const matched = meta.patterns?.targets.filter((t) => t.met && t.origin.startsWith("Voiceprint")) ?? [];
  if (matched.length) out.push(`Matched your voiceprint on ${matched.slice(0, 2).map((t) => t.label).join(" and ")}`);
  return out.slice(0, 3);
}

export function ChangesView({ before, after, meta }: { before: string; after: string; meta?: ResultMeta | null }) {
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
      <p className="smallcaps mb-2 text-ink-faint">
        <span className="text-accent">+{stats.added}</span> words · <span>−{stats.removed}</span> words
      </p>
      {annotations(meta).length > 0 && (
        <ul className="mb-4 space-y-0.5 text-[0.8125rem] text-ink-faint">
          {annotations(meta).map((a) => (
            <li key={a}>{a}.</li>
          ))}
        </ul>
      )}
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
