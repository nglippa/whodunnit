import { MODALITY_LEVELS, type ClaimChange, type IntegritySeverity, type ScaleMarker } from "@/domain/semantics";
import { stem } from "../analysis/stem";
import { words } from "../analysis/tokenize";
import { contentStems, isHighInformation, type ExtractedClaim } from "./claims";
import { CONDITIONAL_MARKERS, TEMPORAL_MARKERS, findMarkers } from "./lexicon";
import { compareQuantities } from "./quantities";

/**
 * Claim-to-claim comparison. Claims are aligned by shared content (so a split
 * or merged sentence still lines up), then compared on the features that carry
 * meaning. Every reported change names the two phrasings it compared.
 */

export interface Licenses {
  /** The author asked for stronger or more confident claims. */
  strengthen?: string;
  /** The author asked for softer or more hedged claims. */
  weaken?: string;
  /** The author asked for content to be removed. */
  remove?: string;
}

export interface CompareContext {
  /** Source spans a rewrite may delete outright (filler patterns such as a fake-profound kicker). */
  removableSpans?: [number, number][];
  licenses?: Licenses;
}

const excerpt = (s: string, n = 140) => {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

function blankSpans(text: string, spans: [number, number][]): string {
  let out = text;
  for (const [a, b] of spans) out = out.slice(0, a) + " ".repeat(Math.max(0, b - a)) + out.slice(b);
  return out;
}

const overlapShare = (span: { start: number; end: number }, spans: [number, number][]) => {
  const len = span.end - span.start || 1;
  let covered = 0;
  for (const [a, b] of spans) covered += Math.max(0, Math.min(b, span.end) - Math.max(a, span.start));
  return covered / len;
};

class UnionFind {
  private parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) this.parent.set(x, x);
    const p = this.parent.get(x)!;
    if (p === x) return x;
    const r = this.find(p);
    this.parent.set(x, r);
    return r;
  }
  union(a: string, b: string) {
    this.parent.set(this.find(a), this.find(b));
  }
}

const change = (c: Omit<ClaimChange, "licensedBy"> & { licensedBy?: string | null }): ClaimChange => ({ ...c, licensedBy: c.licensedBy ?? null });

function licensed(severity: IntegritySeverity, license: string | undefined): { severity: IntegritySeverity; licensedBy: string | null } {
  return license ? { severity: "minor", licensedBy: license } : { severity, licensedBy: null };
}

/** The source already uses this marker with the same next word ("most people"), just in another sentence. */
function sourceUsesMarker(source: string, output: string, marker: string): boolean {
  const next = output.match(new RegExp(`\\b${marker.replace(/\s+/g, "\\s+")}\\s+([\\p{L}'’-]+)`, "iu"))?.[1];
  return Boolean(next) && new RegExp(`\\b${marker.replace(/\s+/g, "\\s+")}\\s+${next}\\b`, "iu").test(source);
}

