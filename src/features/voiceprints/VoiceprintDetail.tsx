"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ProseField } from "@/features/editor/ProseField";
import { requestVoiceprintObservations } from "@/features/reconstruction/client";
import type { EngineInfo } from "@/domain/document";
import { VOICEPRINT_MIN_WORDS, type Measured, type Voiceprint, type WritingSample } from "@/domain/voiceprint";
import { words } from "@/lib/analysis/tokenize";
import { isVoiceprintUsable } from "@/lib/voiceprints/to-profile";
import type { useVoiceprints } from "./useVoiceprints";

type Api = ReturnType<typeof useVoiceprints>;

function ConfidenceMark({ value, label }: { value: number; label?: string }) {
  const pct = Math.round(value * 100);
  return (
    <span className="inline-flex items-center gap-2" title={`Confidence ${pct}%`}>
      <span className="relative h-px w-12 bg-rule-strong" aria-hidden>
        <span className="absolute inset-y-0 left-0 h-px bg-accent" style={{ width: `${pct}%` }} />
      </span>
      <span className="smallcaps tabular-nums text-ink-faint">{label ?? `${pct}%`}</span>
    </span>
  );
}

function StatRow({ label, m, unit, digits = 1 }: { label: string; m: Measured; unit?: string; digits?: number }) {
  return (
    <>
      <dt className="text-ink-soft">{label}</dt>
      <dd className="text-right tabular-nums text-ink">
        {m.value.toFixed(digits)}
        {unit && <span className="text-ink-faint"> {unit}</span>}
      </dd>
      <dd className="hidden justify-self-end sm:block">
        <ConfidenceMark value={m.confidence} />
      </dd>
    </>
  );
}

