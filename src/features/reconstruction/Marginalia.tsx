"use client";

import type { TextAnalysis } from "@/lib/analysis/analyze";
import type { Finding } from "@/domain/verification";
import type { ResultMeta } from "./useWorkspace";

/**
 * Marginal notes: what was measured in the author's text, what the rewrite
 * changed, and whether the meaning survived. Every number here is computed
 * from the text; nothing is a score.
 */

function rhythm(variation: number) {
  if (variation < 0.3) return "very even";
  if (variation < 0.5) return "somewhat varied";
  return "varied";
}

const CHECK_LABELS: Record<string, string> = {
  protected_spans: "figures, dates, names, quotations, links",
  negation: "negation",
  length: "length",
  lexical_coverage: "key words",
  model_meaning: "claim-by-claim meaning (model)",
};

function Note({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-3">
      <h3 className="smallcaps mb-2 text-ink-faint">{label}</h3>
      <div className="space-y-1.5 text-[0.8125rem] leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

function FindingLine({ f }: { f: Finding }) {
  return (
    <li className="flex gap-2">
      <span aria-hidden className={`mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full ${f.severity === "blocking" ? "bg-accent" : "border border-ink-faint"}`} />
      <span>
        {f.message}
        {f.origin === "model" && <span className="text-ink-faint"> · model</span>}
      </span>
    </li>
  );
}

export function Marginalia({ source, result, meta }: { source: TextAnalysis | null; result: TextAnalysis | null; meta: ResultMeta | null }) {
  const hasSource = source && source.counts.words >= 12;
  if (!hasSource && !meta) {
    return (
      <p className="text-[0.8125rem] italic leading-relaxed text-ink-faint">
        Notes on rhythm, stock phrasing and meaning appear here as you write.
      </p>
    );
  }

  const v = meta?.verification;
  const stockBefore = source?.formulaic.reduce((a, f) => a + f.count, 0) ?? 0;
  const stockAfter = result?.formulaic.reduce((a, f) => a + f.count, 0) ?? 0;

  return (
    <div className="space-y-5">
      {v && (
        <Note label="Meaning">
          <p className="text-[0.875rem] text-ink">
            {v.status === "preserved" && "No meaning changes found."}
            {v.status === "review" && "Worth a careful read."}
            {v.status === "rejected" && "Something factual changed."}
          </p>
          {v.findings.length > 0 && <ul className="space-y-1.5">{v.findings.slice(0, 8).map((f, i) => <FindingLine key={i} f={f} />)}</ul>}
          {meta?.editedByHand && <p className="text-ink-faint">Rechecked against your original after your edits.</p>}
          <p className="text-ink-faint">
            Checked {v.checks.map((c) => CHECK_LABELS[c] ?? c).join(", ")}.
            {!v.checks.includes("model_meaning") && " Claim-level meaning was not model-checked."}
          </p>
        </Note>
      )}

      {meta && (meta.plan.length > 0 || meta.changes.length > 0) && (
        <Note label={meta.engine.mode === "demo" ? "Edits (rule-based)" : "Edits"}>
          <ul className="space-y-1">
            {(meta.changes.length ? meta.changes : meta.plan).slice(0, 7).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {meta.attempts !== null && meta.attempts > 1 && <p className="text-ink-faint">Took {meta.attempts} attempts to pass the meaning checks.</p>}
        </Note>
      )}

      {hasSource && source && (
        <Note label={result ? "Before → after" : "Reading"}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 [&_dd]:whitespace-nowrap">
            <dt>Avg sentence</dt>
            <dd className="text-right tabular-nums text-ink">
              {source.sentenceLength.mean}
              {result && ` → ${result.sentenceLength.mean}`}
            </dd>
            <dt>Rhythm</dt>
            <dd className="text-right text-ink">
              {rhythm(source.sentenceLength.variation)}
              {result && ` → ${rhythm(result.sentenceLength.variation)}`}
            </dd>
            <dt>Stock phrases</dt>
            <dd className="text-right tabular-nums text-ink">
              {stockBefore}
              {result && ` → ${stockAfter}`}
            </dd>
            <dt>Stock openers</dt>
            <dd className="text-right tabular-nums text-ink">
              {Math.round(source.sentenceShares.transitionOpeners * 100)}%
              {result && ` → ${Math.round(result.sentenceShares.transitionOpeners * 100)}%`}
            </dd>
            <dt>Contractions</dt>
            <dd className="text-right tabular-nums text-ink">
              {source.rates.contractions}
              {result && ` → ${result.rates.contractions}`}
            </dd>
          </dl>
          {!result && source.formulaic.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {source.formulaic.slice(0, 5).map((f) => (
                <li key={f.id}>
                  <span className="text-ink">{f.label}</span>
                  {f.count > 1 && <span className="tabular-nums"> ×{f.count}</span>}
                  <span className="block italic text-ink-faint">{f.why}</span>
                </li>
              ))}
            </ul>
          )}
        </Note>
      )}
    </div>
  );
}