/** Content stems in the few words after a negator: what the sentence says is not so. */
function negatedContent(text: string): string[] {
  const m = text.match(/(?:\b(?:not|never|no|without|cannot|none|nothing|nobody)|n['’]t)\b\s+([^,.;:!?—–()]{1,60})/i);
  return m ? contentStems(m[1]).slice(0, 3) : [];
}

export interface ClaimComparisonResult {
  changes: ClaimChange[];
  aligned: number;
  removableClaims: string[];
}

export function compareClaims(sourceText: string, outputText: string, src: ExtractedClaim[], out: ExtractedClaim[], ctx: CompareContext = {}): ClaimComparisonResult {
  const changes: ClaimChange[] = [];
  const removableSpans = ctx.removableSpans ?? [];
  const lic = ctx.licenses ?? {};
  const removable = new Set(src.filter((c) => removableSpans.length && overlapShare(c.span, removableSpans) >= 0.5).map((c) => c.id));
  // Content words inside removable spans (e.g. "In today's fast-paced world,") are expected to go.
  const coreSource = blankSpans(sourceText, removableSpans);
  const core = new Map(src.map((c) => [c.id, [...contentStems(coreSource.slice(c.span.start, c.span.end)), ...c.content.filter((x) => x.startsWith("#") || x.startsWith("@"))]]));

  // ---- alignment
  const uf = new UnionFind();
  const edges: [ExtractedClaim, ExtractedClaim][] = [];
  for (const s of src) {
    const S = new Set(s.content);
    if (!S.size) continue;
    for (const o of out) {
      const O = new Set(o.content);
      if (!O.size) continue;
      let inter = 0;
      for (const x of S) if (O.has(x)) inter++;
      const strong = inter >= 2 && (inter / S.size >= 0.4 || inter / O.size >= 0.4);
      const small = inter >= 1 && inter / S.size >= 0.5 && inter / O.size >= 0.5;
      if (strong || small) {
        uf.union(`s:${s.id}`, `o:${o.id}`);
        edges.push([s, o]);
      }
    }
  }
  const groups = new Map<string, { src: ExtractedClaim[]; out: ExtractedClaim[] }>();
  for (const [s, o] of edges) {
    const g = uf.find(`s:${s.id}`);
    if (!groups.has(g)) groups.set(g, { src: [], out: [] });
    const G = groups.get(g)!;
    if (!G.src.includes(s)) G.src.push(s);
    if (!G.out.includes(o)) G.out.push(o);
  }
  const alignedSrc = new Set(edges.map(([s]) => s.id));

  // A claim states causation with a causal connective ("because") or a causal verb ("causes", "leads to").
  const causalCount = (c: ExtractedClaim) => c.causal.length + c.strength.filter((m) => m.scale === "causation" && m.rank >= 3).length;
  const totalSrcCausal = src.reduce((n, c) => n + causalCount(c), 0);
  const totalOutCausal = out.reduce((n, c) => n + c.causal.length, 0);

  for (const { src: gs, out: go } of groups.values()) {
    // Removable filler may vanish, so it cannot make the source look negative;
    // but its markers still count when the rewrite keeps the idea ("most people ...").
    const kept = gs.filter((c) => !removable.has(c.id));
    const S = gs;
    if (!kept.length || !go.length) continue;
    const oneToOne = kept.length === 1 && go.length === 1;
    const sIds = S.map((c) => c.id).join(",");
    const oIds = go.map((c) => c.id).join(",");
    const sText = excerpt(S.map((c) => c.text).join(" "));
    const oText = excerpt(go.map((c) => c.text).join(" "));
    const base = { sourceClaimId: sIds, outputClaimId: oIds, source: sText, output: oText };

    // Polarity: explicit or implicit negation must survive, and must not appear from nowhere.
    const sNeg = kept.flatMap((c) => c.negators);
    const sNegAll = S.flatMap((c) => c.negators);
    const oNeg = go.flatMap((c) => c.negators);
    if (sNeg.length && !oNeg.length) {
      // If what was negated is gone too, the clause was dropped rather than flipped.
      const negated = kept.flatMap((c) => negatedContent(c.text));
      const outStemsHere = new Set(go.flatMap((c) => c.content));
      const survives = negated.length === 0 || negated.some((x) => outStemsHere.has(x));
      if (survives)
        changes.push(change({ ...base, relation: "contradicted", aspect: "polarity", severity: oneToOne ? "blocking" : "major", detail: `The source is negative (“${sNeg[0]}”); the rewrite has no negation.` }));
      else
        changes.push(change({ ...base, relation: "dropped", aspect: "content", severity: "major", detail: `The negated statement (“${sNeg[0]} … ${negated.join(" ")}”) is gone from the rewrite.` }));
    }
    else if (!sNegAll.length && oNeg.length)
      changes.push(change({ ...base, relation: "contradicted", aspect: "polarity", severity: oneToOne ? "blocking" : "major", detail: `The rewrite adds a negation (“${oNeg[0]}”) the source does not have.` }));

    // Modality: hedges and emphasis.
    const lvl = (cs: ExtractedClaim[]) => Math.min(...cs.map((c) => MODALITY_LEVELS.indexOf(c.modality)));
    const sl = lvl(S);
    const ol = lvl(go);
    if (ol > sl) {
      const l = licensed("major", lic.strengthen);
      changes.push(change({ ...base, relation: "strengthened", aspect: "modality", ...l, detail: `Certainty rose from ${MODALITY_LEVELS[sl]} to ${MODALITY_LEVELS[ol]}.` }));
    } else if (ol < sl) {
      const l = licensed("major", lic.weaken);
      changes.push(change({ ...base, relation: "weakened", aspect: "modality", ...l, detail: `Certainty fell from ${MODALITY_LEVELS[sl]} to ${MODALITY_LEVELS[ol]}.` }));
    }

    // Ordered scales: evidence, causation, quantifier, frequency.
    for (const scale of ["evidence", "causation", "quantifier", "frequency"] as ScaleMarker["scale"][]) {
      const sm = S.flatMap((c) => c.strength.filter((x) => x.scale === scale));
      // A causal connective ("because", "due to") states causation: rank 3 on the causal scale.
      if (scale === "causation") for (const c of S) for (const k of c.causal) sm.push({ scale, rank: 3, marker: k });
      const om = go.flatMap((c) => c.strength.filter((x) => x.scale === scale));
      const sMax = sm.length ? Math.max(...sm.map((x) => x.rank)) : null;
      const oMax = om.length ? Math.max(...om.map((x) => x.rank)) : null;
      const sWord = sm.find((x) => x.rank === sMax)?.marker;
      const oWord = om.find((x) => x.rank === oMax)?.marker;
      if (sMax !== null && oMax !== null && sMax !== oMax) {
        const up = oMax > sMax;
        // On the causal scale adjacent concepts overlap ("helps" vs "enables"): a one-step move is reviewed, not failed.
        const step = Math.abs(oMax - sMax);
        const sev: IntegritySeverity = scale === "causation" && step === 1 ? "major" : oneToOne ? "blocking" : "major";
        const l = licensed(sev, up ? lic.strengthen : lic.weaken);
        changes.push(change({ ...base, relation: up ? "strengthened" : "weakened", aspect: scale, ...l, detail: `“${sWord}” became “${oWord}” (${scale} ${up ? "strengthened" : "weakened"}).` }));
      } else if (scale === "causation" && sMax === null && oMax !== null && oMax >= 3 && !gs.some((c) => c.causal.length)) {
        // An invented mechanism: the source states no cause or determination for this content.
        const l = licensed("blocking", lic.strengthen);
        changes.push(change({ ...base, relation: "added", aspect: "causal-relation", ...l, detail: `The rewrite asserts a causal mechanism (“${oWord}”) the source does not state.` }));
      } else if (sMax === null && oMax !== null && oMax >= 3 && !sourceUsesMarker(sourceText, go.map((c) => c.text).join(" "), oWord!)) {
        const l = licensed("major", lic.strengthen);
        changes.push(change({ ...base, relation: "strengthened", aspect: scale, ...l, detail: `The rewrite adds “${oWord}”, a stronger ${scale} claim than the source makes.` }));
      } else if (sMax !== null && oMax === null && (scale === "quantifier" || scale === "frequency") && sMax <= 3) {
        const l = licensed("major", lic.strengthen);
        changes.push(change({ ...base, relation: "strengthened", aspect: scale, ...l, detail: `The qualifier “${sWord}” was dropped, which generalises the claim.` }));
      }
    }

  }

  // ---- causal mechanisms in output sentences that align with nothing in the source
  const srcHasCausation = src.some((c) => causalCount(c) > 0);
  if (!srcHasCausation) {
    for (const o of out) {
      if (groups.has(uf.find(`o:${o.id}`))) continue;
      const m = o.strength.find((x) => x.scale === "causation" && x.rank >= 3);
      if (m)
        changes.push(change({ relation: "added", aspect: "causal-relation", severity: lic.strengthen ? "minor" : "blocking", licensedBy: lic.strengthen ?? null, sourceClaimId: null, outputClaimId: o.id, source: null, output: excerpt(o.text), detail: `The rewrite asserts a causal mechanism (“${m.marker}”) the source does not state.` }));
    }
  }

  // ---- causal relations the source never states (aligned or not)
  if (totalOutCausal > totalSrcCausal) {
    for (const o of out.filter((c) => c.causal.length)) {
      const g = groups.get(uf.find(`o:${o.id}`));
      if (g?.src.some((c) => causalCount(c) > 0)) continue;
      changes.push(change({ relation: "added", aspect: "causal-relation", severity: "blocking", sourceClaimId: g ? g.src.map((c) => c.id).join(",") : null, outputClaimId: o.id, source: g ? excerpt(g.src.map((c) => c.text).join(" ")) : null, output: excerpt(o.text), detail: `The rewrite asserts a cause (“${o.causal[0]}”) the source does not state.` }));
    }
  }

  // ---- quantities (matched by value and unit, independent of alignment)
  const srcQ = src.flatMap((c) => c.located.map((q) => ({ q, c })));
  const outQ = out.flatMap((c) => c.located.map((q) => ({ q, c })));
  for (const ch of compareQuantities(srcQ.map((x) => x.q), outQ.map((x) => x.q))) {
    const s = srcQ.find((x) => x.q.text === ch.source);
    const o = outQ.find((x) => x.q.text === ch.output);
    changes.push({ ...ch, sourceClaimId: s?.c.id ?? null, outputClaimId: o?.c.id ?? null });
  }

  // ---- dropped claims
  const outStems = new Set(out.flatMap((c) => c.content));
  for (const s of src) {
    if (removable.has(s.id)) continue;
    const k = core.get(s.id) ?? [];
    if (!k.length) continue;
    const kept = k.filter((x) => outStems.has(x)).length / k.length;
    const high = isHighInformation(s);
    const dropped = k.length >= 2 ? kept < 0.34 : high && kept === 0;
    if (!dropped) continue;
    // Low word overlap can only reliably fail a claim that carries distinctive anchors
    // (a number, negation, name, hedge, cause); anything else may be a paraphrase.
    const l = licensed(high ? "blocking" : "major", lic.remove);
    changes.push(change({ relation: "dropped", aspect: "content", ...l, sourceClaimId: s.id, outputClaimId: null, source: excerpt(s.text), output: null, detail: `This claim no longer appears in the rewrite (${Math.round(kept * 100)}% of its content words survive).` }));
  }

  // ---- added content, clauses and questions
  const srcAll = new Set(words(sourceText).map((w) => stem(w.toLowerCase().replace(/['’]/g, "'"))));
  const srcHas = (marker: string) => findMarkers(sourceText, [marker]).length > 0;
  for (const o of out) {
    if (o.type === "question") continue;
    const clauses = o.text.split(/[,;:—–()]|\s-\s|\s(?=(?:and|but|while|when|because|which|who|although|though|if|unless|until|after|before|whereas|so that)\s)/i);
    let reported = false;
    for (const clause of clauses) {
      if (reported) break;
      const stems = contentStems(clause);
      if (stems.length < 2) continue;
      const novel = stems.filter((x) => !srcAll.has(x));
      const lead = findMarkers(clause.trim().split(/\s+/).slice(0, 3).join(" "), [...TEMPORAL_MARKERS, ...CONDITIONAL_MARKERS])[0]?.marker;
      if (lead && novel.length >= 1 && novel.length / stems.length >= 0.5 && !srcHas(lead)) {
        changes.push(change({ relation: "added", aspect: "temporal-clause", severity: "major", sourceClaimId: null, outputClaimId: o.id, source: null, output: excerpt(clause), detail: `An added “${lead}” clause with content not in the source (${novel.join(", ")}).` }));
        reported = true;
      } else if (novel.length >= 2 && novel.length / stems.length >= 0.6) {
        changes.push(change({ relation: "added", aspect: "content", severity: "major", sourceClaimId: null, outputClaimId: o.id, source: null, output: excerpt(clause), detail: `Likely added content: ${novel.length} of ${stems.length} content words are not in the source.` }));
        reported = true;
      }
    }
  }
  const srcQs = src.filter((c) => c.type === "question");
  const outQs = out.filter((c) => c.type === "question");
  if (outQs.length > srcQs.length) {
    const unmatched = outQs.filter((q) => !srcQs.some((s) => {
      const a = new Set(s.content);
      const inter = q.content.filter((x) => a.has(x)).length;
      return inter > 0 && (2 * inter) / (a.size + q.content.length) >= 0.5;
    }));
    for (const q of unmatched.slice(0, outQs.length - srcQs.length))
      changes.push(change({ relation: "added", aspect: "question", severity: "major", sourceClaimId: null, outputClaimId: q.id, source: null, output: excerpt(q.text), detail: "The rewrite asks a question the source does not ask." }));
  }

  const seen = new Set<string>();
  const unique = changes.filter((c) => {
    const key = `${c.aspect}|${c.relation}|${c.detail}|${c.output}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { changes: unique, aligned: alignedSrc.size, removableClaims: [...removable] };
}
