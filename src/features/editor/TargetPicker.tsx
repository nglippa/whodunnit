"use client";

import Link from "next/link";
import type { StyleTarget } from "@/domain/document";
import { PRESET_IDS, PRESETS } from "@/domain/style";
import type { Voiceprint } from "@/domain/voiceprint";
import { isVoiceprintUsable } from "@/lib/voiceprints/to-profile";

/**
 * Style targets as a quiet row of text options, like the style menu of a good
 * editor. Voiceprints appear after the presets once they have enough samples.
 */
export function TargetPicker({
  value,
  onChange,
  voiceprints,
  disabled,
}: {
  value: StyleTarget;
  onChange: (t: StyleTarget) => void;
  voiceprints: Voiceprint[];
  disabled?: boolean;
}) {
  const usable = voiceprints.filter(isVoiceprintUsable);
  const selectedVp = value.kind === "voiceprint" ? voiceprints.find((v) => v.id === value.voiceprintId) : undefined;
  const selectedDescription =
    value.kind === "preset"
      ? PRESETS[value.presetId as keyof typeof PRESETS]?.description
      : selectedVp
        ? `Measured from ${selectedVp.totalWords.toLocaleString("en")} words of your writing (confidence ${Math.round(selectedVp.confidence * 100)}%). Habits below that confidence are left neutral.`
        : "That voiceprint is no longer available.";

  const option = (key: string, label: string, target: StyleTarget, selected: boolean) => (
    <button
      key={key}
      type="button"
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={() => onChange(target)}
      className={`relative h-8 shrink-0 px-2.5 text-[0.875rem] transition-colors disabled:opacity-50 ${
        selected ? "text-ink" : "text-ink-soft hover:text-ink"
      }`}
    >
      {label}
      {selected && <span aria-hidden className="absolute inset-x-2.5 bottom-0.5 h-px bg-accent" />}
    </button>
  );

  return (
    <div className="min-w-0">
      <div role="radiogroup" aria-label="Style target" className="-mx-2.5 flex flex-wrap items-center md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:none]">
        {PRESET_IDS.map((id) =>
          option(id, PRESETS[id].label, { kind: "preset", presetId: id }, value.kind === "preset" && value.presetId === id),
        )}
        {usable.length > 0 && <span aria-hidden className="mx-1.5 h-4 w-px shrink-0 bg-rule-strong" />}
        {usable.map((vp) =>
          option(vp.id, vp.name, { kind: "voiceprint", voiceprintId: vp.id }, value.kind === "voiceprint" && value.voiceprintId === vp.id),
        )}
        {usable.length === 0 && (
          <Link href="/voiceprints" className="ml-2 shrink-0 text-[0.8125rem] italic text-ink-faint hover:text-ink">
            + My voice
          </Link>
        )}
      </div>
      <p className="mt-1 hidden text-[0.8125rem] text-ink-faint md:block">{selectedDescription}</p>
    </div>
  );
}
