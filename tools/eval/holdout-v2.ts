/** One frozen synthetic exam. This command imports no model provider. */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import {
  adjudicateV2, evaluateV2Text, reviewAgreement, summarizeV2, validateV2Freeze,
  v2Band, v2BriefSchema, v2DocumentsSchema, v2Hash,
  v2ManifestSchema, v2ReviewSchema, v2Words,
} from "../../src/lib/evaluation/holdout-v2";

const base = path.join(process.cwd(), "data/evaluation/holdout-v2");
const frozen = path.join(base, "frozen");
const reports = path.join(base, "reports");
const files = ["documents.json", "briefs.json", "review-r1.json", "review-r2.json", "labels.json", "manifest.json"];
const raw = (folder: string, file: string) => readFileSync(path.join(folder, file), "utf8");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const writeNew = (file: string, value: unknown) => writeFileSync(file, typeof value === "string" ? value : json(value), { flag: "wx" });
const engineRevision = () => execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
function engineFingerprint() {
  const root = process.cwd();
  const paths: string[] = [];
  const visit = (relative: string) => {
    const absolute = path.join(root, relative);
    if (statSync(absolute).isDirectory()) {
      for (const name of readdirSync(absolute).sort()) visit(path.join(relative, name));
    } else if (/\.(?:ts|json)$/u.test(relative) && !/\.test\.ts$/u.test(relative)) paths.push(relative);
  };
  for (const entry of ["src/domain", "src/lib", "data/rules/packs", "tools/eval/holdout-v2.ts", "package.json"]) visit(entry);
  const hash = createHash("sha256");
  for (const relative of paths.sort()) { hash.update(relative); hash.update("\0"); hash.update(readFileSync(path.join(root, relative))); hash.update("\0"); }
  return hash.digest("hex");
}

function freeze(draft: string) {
  if (existsSync(frozen)) throw new Error("Holdout V2 frozen directory already exists");
  const documents = v2DocumentsSchema.parse(JSON.parse(raw(draft, "documents.json")));
  if (documents.filter((d) => v2Band(v2Words(d.text)) === "VERY_SHORT").length < 15 || documents.filter((d) => v2Words(d.text) > 1000).length < 5) {
    throw new Error("Predeclared length coverage requires 15 very-short and five 1,000+ word documents");
  }
  const briefs = z.array(v2BriefSchema).parse(JSON.parse(raw(draft, "briefs.json")));
  const first = z.array(v2ReviewSchema).parse(JSON.parse(raw(draft, "review-r1.json")));
  const second = z.array(v2ReviewSchema).parse(JSON.parse(raw(draft, "review-r2.json")));
  const labels = adjudicateV2(documents, first, second);
  const canonical: Record<string, string> = {
    "documents.json": json(documents), "briefs.json": json(briefs),
    "review-r1.json": json(first), "review-r2.json": json(second), "labels.json": json(labels),
  };
  // Validate the complete object before creating frozen files.
  const manifest = v2ManifestSchema.parse({
    version: "2.0.0", created: new Date().toISOString().slice(0, 10), marker: "FROZEN_HOLDOUT_DO_NOT_TUNE",
    provenance: "synthetic-newly-authored", documentCount: documents.length,
    creatorIds: [...new Set(briefs.map((x) => x.creatorId))].sort(), reviewerIds: ["R1", "R2"], frozenBeforeEvaluation: true,
    engineRevision: engineRevision(), engineSha256: engineFingerprint(),
    files: Object.fromEntries(Object.entries(canonical).map(([name, content]) => [name, v2Hash(content)])),
    dispositionCounts: counts(labels.map((x) => x.disposition)),
    lengthCounts: counts(documents.map((x) => v2Band(v2Words(x.text)))),
    genreCounts: counts(labels.map((x) => x.genre ?? "DISPUTED")),
  });
  const complete = { ...canonical, "manifest.json": json(manifest) };
  validateV2Freeze(complete);
  mkdirSync(frozen, { recursive: true });
  for (const [name, content] of Object.entries(complete)) writeNew(path.join(frozen, name), content);
  writeNew(path.join(frozen, "fingerprints.json"), { ...manifest.files, "manifest.json": v2Hash(complete["manifest.json"]) });
  process.stdout.write(`Frozen ${documents.length} documents before evaluation. Manifest SHA-256: ${v2Hash(complete["manifest.json"])}\n`);
}

function counts(values: string[]) {
  return Object.fromEntries([...new Set(values)].map((v) => [v, values.filter((x) => x === v).length]));
}

function validate() {
  const contents = Object.fromEntries(files.map((file) => [file, raw(frozen, file)]));
  const fingerprints = z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/)).parse(JSON.parse(raw(frozen, "fingerprints.json")));
  if (Object.keys(fingerprints).sort().join() !== files.sort().join()) throw new Error("Frozen fingerprint list differs from file list");
  for (const file of files) if (v2Hash(contents[file]) !== fingerprints[file]) throw new Error(`Fingerprint mismatch: ${file}`);
  return validateV2Freeze(contents);
}

function audit(expectedManifestSha256: string | undefined) {
  const { documents, first, second, labels, manifest } = validate();
  if (!expectedManifestSha256 || !/^[a-f0-9]{64}$/u.test(expectedManifestSha256)) throw new Error("Audit requires the predeclared manifest SHA-256");
  if (v2Hash(raw(frozen, "manifest.json")) !== expectedManifestSha256) throw new Error("Predeclared freeze fingerprint differs");
  if (engineRevision() !== manifest.engineRevision || engineFingerprint() !== manifest.engineSha256) throw new Error("Engine changed since freeze");
  mkdirSync(reports, { recursive: true });
  const lock = path.join(reports, "one-shot-started.json");
  // A crash leaves the lock in place: never silently run this exam again.
  writeNew(lock, { started: new Date().toISOString(), manifestSha256: expectedManifestSha256, documentsSha256: manifest.files["documents.json"], engineRevision: manifest.engineRevision, engineSha256: manifest.engineSha256, strategies: ["reconstruction-v1", "reconstruction-v3", "reconstruction-v5"], deterministicOnly: true });
  const outcomes = documents.map(({ id, text }) => evaluateV2Text(text, id));
  const report = {
    kind: "blind-discourse-holdout-v2-one-shot", created: new Date().toISOString(),
    fingerprints: { manifest: expectedManifestSha256, documents: manifest.files["documents.json"], labels: manifest.files["labels.json"], engine: manifest.engineSha256, engineRevision: manifest.engineRevision },
    methods: { productionV1ModelPressure: "v1 has no unchanged bypass; no model was called", historicalPlanner: "v3 minimal-change planner", experimentalPlanner: "v5 discourse planner", ambiguousPolicy: "exclude from hard clean/problematic rates", noCompositeScore: true },
    agreement: reviewAgreement(documents, first, second),
    summary: summarizeV2(outcomes, labels),
    outcomes,
  };
  writeNew(path.join(reports, "one-shot.json"), report);
  process.stdout.write(json({ agreement: report.agreement.overall, summary: report.summary }));
}

const command = process.argv[2];
if (command === "freeze") {
  if (!process.argv[3]) throw new Error("Pass a draft directory with documents, briefs and two blind reviews");
  freeze(path.resolve(process.argv[3]));
} else if (command === "validate") {
  const x = validate();
  process.stdout.write(`Holdout V2 valid: ${x.documents.length} documents; ${x.manifest.files["documents.json"]}\n`);
} else if (command === "audit") audit(process.argv[3]);
else throw new Error("Usage: holdout-v2.ts freeze <draft-dir> | validate | audit <predeclared-manifest-sha256>");
