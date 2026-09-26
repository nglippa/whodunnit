"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import type { EngineInfo } from "@/domain/document";
import { VOICEPRINT_MIN_WORDS } from "@/domain/voiceprint";
import { useVoiceprints } from "./useVoiceprints";
import { VoiceprintDetail } from "./VoiceprintDetail";

export function VoiceprintsView({ engine }: { engine: EngineInfo }) {
  const api = useVoiceprints();
  const { voiceprints, loaded } = api;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const selected = voiceprints.find((v) => v.id === selectedId) ?? voiceprints[0] ?? null;

  const create = async () => {
    const vp = await api.create(name || "My voice");
    setName("");
    setSelectedId(vp.id);
  };

  return (
    <div className="mx-auto grid max-w-[88rem] grid-cols-1 gap-x-12 gap-y-10 px-4 pb-16 pt-10 sm:px-8 sm:pt-14 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside aria-label="Your voiceprints" className="lg:border-r lg:border-rule lg:pr-8">
        <h1 className="font-serif text-[2rem] leading-tight tracking-[-0.01em] text-ink">Voiceprints</h1>
        <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
          A record of how you actually write, measured from your own samples. Every tendency comes with a confidence.
        </p>

        {voiceprints.length > 0 && (
          <ul className="mt-6 border-t border-rule">
            {voiceprints.map((vp) => {
              const active = selected?.id === vp.id;
              return (
                <li key={vp.id} className="border-b border-rule">
                  <button
                    type="button"
                    onClick={() => setSelectedId(vp.id)}
                    aria-current={active ? "true" : undefined}
                    className={`flex w-full items-baseline justify-between gap-3 py-3 text-left ${active ? "text-ink" : "text-ink-soft hover:text-ink"}`}
                  >
                    <span className={`truncate font-serif text-[1.125rem] ${active ? "italic" : ""}`}>{vp.name}</span>
                    <span className="smallcaps shrink-0 tabular-nums text-ink-faint">{vp.totalWords.toLocaleString("en")} w</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {voiceprints.length > 0 && (
        <form
          className="mt-6 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <label htmlFor="new-vp" className="sr-only">
            New voiceprint name
          </label>
          <input
            id="new-vp"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
            placeholder={voiceprints.length ? "New voiceprint" : "My voice"}
            className="h-9 min-w-0 flex-1 border-b border-rule bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
          />
          <Button type="submit" variant="quiet" disabled={!loaded}>
            Create
          </Button>
        </form>
        )}
        <p className="mt-6 text-[0.75rem] leading-relaxed text-ink-faint">
          Samples stay in this browser. Nothing is uploaded unless you ask the model for observations.
        </p>
      </aside>

      <div className="min-w-0">
        {!loaded ? null : selected ? (
          <VoiceprintDetail key={selected.id} vp={selected} api={api} engine={engine} />
        ) : (
          <div className="max-w-2xl">
            <p className="font-serif text-[1.5rem] leading-snug text-ink">
              Whodunnit? <em className="text-accent">Sounds like you did.</em>
            </p>
            <div className="mt-6 space-y-4 text-[0.9375rem] leading-relaxed text-ink-soft">
              <p>
                Give Whodunnit a few things you wrote yourself and it measures your habits: how long your sentences run and
                how much they vary, whether you use contractions, how you punctuate, the phrases you come back to.
              </p>
              <p>
                Once there are at least {VOICEPRINT_MIN_WORDS} words, the voiceprint appears as a style target beside the
                presets, and reconstructions lean toward the habits it measured with confidence. It never invents traits it
                cannot see in your samples.
              </p>
            </div>
            <Button variant="primary" className="mt-8" onClick={() => void create()} disabled={!loaded}>
              Create “{name.trim() || "My voice"}”
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
