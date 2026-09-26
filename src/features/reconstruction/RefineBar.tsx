"use client";

import { useState } from "react";
import { REFINEMENT_IDS, REFINEMENT_LABELS, type Refinement, type RefinementId } from "@/domain/refinement";
import { Button, Kbd } from "@/components/ui/Button";

const EXCLUSIVE: Partial<Record<RefinementId, RefinementId>> = { more_casual: "more_formal", more_formal: "more_casual" };

/**
 * Lightweight direction for the next pass. Directives are typed transforms of
 * the current style; the optional note travels with them. The original text
 * stays the reference for meaning on every pass.
 */
export function RefineBar({ onRefine, busy }: { onRefine: (r: Refinement) => void; busy: boolean }) {
  const [selected, setSelected] = useState<RefinementId[]>([]);
  const [note, setNote] = useState("");
  const canRefine = !busy && (selected.length > 0 || note.trim().length > 0);

  const toggle = (id: RefinementId) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur.filter((x) => x !== EXCLUSIVE[id]), id]));

  const submit = () => {
    if (!canRefine) return;
    onRefine({ directives: selected, note: note.trim() || undefined });
    setSelected([]);
    setNote("");
  };

  return (
    <div className="border-t border-rule pt-4">
      <span className="smallcaps text-ink-faint">Refine</span>
      <div className="-ml-2 mt-1 flex flex-wrap items-center gap-x-1" role="group" aria-label="Refine the reconstruction">
        {REFINEMENT_IDS.map((id) => {
          const on = selected.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              disabled={busy}
              onClick={() => toggle(id)}
              className={`relative h-8 px-2 text-[0.875rem] transition-colors disabled:opacity-50 ${on ? "text-ink" : "text-ink-soft hover:text-ink"}`}
            >
              <span aria-hidden className={`mr-1.5 inline-block h-2 w-2 translate-y-[-1px] border ${on ? "border-accent bg-accent" : "border-ink-faint"}`} />
              {REFINEMENT_LABELS[id]}
            </button>
          );
        })}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <label htmlFor="refine-note" className="sr-only">
          Direction for the next pass
        </label>
        <input
          id="refine-note"
          value={note}
          maxLength={280}
          disabled={busy}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Or in your own words: keep the joke, less formal…"
          className="h-9 min-w-0 flex-1 border-b border-rule bg-transparent font-serif text-[1rem] italic text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
        />
        <Button type="submit" variant="primary" disabled={!canRefine} className="shrink-0">
          Refine <Kbd>↵</Kbd>
        </Button>
      </form>
    </div>
  );
}
