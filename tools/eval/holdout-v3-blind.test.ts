import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { constructBlindPackets, blindItemSchema, buildBlindPackets, createCustodianSeed, exclusiveBlindWrite } from "./holdout-v3-blind";
import { verifyV3Integrity, V3_MANIFEST_SHA256 } from "./holdout-v3-runner";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
const seed = "synthetic-private-custodian-seed-for-tests-only";
const frozen = verifyV3Integrity();
const assignment = JSON.parse(readFileSync("data/evaluation/holdout-v3/frozen/assignments.json", "utf8"));
function fixture() {
  const editor = frozen.map((row, i) => ({ id: row.id, data: { text: `Synthetic RAW ${i}`, changes: [] } }));
  const replay = { strategy: "reconstruction-v15", mode: "replay", manifestSha256: V3_MANIFEST_SHA256, caseCount: 119, technicalFailures: [], contractErrors: [], rows: frozen.map((row, i) => ({ id: row.id, source: row.source, objective: row.objective, candidate: editor[i].data.text, final: i === 0 ? editor[i].data.text : `Synthetic FINAL ${i}`, technicalFailures: [], creatorId: "private creator", blindLabel: "private label", trace: { private: true } })) };
  return { editor, replay };
}
describe("offline V3 blind RAW versus FINAL packets", () => {
  it("uses only the reviewer allowlist and routes all frozen second IDs before judgment", () => {
    const f = fixture(), result = constructBlindPackets(frozen, assignment, f.replay, f.editor, seed);
    expect(result.primary).toHaveLength(119); expect(result.second).toHaveLength(60);
    for (const packet of result.primary) {
      expect(Object.keys(packet)).toEqual(["itemId", "source", "objective", "outputA", "outputB"]);
      expect(blindItemSchema.safeParse(packet).success).toBe(true);
      expect(packet.itemId).not.toContain("V3-");
    }
    expect(result.custodian.filter(row => row.secondReview).map(row => row.caseId).sort()).toEqual(assignment.outputSecondIds);
    expect(JSON.stringify(result.primary)).not.toMatch(/private creator|private label|technicalFailures|strategy|trace/);
    expect(result.commitments.identicalCount).toBe(1);
    const identical = result.primary.find(row => row.outputA === row.outputB); expect(identical).toBeDefined();
  });
  it("has deterministic per-case orientation, opaque ordering and exact byte commitments", () => {
    const f = fixture(), result = constructBlindPackets(frozen, assignment, f.replay, f.editor, seed);
    const reversed = constructBlindPackets([...frozen].reverse(), assignment, { ...f.replay, rows: [...f.replay.rows].reverse() }, [...f.editor].reverse(), seed);
    expect(reversed.primary).toEqual(result.primary); expect(reversed.second).toEqual(result.second); expect(reversed.custodian).toEqual(result.custodian);
    expect(new Set(result.custodian.map(row => row.outputA))).toEqual(new Set(["RAW", "FINAL"]));
    const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value, null, 2) + "\n").digest("hex");
    expect(result.commitments.primarySha256).toBe(hash(result.primary)); expect(result.commitments.secondSha256).toBe(hash(result.second)); expect(result.commitments.custodianSha256).toBe(hash(result.custodian));
  });
  it("rejects missing, extra, duplicate, and substituted replay or RAW inventory", () => {
    const f = fixture();
    for (const rows of [f.replay.rows.slice(1), [...f.replay.rows, f.replay.rows[0]], f.replay.rows.map((row, i) => i === 1 ? f.replay.rows[0] : row), f.replay.rows.map((row, i) => i === 0 ? { ...row, id: "EXTRA" } : row)]) expect(() => constructBlindPackets(frozen, assignment, { ...f.replay, rows }, f.editor, seed)).toThrow();
    for (const editor of [f.editor.slice(1), [...f.editor, f.editor[0]], f.editor.map((row, i) => i === 0 ? { ...row, id: "EXTRA" } : row)]) expect(() => constructBlindPackets(frozen, assignment, f.replay, editor, seed)).toThrow();
    expect(() => constructBlindPackets(frozen, assignment, f.replay, f.editor.map((row, i) => i === 0 ? { ...row, data: { text: "Substituted", changes: [] } } : row), seed)).toThrow("RAW");
  });
  it("rejects altered source/objective, technical failures and contract errors", () => {
    const f = fixture();
    for (const field of ["source", "objective"] as const) expect(() => constructBlindPackets(frozen, assignment, { ...f.replay, rows: f.replay.rows.map((row, i) => i === 0 ? { ...row, [field]: row[field] + "changed" } : row) }, f.editor, seed)).toThrow("frozen");
    expect(() => constructBlindPackets(frozen, assignment, { ...f.replay, technicalFailures: [{ id: frozen[0].id }] }, f.editor, seed)).toThrow();
    expect(() => constructBlindPackets(frozen, assignment, { ...f.replay, contractErrors: ["missing"] }, f.editor, seed)).toThrow();
    expect(() => constructBlindPackets(frozen, assignment, { ...f.replay, rows: f.replay.rows.map((row, i) => i === 0 ? { ...row, technicalFailures: [{ kind: "failure" }] } : row) }, f.editor, seed)).toThrow();
  });
  it("rejects invalid second-review selections and weak seeds", () => {
    const f = fixture();
    for (const outputSecondIds of [assignment.outputSecondIds.slice(1), Array(60).fill(frozen[0].id), [...assignment.outputSecondIds.slice(1), "EXTRA"]]) expect(() => constructBlindPackets(frozen, { ...assignment, outputSecondIds }, f.replay, f.editor, seed)).toThrow();
    expect(() => constructBlindPackets(frozen, assignment, f.replay, f.editor, "weak")).toThrow("seed");
  });
  it("production generates fresh 32-byte secrets and rejects predictable seed overrides", () => {
    const a = createCustodianSeed(), b = createCustodianSeed();
    expect(a).toMatch(/^[a-f0-9]{64}$/); expect(b).toMatch(/^[a-f0-9]{64}$/); expect(a).not.toBe(b);
    expect(() => buildBlindPackets("predictable-public-seed" as never)).toThrow("overrides");
    const old = process.env.V3_BLIND_CUSTODIAN_SEED;
    try { process.env.V3_BLIND_CUSTODIAN_SEED = "predictable-public-seed"; expect(() => buildBlindPackets()).toThrow("overrides"); }
    finally { if (old === undefined) delete process.env.V3_BLIND_CUSTODIAN_SEED; else process.env.V3_BLIND_CUSTODIAN_SEED = old; }
  });
  it("rejects symlink parent components before any packet write", () => {
    const dir = realpathSync(mkdtempSync(resolve(tmpdir(), "v3-blind-path-test-")));
    try {
      const outside = resolve(dir, "outside"), root = resolve(dir, "root"); mkdirSync(outside); mkdirSync(root);
      symlinkSync(outside, resolve(root, "custodian"));
      expect(() => exclusiveBlindWrite(resolve(root, "custodian/mapping.json"), { seed: "private" })).toThrow("symlink");
      expect(existsSync(resolve(outside, "mapping.json"))).toBe(false);
      symlinkSync(root, resolve(dir, "parent-link"));
      expect(() => exclusiveBlindWrite(resolve(dir, "parent-link/packet.json"), [])).toThrow("symlink");
      expect(existsSync(resolve(root, "packet.json"))).toBe(false);
      exclusiveBlindWrite(resolve(root, "safe.json"), { safe: true }); expect(JSON.parse(readFileSync(resolve(root, "safe.json"), "utf8"))).toEqual({ safe: true });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

});
