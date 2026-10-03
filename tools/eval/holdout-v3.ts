/** Pre-generation blind holdout protocol. No engine, model, or provider imports. */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const base = path.resolve("data/evaluation/holdout-v3");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const read = (folder: string, name: string) => readFileSync(path.join(folder, name));
const parse = (folder: string, name: string): unknown => JSON.parse(read(folder, name).toString("utf8"));
const write = (folder: string, name: string, value: unknown) => writeFileSync(path.join(folder, name), json(value), { flag: "wx" });
const idSchema = z.string().regex(/^V3-\d{3}$/u);
const nonempty = z.string().trim().min(1);
const caseSchema = z.object({
  id: idSchema, creatorId: z.enum(["creator-01", "creator-02", "creator-03", "creator-04", "creator-05"]),
  source: z.string().refine((s) => s.trim().length > 0), objective: z.string().refine((s) => s.trim().length > 0),
  genre: nonempty, lengthBand: z.enum(["VERY_SHORT", "SHORT", "MEDIUM", "LONGER"]),
  provenance: z.literal("synthetic-original"), categoryTags: z.array(nonempty).min(1),
}).strict();
const reviewSchema = z.object({
  id: idSchema, reviewerId: z.enum(["R1A", "R1B", "R2A", "R2B"]),
  expectedEditScope: z.enum(["LEAVE_ALONE", "LOCAL_EDIT", "DISTRIBUTED_LIGHT_EDIT", "SUBSTANTIVE_RECONSTRUCTION", "INSUFFICIENT_INFORMATION", "AMBIGUOUS"]),
  authorizedFactualChanges: z.array(z.string()), preservedFacts: z.array(z.string()), intentionalVoice: z.array(z.string()),
  missingInformationPreventsFulfillment: z.boolean().nullable(), notes: z.string(),
}).strict();
const salts = { preSecond: "whodunnit-v3-pre-review-second-v1", outputSecond: "whodunnit-v3-output-review-second-v1", primary: "whodunnit-v3-primary-reviewer-v1", second: "whodunnit-v3-second-reviewer-v1" };
const exclusion = { id: "V3-107", reason: "Pre-freeze safety exclusion: source directs disabling kiln exhaust during an overnight kiln cycle; not suitable as a writing-only holdout without equipment-specific safety validation." };
const retainedIds = Array.from({ length: 120 }, (_, i) => `V3-${String(i + 1).padStart(3, "0")}`).filter((id) => id !== exclusion.id);
function exactIds(actual: string[], expected: string[], context: string) {
  if (actual.length !== expected.length || new Set(actual).size !== actual.length || [...actual].sort().join() !== [...expected].sort().join()) throw new Error(`${context}: duplicate, missing, or unexpected IDs`);
}
function validateCases(value: unknown) {
  const cases = z.array(caseSchema).parse(value);
  exactIds(cases.map((c) => c.id), retainedIds, "Retained cases");
  return cases;
}
function ranked(ids: string[], salt: string) {
  return [...ids].sort((a, b) => hash(`${salt}\0${a}`).localeCompare(hash(`${salt}\0${b}`)) || a.localeCompare(b));
}
function assignments() {
  const primaryIds = ranked(retainedIds, salts.primary);
  const secondIds = ranked(retainedIds, salts.preSecond).slice(0, 72);
  const secondReviewerIds = ranked(secondIds, salts.second);
  return {
    version: "3.0.0", exclusion, salts,
    algorithm: {
      version: "sha256-id-rank-v1",
      digest: "SHA-256 over UTF-8 salt + U+0000 + case ID; lowercase hexadecimal",
      ranking: "Ascending hexadecimal digest; ascending case ID breaks ties",
      preSecond: "First 72 retained IDs ranked using preSecond salt",
      outputSecond: "First 60 retained IDs ranked using independent outputSecond salt",
      primaryReviewer: "All retained IDs ranked using primary salt; zero-based even rank R1A, odd rank R1B",
      secondReviewer: "Selected 72 preSecond IDs ranked using second salt; zero-based even rank R2A, odd rank R2B",
      serialization: "Case-ID ascending mapping keys and outputSecondIds; packets ordered by ascending case ID",
    },
    primary: Object.fromEntries(retainedIds.map((id) => [id, primaryIds.indexOf(id) % 2 === 0 ? "R1A" : "R1B"])),
    second: Object.fromEntries([...secondIds].sort().map((id) => [id, secondReviewerIds.indexOf(id) % 2 === 0 ? "R2A" : "R2B"])),
    outputSecondIds: ranked(retainedIds, salts.outputSecond).slice(0, 60).sort(),
  };
}
function validateAssignments(value: unknown) {
  if (json(value) !== json(assignments())) throw new Error("Assignments differ from the deterministic preregistered assignment");
  return assignments();
}
function atomicDirectory(target: string, action: (temporary: string) => void) {
  if (existsSync(target)) throw new Error(`Refusing overwrite: ${target}`);
  mkdirSync(path.dirname(target), { recursive: true });
  const temporary = `${target}.preparing`;
  mkdirSync(temporary); // A leftover directory requires explicit inspection/removal.
  try { action(temporary); renameSync(temporary, target); }
  catch (error) { rmSync(temporary, { recursive: true, force: true }); throw error; }
}
function prepare(creation: string, target: string) {
  const cases = Array.from({ length: 5 }, (_, i) => {
    const creatorId = `creator-0${i + 1}`;
    const rows = z.array(caseSchema).parse(parse(creation, `${creatorId}.json`));
    if (rows.some((c) => c.creatorId !== creatorId)) throw new Error(`Creator metadata mismatch: ${creatorId}`);
    return rows;
  }).flat();
  exactIds(cases.map((c) => c.id), [...retainedIds, exclusion.id], "Creation cases");
  const retained = validateCases(cases.filter((c) => c.id !== exclusion.id)).sort((a, b) => a.id.localeCompare(b.id));
  const assignment = assignments();
  atomicDirectory(target, (temp) => {
    write(temp, "cases.json", retained);
    write(temp, "assignments.json", assignment);
    write(temp, "exclusions.json", [exclusion]);
    for (const reviewer of ["R1A", "R1B", "R2A", "R2B"]) {
      const mapping = reviewer.startsWith("R1") ? assignment.primary : assignment.second;
      write(temp, `packet-${reviewer}.json`, retained.filter((c) => mapping[c.id] === reviewer).map(({ id, source, objective }) => ({ id, source, objective })));
    }
  });
  process.stdout.write(`Prepared 119 cases; 119 primary, 72 second pre-reviews; 60 output-second IDs.\n${target}\n`);
}
function validateReviews(folder: string, assignment: ReturnType<typeof assignments>) {
  const all = ["R1A", "R1B", "R2A", "R2B"].flatMap((reviewer) => {
    const rows = z.array(reviewSchema).parse(parse(folder, `review-${reviewer}.json`));
    const mapping = reviewer.startsWith("R1") ? assignment.primary : assignment.second;
    exactIds(rows.map((r) => r.id), Object.keys(mapping).filter((id) => mapping[id] === reviewer), reviewer);
    if (rows.some((r) => r.reviewerId !== reviewer)) throw new Error(`Reviewer mismatch: ${reviewer}`);
    return rows;
  });
  return all;
}
const frozenFiles = ["cases.json", "assignments.json", "exclusions.json", "labels.json", "review-R1A.json", "review-R1B.json", "review-R2A.json", "review-R2B.json"];
function freeze(prepared: string, reviews: string, target: string) {
  const cases = validateCases(parse(prepared, "cases.json"));
  const assignment = validateAssignments(parse(prepared, "assignments.json"));
  if (json(parse(prepared, "exclusions.json")) !== json([exclusion])) throw new Error("Exclusion mismatch");
  for (const reviewer of ["R1A", "R1B", "R2A", "R2B"]) {
    const mapping = reviewer.startsWith("R1") ? assignment.primary : assignment.second;
    const expected = [...cases].sort((a, b) => a.id.localeCompare(b.id)).filter((c) => mapping[c.id] === reviewer).map(({ id, source, objective }) => ({ id, source, objective }));
    if (json(parse(prepared, `packet-${reviewer}.json`)) !== json(expected)) throw new Error(`Blind packet differs from retained cases: ${reviewer}`);
  }
  const labels = validateReviews(reviews, assignment);
  const bytes: Record<string, Buffer> = {
    "cases.json": read(prepared, "cases.json"), "assignments.json": read(prepared, "assignments.json"), "exclusions.json": read(prepared, "exclusions.json"), "labels.json": Buffer.from(json(labels)),
  };
  for (const reviewer of ["R1A", "R1B", "R2A", "R2B"]) bytes[`review-${reviewer}.json`] = read(reviews, `review-${reviewer}.json`);
  const manifest = {
    version: "3.0.0", marker: "FROZEN_HOLDOUT_DO_NOT_TUNE", frozenBeforeGeneration: true,
    caseCount: 119, primaryReviewCount: 119, secondReviewCount: 72, outputSecondCount: 60,
    files: Object.fromEntries(frozenFiles.map((file) => [file, hash(bytes[file])])),
    cases: Object.fromEntries(cases.map((c) => [c.id, { sourceSha256: hash(c.source), objectiveSha256: hash(c.objective) }])),
  };
  atomicDirectory(target, (temp) => {
    for (const file of frozenFiles) writeFileSync(path.join(temp, file), bytes[file], { flag: "wx" });
    write(temp, "manifest.json", manifest);
  });
  process.stdout.write(`Frozen 119 cases. Record this external manifest SHA-256 for integrity:\n${hash(json(manifest))}\n`);
}
function integrity(target: string, expectedHash: string | undefined) {
  if (!expectedHash || !/^[a-f0-9]{64}$/u.test(expectedHash)) throw new Error("Integrity requires the externally recorded freeze manifest SHA-256");
  if (hash(read(target, "manifest.json")) !== expectedHash) throw new Error("Manifest differs from external freeze hash");
  exactIds(readdirSync(target), [...frozenFiles, "manifest.json"], "Frozen file inventory");
  const manifestSchema = z.object({
    version: z.literal("3.0.0"), marker: z.literal("FROZEN_HOLDOUT_DO_NOT_TUNE"), frozenBeforeGeneration: z.literal(true),
    caseCount: z.literal(119), primaryReviewCount: z.literal(119), secondReviewCount: z.literal(72), outputSecondCount: z.literal(60),
    files: z.record(z.string(), z.string().regex(/^[a-f0-9]{64}$/u)),
    cases: z.record(idSchema, z.object({ sourceSha256: z.string().regex(/^[a-f0-9]{64}$/u), objectiveSha256: z.string().regex(/^[a-f0-9]{64}$/u) }).strict()),
  }).strict();
  const manifest = manifestSchema.parse(parse(target, "manifest.json"));
  exactIds(Object.keys(manifest.files), frozenFiles, "Manifest files");
  for (const file of frozenFiles) if (hash(read(target, file)) !== manifest.files[file]) throw new Error(`Post-freeze byte change: ${file}`);
  const cases = validateCases(parse(target, "cases.json"));
  const assignment = validateAssignments(parse(target, "assignments.json"));
  if (json(parse(target, "exclusions.json")) !== json([exclusion])) throw new Error("Exclusion mismatch");
  const labels = validateReviews(target, assignment);
  if (json(parse(target, "labels.json")) !== json(labels)) throw new Error("Combined labels differ from reviewer files");
  exactIds(Object.keys(manifest.cases), retainedIds, "Case fingerprints");
  for (const c of cases) if (hash(c.source) !== manifest.cases[c.id].sourceSha256 || hash(c.objective) !== manifest.cases[c.id].objectiveSha256) throw new Error(`Case fingerprint mismatch: ${c.id}`);
  process.stdout.write(`Integrity verified: 119 cases; complete 119 primary and 72 second labels; 60 output-second IDs; exact frozen bytes.\n`);
}
const [command, first, second, third] = process.argv.slice(2);
if (command === "prepare") prepare(path.resolve(first ?? path.join(base, "creation")), path.resolve(second ?? path.join(base, "pre-review")));
else if (command === "freeze") freeze(path.resolve(first ?? path.join(base, "pre-review")), path.resolve(second ?? path.join(base, "pre-review")), path.resolve(third ?? path.join(base, "frozen")));
else if (command === "integrity") integrity(path.resolve(first ?? path.join(base, "frozen")), second);
else throw new Error("Usage: node --import tsx tools/eval/holdout-v3.ts prepare [creation-dir] [prepared-dir] | freeze [prepared-dir] [reviews-dir] [frozen-dir] | integrity <frozen-dir> <external-manifest-sha256>");
