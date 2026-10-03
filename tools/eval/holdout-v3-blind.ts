/** Offline RAW-versus-FINAL blind packets; no provider or model invocation. */
import { createHash, createHmac, randomBytes } from "node:crypto";
import { closeSync, constants, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, parse, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { candidateSchema } from "@/lib/ai/schemas";
import { prepareRunDirectory, responseMap, verifyV3Integrity, V3_MANIFEST_SHA256 } from "./holdout-v3-runner";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const serialize = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const rowSchema = z.object({ id: z.string(), source: z.string(), objective: z.string(), candidate: z.string().min(1).max(60_000), final: z.string().min(1).max(60_000), technicalFailures: z.array(z.unknown()).length(0) }).passthrough();
const replaySchema = z.object({ strategy: z.literal("reconstruction-v15"), mode: z.literal("replay"), manifestSha256: z.literal(V3_MANIFEST_SHA256), caseCount: z.literal(119), technicalFailures: z.array(z.unknown()).length(0), contractErrors: z.array(z.unknown()).length(0), rows: z.array(rowSchema).length(119) }).strict();
export const blindItemSchema = z.object({ itemId: z.string().regex(/^blind-[a-f0-9]{32}$/), source: z.string(), objective: z.string(), outputA: z.string(), outputB: z.string() }).strict();
type FrozenCase = { id: string; source: string; objective: string };
export function constructBlindPackets(frozen: readonly FrozenCase[], assignment: unknown, replay: unknown, editorResults: unknown, seed: string) {
  if (seed.length < 32) throw new Error("custodian seed must contain at least 32 characters");
  if (frozen.length !== 119 || new Set(frozen.map(row => row.id)).size !== 119) throw new Error("frozen inventory must contain 119 unique cases");
  const ids = new Set(frozen.map(row => row.id));
  const routing = z.object({ version: z.literal("3.0.0"), outputSecondIds: z.array(z.string()).length(60) }).passthrough().parse(assignment);
  if (new Set(routing.outputSecondIds).size !== 60 || routing.outputSecondIds.some(id => !ids.has(id))) throw new Error("invalid frozen second-review inventory");
  const parsed = replaySchema.parse(replay);
  if (new Set(parsed.rows.map(row => row.id)).size !== 119 || parsed.rows.some(row => !ids.has(row.id))) throw new Error("replay inventory differs from frozen inventory");
  const saved = responseMap(editorResults, ids, "editor");
  if (saved.size !== 119) throw new Error("complete saved editor inventory required");
  const rows = new Map(parsed.rows.map(row => [row.id, row]));
  const keyed = (scope: string, id: string) => createHmac("sha256", seed).update(scope + "\0" + id).digest("hex");
  const custodian = [];
  const primary = [];
  for (const item of [...frozen].sort((a, b) => a.id.localeCompare(b.id))) {
    const row = rows.get(item.id)!;
    if (row.source !== item.source || row.objective !== item.objective) throw new Error("replay source/objective differs from frozen bytes");
    const raw = candidateSchema.parse(saved.get(item.id));
    if (row.candidate !== raw.text) throw new Error("replay candidate differs from saved RAW response");
    const rawIsA = Number.parseInt(keyed("orientation-v1", item.id).slice(0, 2), 16) % 2 === 0;
    const itemId = "blind-" + keyed("opaque-id-v1", item.id).slice(0, 32);
    const packet = blindItemSchema.parse({ itemId, source: item.source, objective: item.objective, outputA: rawIsA ? raw.text : row.final, outputB: rawIsA ? row.final : raw.text });
    primary.push(packet);
    custodian.push({ itemId, caseId: item.id, outputA: rawIsA ? "RAW" : "FINAL", outputB: rawIsA ? "FINAL" : "RAW", identical: raw.text === row.final, rawSha256: hash(raw.text), finalSha256: hash(row.final), secondReview: routing.outputSecondIds.includes(item.id) });
  }
  // Opaque ordering prevents frozen sequential IDs from revealing the mapping.
  primary.sort((a, b) => a.itemId.localeCompare(b.itemId));
  if (new Set(primary.map(row => row.itemId)).size !== 119) throw new Error("opaque ID collision");
  const secondIds = new Set(custodian.filter(row => row.secondReview).map(row => row.itemId));
  const second = primary.filter(row => secondIds.has(row.itemId));
  return { primary, second, custodian, commitments: { protocol: "v3-raw-final-blind-v1", manifestSha256: V3_MANIFEST_SHA256, seedSha256: hash(seed), primarySha256: hash(serialize(primary)), secondSha256: hash(serialize(second)), custodianSha256: hash(serialize(custodian)), replaySha256: hash(serialize(replay)), editorResultsSha256: hash(serialize(editorResults)), primaryCount: 119, secondCount: 60, identicalCount: custodian.filter(row => row.identical).length } };
}
/** Reject every existing symlink component before reading or writing artifacts.
 * These checks assume no hostile concurrent process running as this same user.
 */
export function assertNoSymlinkComponents(path: string) {
  const absolute = resolve(path), root = parse(absolute).root;
  let current = root;
  for (const component of absolute.slice(root.length).split(sep).filter(Boolean)) {
    current = resolve(current, component);
    const stat = lstatSync(current, { throwIfNoEntry: false });
    if (!stat) continue;
    if (stat.isSymbolicLink()) throw new Error("symlink artifact path component rejected");
    if (current !== absolute && !stat.isDirectory()) throw new Error("non-directory artifact path component rejected");
  }
}
export function createCustodianSeed() { return randomBytes(32).toString("hex"); }
function safeRead(path: string) {
  assertNoSymlinkComponents(path);
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { if (!fstatSync(fd).isFile()) throw new Error("unsafe input file"); return readFileSync(fd, "utf8"); } finally { closeSync(fd); }
}
export function exclusiveBlindWrite(path: string, value: unknown) {
  assertNoSymlinkComponents(path);
  const parent = openSync(dirname(path), constants.O_RDONLY | constants.O_DIRECTORY | constants.O_NOFOLLOW);
  let fd: number | undefined;
  try {
    const before = fstatSync(parent);
    const sameParent = () => {
      assertNoSymlinkComponents(path);
      const now = lstatSync(dirname(path));
      if (now.dev !== before.dev || now.ino !== before.ino) throw new Error("artifact parent changed during write");
    };
    sameParent();
    fd = openSync(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    if (!fstatSync(fd).isFile()) throw new Error("unsafe output file");
    sameParent();
    writeFileSync(fd, serialize(value)); fsyncSync(fd); fsyncSync(parent);
    sameParent();
  } finally { if (fd !== undefined) closeSync(fd); closeSync(parent); }
}
export function buildBlindPackets(...unexpectedSeedArguments: never[]) {
  if (unexpectedSeedArguments.length || process.env.V3_BLIND_CUSTODIAN_SEED !== undefined) throw new Error("production blind seed overrides are forbidden");
  const seed = createCustodianSeed();
  const frozen = verifyV3Integrity();
  const run = prepareRunDirectory(resolve("data/evaluation/holdout-v3/run"));
  const assignmentBytes = safeRead(resolve("data/evaluation/holdout-v3/frozen/assignments.json"));
  const replayBytes = safeRead(resolve(run, "replay.json"));
  const editorBytes = safeRead(resolve(run, "editor-results.json"));
  const packets = constructBlindPackets(frozen, JSON.parse(assignmentBytes), JSON.parse(replayBytes), JSON.parse(editorBytes), seed);
  // All checks finish before any real packet is created. Exclusive root prevents replacement/reorientation.
  const destination = resolve(run, "blind-output-v1");
  if (lstatSync(destination, { throwIfNoEntry: false })) throw new Error("blind packet destination already exists");
  assertNoSymlinkComponents(destination);
  mkdirSync(destination, { mode: 0o700 });
  for (const name of ["primary", "second", "custodian"]) {
    const path = resolve(destination, name); assertNoSymlinkComponents(path); mkdirSync(path, { mode: 0o700 });
  }
  exclusiveBlindWrite(resolve(destination, "primary/packet.json"), packets.primary);
  exclusiveBlindWrite(resolve(destination, "second/packet.json"), packets.second);
  exclusiveBlindWrite(resolve(destination, "custodian/mapping.json"), packets.custodian);
  exclusiveBlindWrite(resolve(destination, "custodian/commitments.json"), { custodianSeed: seed, ...packets.commitments, replayFileSha256: hash(replayBytes), editorResultsFileSha256: hash(editorBytes), assignmentsFileSha256: hash(assignmentBytes) });
  return { primaryCount: packets.primary.length, secondCount: packets.second.length, identicalCount: packets.commitments.identicalCount };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv[2] !== "build") throw new Error("usage: node --import tsx tools/eval/holdout-v3-blind.ts build");
  try { process.stdout.write(JSON.stringify(buildBlindPackets()) + "\n"); }
  catch { process.stderr.write("Blind packet construction failed; no reviewer packet should be used without valid commitments.\n"); process.exitCode = 1; }
}
