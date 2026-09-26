"use client";

import type { Finding } from "@/domain/verification";
import type { RuleFinding } from "@/domain/writing-rules";
import type { WritingAnalysis } from "@/lib/rules/engine";
import type { ResultMeta } from "./useWorkspace";

/**
 * Marginal notes: what was measured in the author's text, which writing
 * patterns the rules found (and why), what the rewrite changed, and whether
 * the meaning survived. Every number is computed from the text. There is no
 * score and no guess about who wrote anything.
 */

function rhythm(cv: number) {
  if (cv < 0.3) return "very even";
  if (cv < 0.5) return "somewhat varied";
  return "varied";
}

const CHECK_LABELS: Record<string, string> = {
  protected_spans: "figures, dates, names, quotations, links",
  negation: "negation",
  length: "length",
  lexical_coverage: "key words",
  model_meaning: "claim-by-claim meaning (model)",
};

function sourceLine(f: RuleFinding): string {
  const s = f.rule.source;
  if (s.type === "builtin") return "Whodunnit rule";
  const who = [s.title?.split(":")[0], s.license].filter(Boolean).join(" · ");
  return `${s.relation === "adapted" ? "Adapted from" : "Derived from"} ${who}`;
}

function Note({ label, aside, children }: { label: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-3">
      <h3 className="smallcaps mb-2 flex items-baseline justify-between gap-2 text-ink-faint">
        <span>{label}</span>
        {aside && <span className="tabular-nums normal-case tracking-normal">{aside}</span>}
      </h3>
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

function PatternItem({ f }: { f: RuleFinding }) {
  const first = f.matches[0];
  return (
    <li>
      <details className="group">
        <summary className="flex cursor-pointer list-none items-baseline gap-2 text-ink marker:hidden hover:text-ink [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="text-ink-faint transition-transform group-open:rotate-90">›</span>
          <span className="flex-1">{f.rule.name}</span>
          {f.matches.length > 1 && <span className="tabular-nums text-ink-faint">×{f.matches.length}</span>}
        </summary>
        <div className="mt-1.5 space-y-1.5 border-l border-rule pl-3">
          <p>{f.rule.description}</p>
          {first && first.end - first.start < 400 && <p className="font-serif italic text-ink">“{first.excerpt}”</p>}
          <p className="text-ink-faint">{first?.evidence}</p>
          <p>{f.rule.guidance}</p>
          <p className="smallcaps text-ink-faint">
            {f.rule.determinism} · {sourceLine(f)}
          </p>
        </div>
      </details>
    </li>
  );
}

export function Marginalia({ source, result, meta }: { source: WritingAnalysis | null; result: WritingAnalysis | null; meta: ResultMeta | null }) {
  const hasSource = source && source.metrics.words >= 12;
  if (!hasSource && !meta) {
    return (
      <p className="text-[0.8125rem] italic leading-relaxed text-ink-faint">
        Notes on rhythm, writing patterns and meaning appear here as you write.
      </p>
    );
  }

  const v = meta?.verification;
  const p = meta?.patterns;
  const active = (source?.findings ?? []).filter((f) => !f.suppressedBy && f.rule.severity !== "info");
  const info = (source?.findings ?? []).filter((f) => !f.suppressedBy && f.rule.severity === "info");
  const kept = (source?.findings ?? []).filter((f) => f.suppressedBy);
  const matchedTargets = p?.targets.filter((t) => t.met && t.origin.startsWith("Voiceprint")) ?? [];

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

      {p && !meta?.editedByHand && (
        <Note label="Patterns" aside={`${p.before} → ${p.after}`}>
          {p.resolved.length > 0 && <p>Resolved: {p.resolved.map((x) => x.name).join(", ")}.</p>}
          {p.introduced.length > 0 && <p className="text-accent">Introduced: {p.introduced.map((x) => x.name).join(", ")}.</p>}
          {p.remaining.length > 0 && <p className="text-ink-faint">Still present: {p.remaining.map((x) => `${x.name}${x.count > 1 ? ` ×${x.count}` : ""}`).join(", ")}.</p>}
          {matchedTargets.length > 0 && <p className="text-ink-faint">Within your voiceprint: {matchedTargets.map((t) => t.label).join(", ")}.</p>}
          <p className="text-ink-faint">Counts of catalogued patterns, not a quality score.</p>
        </Note>
      )}

      {meta && (meta.plan.length > 0 || meta.changes.length > 0) && (
        <Note label={meta.engine.mode === "demo" ? "Edits (rule-based)" : "Edits"}>
          <ul className="space-y-1">
            {(meta.changes.length ? meta.changes : meta.plan).slice(0, 7).map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
          {meta.attempts !== null && meta.attempts > 1 && <p className="text-ink-faint">Took {meta.attempts} attempts to pass the checks.</p>}
        </Note>
      )}

      {hasSource && source && !meta && (
        <Note label="Writing patterns" aside={active.length ? String(active.length) : undefined}>
          {active.length === 0 && kept.length === 0 && <p className="italic text-ink-faint">None of the catalogued patterns were found.</p>}
          {active.length > 0 && <ul className="space-y-1.5">{active.map((f) => <PatternItem key={f.rule.id} f={f} />)}</ul>}
          {info.length > 0 && (
            <ul className="space-y-1.5 text-ink-faint">
              {info.map((f) => (
                <PatternItem key={f.rule.id} f={f} />
              ))}
            </ul>
          )}
          {kept.length > 0 && (
            <ul className="space-y-1 pt-1 text-ink-faint">
              {kept.map((f) => (
                <li key={f.rule.id}>
                  Kept as your habit: {f.rule.name}. <span className="italic">{f.suppressedBy?.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </Note>
      )}

      {hasSource && source && (
        <Note label={result ? "Before → after" : "Reading"}>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 [&_dd]:whitespace-nowrap">
            <dt>Avg sentence</dt>
            <dd className="text-right tabular-nums text-ink">
              {source.metrics.sentenceLength.mean}
              {result && ` → ${result.metrics.sentenceLength.mean}`}
            </dd>
            <dt>Rhythm</dt>
            <dd className="text-right text-ink">
              {rhythm(source.metrics.sentenceLength.cv)}
              {result && ` → ${rhythm(result.metrics.sentenceLength.cv)}`}
            </dd>
            <dt>Stock openers</dt>
            <dd className="text-right tabular-nums text-ink">
              {Math.round(source.metrics.shares.transitionOpeners * 100)}%
              {result && ` → ${Math.round(result.metrics.shares.transitionOpeners * 100)}%`}
            </dd>
            <dt>Contractions</dt>
            <dd className="text-right tabular-nums text-ink">
              {source.metrics.per100.contractions}
              {result && ` → ${result.metrics.per100.contractions}`}
            </dd>
          </dl>
        </Note>
      )}
    </div>
  );
}
