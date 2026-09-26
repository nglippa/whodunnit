"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ChangesView } from "@/features/comparison/ChangesView";
import { ProseField } from "@/features/editor/ProseField";
import type { Revision } from "@/domain/document";
import type { ResultMeta, RunKind } from "./useWorkspace";

export type CompareMode = "result" | "changes";

const STATUS_COPY: Record<ResultMeta["verification"]["status"], string> = {
  preserved: "Meaning checks passed",
  review: "Worth a careful read",
  rejected: "A fact changed · see notes",
};

export function ResultPane({
  source,
  text,
  meta,
  running,
  revisions,
  currentRevisionId,
  onTextChange,
  onRestore,
  onCancel,
  onTryExample,
  canTryExample,
}: {
  source: string;
  text: string;
  meta: ResultMeta | null;
  running: RunKind | null;
  revisions: Revision[];
  currentRevisionId: string | null;
  onTextChange: (v: string) => void;
  onRestore: (id: string) => void;
  onCancel: () => void;
  onTryExample: () => void;
  canTryExample: boolean;
}) {
  const [mode, setMode] = useState<CompareMode>("result");
  const [copied, setCopied] = useState(false);
  const hasResult = text.trim().length > 0;

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      // Clipboard can be blocked; selecting the text keeps copying one keystroke away.
      document.getElementById("result-text")?.focus();
      (document.getElementById("result-text") as HTMLTextAreaElement | null)?.select();
    }
  };

  const index = revisions.findIndex((r) => r.id === currentRevisionId);

  return (
    <div className="flex flex-col">
      <div className="flex min-h-9 items-center gap-x-3">
        <div role="tablist" aria-label="Result view" className="-ml-2.5 flex">
          {(["result", "changes"] as const).map((m) => (
            <button
              key={m}
              role="tab"
              type="button"
              aria-selected={mode === m}
              disabled={!hasResult}
              onClick={() => setMode(m)}
              className={`smallcaps relative h-8 px-2.5 transition-colors disabled:opacity-40 ${mode === m ? "text-ink" : "text-ink-faint hover:text-ink"}`}
            >
              {m === "result" ? "Reconstructed" : "Changes"}
              {mode === m && hasResult && <span aria-hidden className="absolute inset-x-2.5 bottom-0.5 h-px bg-ink" />}
            </button>
          ))}
        </div>
        {revisions.length > 1 && (
          <div className="flex items-center gap-1 text-[0.8125rem] text-ink-faint" aria-label="Revision history">
            <button
              type="button"
              aria-label="Previous revision"
              disabled={index <= 0 || running !== null}
              onClick={() => onRestore(revisions[index - 1].id)}
              className="px-1 hover:text-ink disabled:opacity-30"
            >
              ‹
            </button>
            <span className="tabular-nums whitespace-nowrap">
              <span className="hidden sm:inline">Revision </span>
              {index + 1} of {revisions.length}
            </span>
            <button
              type="button"
              aria-label="Next revision"
              disabled={index >= revisions.length - 1 || running !== null}
              onClick={() => onRestore(revisions[index + 1].id)}
              className="px-1 hover:text-ink disabled:opacity-30"
            >
              ›
            </button>
          </div>
        )}
        <div className="ml-auto flex items-center gap-1">
          {hasResult && meta && !running && meta.verification.status !== "preserved" && (
            <span className={`hidden text-[0.8125rem] 2xl:inline ${meta.verification.status === "rejected" ? "text-accent" : "text-ink-faint"}`}>
              {STATUS_COPY[meta.verification.status]}
            </span>
          )}
          <Button onClick={copy} disabled={!hasResult || running !== null} aria-live="polite">
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div className="relative mt-3" aria-busy={running !== null}>
        {running && (
          <div className="absolute inset-x-0 -top-3 z-10">
            <div className="h-px w-full bg-rule">
              <div className="progress-ink h-px w-full bg-accent" />
            </div>
            <div className="mt-3 flex items-center gap-3 text-[0.875rem] text-ink-soft">
              <span role="status">{running === "refine" ? "Refining against your original…" : "Reconstructing, then checking the meaning…"}</span>
              <Button variant="link" onClick={onCancel}>
                Stop <span className="sr-only">(Escape)</span>
              </Button>
            </div>
          </div>
        )}

        {!hasResult && !running && (
          <div className="font-serif text-[1.1875rem] leading-[1.68] text-ink-faint">
            <p className="italic">Your reconstruction will appear here, editable, beside the original.</p>
            {canTryExample && (
              <p className="mt-4 font-sans text-[0.875rem] not-italic">
                <Button variant="link" onClick={onTryExample}>
                  Try it with an example
                </Button>
              </p>
            )}
          </div>
        )}

        {hasResult && (
          <div className={running ? "pointer-events-none opacity-40 transition-opacity" : "transition-opacity"}>
            {mode === "result" ? (
              <ProseField
                id="result-text"
                aria-label="Reconstructed text (editable)"
                value={text}
                minRows={8}
                onChange={(e) => onTextChange(e.target.value)}
              />
            ) : (
              <ChangesView before={source} after={text} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