export function VoiceprintDetail({ vp, api, engine }: { vp: Voiceprint; api: Api; engine: EngineInfo }) {
  const [samples, setSamples] = useState<WritingSample[]>([]);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [observeState, setObserveState] = useState<{ kind: "idle" } | { kind: "busy" } | { kind: "error"; message: string }>({ kind: "idle" });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const { listSamples } = api;

  useEffect(() => {
    let cancelled = false;
    void listSamples(vp.id).then((s) => {
      if (!cancelled) setSamples(s);
    });
    return () => {
      cancelled = true;
    };
  }, [vp.id, vp.updatedAt, listSamples]);

  const sampleWords = words(text).length;
  const stats = vp.stats;
  const remaining = Math.max(0, VOICEPRINT_MIN_WORDS - vp.totalWords);

  const add = async () => {
    if (sampleWords < 40) return;
    setBusy(true);
    await api.addSample(vp.id, title, text);
    setTitle("");
    setText("");
    setBusy(false);
  };

  const observe = async () => {
    setObserveState({ kind: "busy" });
    try {
      const { observations } = await requestVoiceprintObservations(samples.slice(0, 8).map((s) => s.text.slice(0, 12_000)));
      await api.setModelObservations(vp, observations);
      setObserveState({ kind: "idle" });
    } catch (err) {
      setObserveState({ kind: "error", message: err instanceof Error ? err.message : "Could not get observations." });
    }
  };

  return (
    <article className="min-w-0">
      <header className="border-b border-rule pb-6">
        <label className="sr-only" htmlFor="vp-name">
          Voiceprint name
        </label>
        <input
          id="vp-name"
          defaultValue={vp.name}
          key={`${vp.id}-name`}
          maxLength={60}
          onBlur={(e) => e.target.value.trim() && e.target.value !== vp.name && void api.update(vp, { name: e.target.value.trim() })}
          className="w-full bg-transparent font-serif text-[2rem] leading-tight tracking-[-0.01em] text-ink focus:outline-none"
        />
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.8125rem] text-ink-soft">
          <span className="tabular-nums">
            {vp.sampleCount} sample{vp.sampleCount === 1 ? "" : "s"} · {vp.totalWords.toLocaleString("en")} words
          </span>
          <ConfidenceMark value={vp.confidence} label={`Confidence ${Math.round(vp.confidence * 100)}%`} />
          <span className={isVoiceprintUsable(vp) ? "text-ink" : "text-ink-faint"}>
            {isVoiceprintUsable(vp) ? "Available as a style target when you write" : `${remaining} more words before it can be used`}
          </span>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-x-12 gap-y-10 pt-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="add-sample">
          <h2 id="add-sample" className="smallcaps text-ink-faint">
            Add a sample of your writing
          </h2>
          <p className="mt-2 max-w-prose text-[0.875rem] leading-relaxed text-ink-soft">
            Use things you wrote yourself, unedited by a tool: emails, posts, essays. Different kinds of writing make the
            measurements more reliable.
          </p>
          <label htmlFor="sample-title" className="sr-only">
            Sample title (optional)
          </label>
          <input
            id="sample-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title (optional)"
            maxLength={120}
            className="mt-5 h-9 w-full border-b border-rule bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-ink focus:outline-none"
          />
          <ProseField
            aria-label="Sample text"
            value={text}
            minRows={7}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste something you wrote…"
            className="mt-4"
          />
          <div className="mt-3 flex items-center justify-between border-t border-rule pt-3">
            <span className="smallcaps tabular-nums text-ink-faint">
              {sampleWords} words{sampleWords > 0 && sampleWords < 40 ? " · at least 40" : ""}
            </span>
            <Button variant="primary" onClick={add} disabled={busy || sampleWords < 40}>
              {busy ? "Measuring…" : "Add sample"}
            </Button>
          </div>

          {samples.length > 0 && (
            <div className="mt-10">
              <h2 className="smallcaps text-ink-faint">Samples</h2>
              <ul className="mt-2 divide-y divide-rule border-y border-rule">
                {samples.map((s) => (
                  <li key={s.id} className="flex items-start gap-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9375rem] text-ink">{s.title || s.text.slice(0, 60)}</p>
                      <p className="mt-0.5 line-clamp-1 font-serif text-[0.9375rem] italic text-ink-faint">{s.text.slice(0, 160)}</p>
                    </div>
                    <span className="smallcaps shrink-0 pt-1 tabular-nums text-ink-faint">{s.wordCount} w</span>
                    <Button onClick={() => void api.removeSample(vp.id, s.id)} aria-label={`Remove sample ${s.title || ""}`}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section aria-labelledby="tendencies" className="min-w-0">
          <h2 id="tendencies" className="smallcaps text-ink-faint">
            Measured tendencies
          </h2>
          {!stats ? (
            <p className="mt-3 font-serif text-[1.0625rem] italic leading-relaxed text-ink-faint">
              Nothing measured yet. Add a sample and Whodunnit will describe what it can actually see: rhythm, contractions,
              punctuation, phrases you repeat. Nothing it has to guess.
            </p>
          ) : (
            <>
              {vp.observations.length > 0 ? (
                <ul className="mt-3 space-y-2.5">
                  {vp.observations.map((o) => (
                    <li key={o.id} className="flex items-start justify-between gap-4">
                      <span className="font-serif text-[1.0625rem] leading-snug text-ink">
                        {o.text}
                        {o.source === "model" && <span className="smallcaps ml-2 text-ink-faint">model</span>}
                      </span>
                      <span className="shrink-0 pt-1.5">
                        <ConfidenceMark value={o.confidence} />
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[0.875rem] italic text-ink-faint">Not enough text yet to describe a habit with confidence.</p>
              )}

              {stats.recurringPhrases.length > 0 && (
                <div className="mt-6">
                  <h3 className="smallcaps text-ink-faint">Phrases you repeat across samples</h3>
                  <p className="mt-2 font-serif text-[1rem] italic text-ink-soft">{stats.recurringPhrases.map((p) => `“${p}”`).join("  ·  ")}</p>
                </div>
              )}

              <details className="group mt-6 border-t border-rule pt-3">
                <summary className="smallcaps cursor-pointer list-none text-ink-faint hover:text-ink">
                  <span className="group-open:hidden">Show measurements</span>
                  <span className="hidden group-open:inline">Hide measurements</span>
                </summary>
                <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[0.8125rem] sm:grid-cols-[1fr_auto_auto]">
                  <StatRow label="Sentence length" m={stats.sentences.meanLength} unit="words" />
                  <StatRow label="Length spread" m={stats.sentences.lengthStdDev} unit="± words" />
                  <StatRow label="Questions" m={{ ...stats.sentences.questionRate, value: stats.sentences.questionRate.value * 100 }} unit="% of sentences" digits={0} />
                  <StatRow label="Contractions" m={stats.vocabulary.contractionRate} unit="/100 words" />
                  <StatRow label="First person" m={stats.vocabulary.firstPersonRate} unit="/100 words" />
                  <StatRow label="Hedges" m={stats.vocabulary.hedgeRate} unit="/100 words" />
                  <StatRow label="Word length" m={stats.vocabulary.meanWordLength} unit="letters" />
                  <StatRow label="Lexical variety" m={stats.vocabulary.lexicalVariety} digits={2} />
                  <StatRow label="Commas" m={stats.punctuation.commasPer100} unit="/100 words" />
                  <StatRow label="Dashes" m={stats.punctuation.dashesPer100} unit="/100 words" />
                  <StatRow label="Semicolons" m={stats.punctuation.semicolonsPer100} unit="/100 words" />
                  <StatRow label="Parentheses" m={stats.punctuation.parenthesesPer100} unit="/100 words" />
                </dl>
              </details>

              {engine.mode === "live" && samples.length >= 2 && (
                <div className="mt-6 border-t border-rule pt-4">
                  <Button variant="link" onClick={observe} disabled={observeState.kind === "busy"}>
                    {observeState.kind === "busy" ? "Reading your samples…" : "Ask the model for observations"}
                  </Button>
                  <p className="mt-1.5 text-[0.75rem] leading-relaxed text-ink-faint">
                    Sends these samples to the writing model once. They are not stored on the server.
                  </p>
                  {observeState.kind === "error" && <p className="mt-1 text-[0.8125rem] text-accent">{observeState.message}</p>}
                </div>
              )}
            </>
          )}

          <div className="mt-10 border-t border-rule pt-4">
            {confirmDelete ? (
              <div className="flex items-center gap-3 text-[0.8125rem]">
                <span className="text-ink">Delete this voiceprint and its samples?</span>
                <Button variant="link" onClick={() => void api.remove(vp.id)}>
                  Delete
                </Button>
                <Button variant="link" onClick={() => setConfirmDelete(false)}>
                  Keep
                </Button>
              </div>
            ) : (
              <Button variant="link" onClick={() => setConfirmDelete(true)}>
                Delete voiceprint
              </Button>
            )}
          </div>
        </section>
      </div>
    </article>
  );
}
