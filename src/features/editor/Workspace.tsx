"use client";

import { useDeferredValue, useEffect, useMemo, useRef } from "react";
import { Button, Kbd } from "@/components/ui/Button";
import type { EngineInfo } from "@/domain/document";
import { MAX_SOURCE_CHARS } from "@/domain/document";
import { analyzeText } from "@/lib/analysis/analyze";
import { verifyDeterministic } from "@/lib/verification/verify";
import { Marginalia } from "@/features/reconstruction/Marginalia";
import { RefineBar } from "@/features/reconstruction/RefineBar";
import { ResultPane } from "@/features/reconstruction/ResultPane";
import { useWorkspace } from "@/features/reconstruction/useWorkspace";
import { useVoiceprints } from "@/features/voiceprints/useVoiceprints";
import { EXAMPLE_TEXT } from "./example";
import { ProseField } from "./ProseField";
import { TargetPicker } from "./TargetPicker";

const fmt = new Intl.NumberFormat("en");

export function Workspace({ engine }: { engine: EngineInfo }) {
  const { voiceprints } = useVoiceprints();
  const { state, dispatch, run, cancel, reset } = useWorkspace(voiceprints);
  const sourceRef = useRef<HTMLTextAreaElement>(null);

  const running = state.status.kind === "running" ? state.status.run : null;
  const deferredSource = useDeferredValue(state.source);
  const deferredResult = useDeferredValue(state.resultText);
  const sourceAnalysis = useMemo(() => (deferredSource.trim() ? analyzeText(deferredSource) : null), [deferredSource]);
  const resultAnalysis = useMemo(() => (deferredResult.trim() ? analyzeText(deferredResult) : null), [deferredResult]);

  // When the author edits the result, re-run the deterministic meaning checks against the original.
  const currentRevision = state.revisions.find((r) => r.id === state.currentRevisionId) ?? null;
  const editedByHand = Boolean(currentRevision && deferredResult !== currentRevision.text && deferredResult.trim());
  const meta = useMemo(() => {
    if (!state.result || !editedByHand || !currentRevision) return state.result;
    return { ...state.result, verification: verifyDeterministic(state.source, deferredResult, currentRevision.profile), editedByHand: true };
  }, [state.result, editedByHand, currentRevision, state.source, deferredResult]);

  const tooLong = state.source.length > MAX_SOURCE_CHARS;
  const canRun = state.loaded && !running && state.source.trim().length > 0 && !tooLong;

  // ⌘/Ctrl+Enter reconstructs from anywhere in the workspace; Escape stops a run.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) {
        const inRefine = (e.target as HTMLElement | null)?.id === "refine-note";
        if (!inRefine) {
          e.preventDefault();
          void run("reconstruct");
        }
      } else if (e.key === "Escape" && running) {
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [canRun, run, running, cancel]);

  const words = sourceAnalysis?.counts.words ?? 0;

  return (
    <div className="mx-auto max-w-[88rem] px-4 pb-16 sm:px-8">
      <div className="z-20 border-b border-rule bg-paper/95 py-3 backdrop-blur-sm md:sticky md:top-0">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
          <div className="min-w-0 flex-1">
            <TargetPicker
              value={state.target}
              onChange={(t) => dispatch({ type: "target", value: t })}
              voiceprints={voiceprints}
              disabled={running !== null}
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button onClick={reset} disabled={!state.source && !state.resultText}>
              New
            </Button>
            <Button variant="primary" onClick={() => void run("reconstruct")} disabled={!canRun} aria-keyshortcuts="Meta+Enter Control+Enter">
              {state.resultText ? "Reconstruct again" : "Reconstruct"} <Kbd>⌘↵</Kbd>
            </Button>
          </div>
        </div>
      </div>

      {state.status.kind === "error" && (
        <p role="alert" className="mt-4 border-l-2 border-accent pl-3 text-[0.875rem] text-ink">
          {state.status.message}
        </p>
      )}

      {engine.mode === "demo" && state.resultText && (
        <p className="mt-4 text-[0.8125rem] text-ink-faint">
          Demo engine: these are rule-based edits (stock phrasing, contractions, plain words). Set <code className="font-mono text-[0.75rem]">ANTHROPIC_API_KEY</code> for full reconstruction.
        </p>
      )}

      <div className="mt-6 grid grid-cols-1 gap-y-10 lg:grid-cols-2 lg:gap-x-0 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_17rem]">
        <section aria-labelledby="source-label" className="lg:border-r lg:border-rule lg:pr-10">
          <div className="flex min-h-9 items-center justify-between">
            <h2 id="source-label" className="smallcaps text-ink-faint">
              Your text
            </h2>
            <p className={`smallcaps tabular-nums ${tooLong ? "text-accent" : "text-ink-faint"}`} aria-live="polite">
              {fmt.format(words)} words · {fmt.format(state.source.length)}
              {tooLong ? ` / ${fmt.format(MAX_SOURCE_CHARS)} chars` : " chars"}
            </p>
          </div>
          <ProseField
            ref={sourceRef}
            aria-labelledby="source-label"
            value={state.source}
            disabled={!state.loaded}
            onChange={(e) => dispatch({ type: "source", value: e.target.value })}
            placeholder="Paste something that sounds like nobody wrote it. A cover letter, a status update, an essay paragraph…"
            minRows={9}
            className="mt-3"
          />
        </section>

        <section aria-label="Reconstruction" className="flex flex-col gap-8 lg:pl-10 xl:pr-10">
          <ResultPane
            source={state.source}
            text={state.resultText}
            meta={meta}
            running={running}
            revisions={state.revisions}
            currentRevisionId={state.currentRevisionId}
            onTextChange={(v) => dispatch({ type: "resultText", value: v })}
            onRestore={(id) => dispatch({ type: "restore", revisionId: id })}
            onCancel={cancel}
            canTryExample={!state.source.trim()}
            onTryExample={() => {
              dispatch({ type: "source", value: EXAMPLE_TEXT });
              sourceRef.current?.focus();
            }}
          />
          {state.resultText.trim() && <RefineBar busy={running !== null} onRefine={(r) => void run("refine", r)} />}
        </section>

        <aside aria-label="Notes" className="lg:col-span-2 lg:border-t lg:border-rule lg:pt-6 xl:col-span-1 xl:border-l xl:border-t-0 xl:pl-8 xl:pt-0">
          <h2 className="smallcaps flex min-h-9 items-center text-ink-faint">Notes</h2>
          <div className="mt-3">
            <Marginalia source={sourceAnalysis} result={state.result ? resultAnalysis : null} meta={meta} />
          </div>
        </aside>
      </div>
    </div>
  );
}
