// Software validation tests only. These values are never experimental receipts.
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { metadataSchema, validateReview, validatePropositionEvidence, classifyArchivedResponse, summarizeAttempts } from "./semantic-discrimination-probe";
const candidate = "A 😀 token.";
const pass = { verdict: "PASS", meaningPreserved: true, objectiveSatisfied: true, voicePreserved: true,
  unsupportedInformation: false, reason: "Software fixture only.", issue: null };
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
test("strict consistent PASS", () => assert.equal(validateReview(candidate, bytes(pass)).verdict, "PASS"));
test("inconsistent PASS fails", () => assert.throws(() => validateReview(candidate, bytes({ ...pass, objectiveSatisfied: false }))));
test("unknown fields fail", () => assert.throws(() => validateReview(candidate, bytes({ ...pass, extra: true }))));
test("invalid UTF-8 fails", () => assert.throws(() => validateReview(candidate, Buffer.from([0xff]))));
test("exact UTF-16 repair span accepted", () => assert.equal(validateReview(candidate, bytes({ ...pass, verdict: "LOCAL_REPAIR", issue: { span: { start: 2, end: 4, text: "😀" }, constraint: "Software fixture only." } })).verdict, "LOCAL_REPAIR"));
test("out-of-bounds and wrong spans fail", () => {
  for (const span of [{ start: 2, end: 3, text: "😀" }, { start: 2, end: 100, text: candidate.slice(2) }])
    assert.throws(() => validateReview(candidate, bytes({ ...pass, verdict: "LOCAL_REPAIR", issue: { span, constraint: "Software fixture only." } })));
});
test("REJECT cannot carry repair span", () => assert.throws(() => validateReview(candidate, bytes({ ...pass, verdict: "REJECT", issue: { span: { start: 0, end: 1, text: "A" }, constraint: "Software fixture only." } }))));
test("metadata does not silently substitute requested model", () => assert.throws(() => metadataSchema.parse({ requestedModel: "gpt-6-astra" })));

// These toy strings test quote validation, not meaning discrimination.
const toyEvidence = { proposition: "Toy proposition", sourceQuote: "alpha", candidateQuote: "beta", uncertainty: null };
test("evidence quotes bind to both texts", () => assert.deepEqual(validatePropositionEvidence("alpha", "beta", JSON.stringify(toyEvidence)), toyEvidence));
test("nonliteral quotations fail", () => {
  assert.throws(() => validatePropositionEvidence("alpha", "beta", JSON.stringify({ ...toyEvidence, sourceQuote: "gamma" })));
  assert.throws(() => validatePropositionEvidence("alpha", "beta", JSON.stringify({ ...toyEvidence, candidateQuote: "gamma" })));
});
test("claimed absence and explicit uncertainty remain evidence to audit", () => assert.equal(validatePropositionEvidence("alpha", "beta", JSON.stringify({ ...toyEvidence, candidateQuote: null, uncertainty: "Equivalence is not established" })).uncertainty, "Equivalence is not established"));
test("missing uncertainty and additional evidence fields fail", () => {
  const { uncertainty: omitted, ...missing } = toyEvidence;
  assert.equal(omitted, null);
  assert.throws(() => validatePropositionEvidence("alpha", "beta", JSON.stringify(missing)));
  assert.throws(() => validatePropositionEvidence("alpha", "beta", JSON.stringify({ ...toyEvidence, verdict: "PASS" })));
});

// This is an audit of existing bytes, not a newly generated response or judgment.
test("SP-008 first attempt stays INVALID and byte-identical", () => {
  const base = ".evaluations/semantic-discrimination-probe-v1/";
  const rawPath = base + "imports/SP-008/response.raw";
  const statusPath = base + "imports/SP-008/validation.json";
  const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
  const raw = readFileSync(rawPath), statusBytes = readFileSync(statusPath);
  const status = JSON.parse(statusBytes.toString("utf8"));
  const request = JSON.parse(readFileSync(base + "requests/SP-008/request.json", "utf8"));
  const authorization = JSON.parse(readFileSync("data/experiments/semantic-discrimination-probe-v1/continuation-authorization.json", "utf8"));
  assert.equal(classifyArchivedResponse(request.payload.candidate, raw, status).validity, "INVALID");
  assert.equal(status.status, "invalid");
  assert.equal(digest(readFileSync(rawPath)), authorization.firstResponseSha256);
  assert.equal(digest(readFileSync(statusPath)), authorization.firstValidationSha256);
});
test("valid retry never changes first-attempt counts", () => {
  const first = Array.from({ length: 12 }, (_, i) => ({ id: `SP-${String(i + 1).padStart(3, "0")}`, validity: i < 7 ? "VALID" : i === 7 ? "INVALID" : "PENDING" }));
  const snapshot = JSON.stringify(first);
  const result = summarizeAttempts(first, { id: "SP-008", validity: "VALID" });
  assert.deepEqual(result.firstAttempts, { valid: 7, invalid: 1, pending: 4 });
  assert.equal(result.availableValidResponses, 8);
  assert.equal(result.available.find(v => v.id === "SP-008")?.attemptKind, "RETRY");
  assert.equal(JSON.stringify(first), snapshot);
});
test("invalid retry never supplies an available valid response", () => {
  const result = summarizeAttempts([{ id: "SP-008", validity: "INVALID" }], { id: "SP-008", validity: "INVALID" });
  assert.equal(result.availableValidResponses, 0);
  assert.equal(result.firstAttempts.invalid, 1);
  assert.equal(result.retries.invalid, 1);
});
test("INVALID cannot be silently upgraded to accepted", () => assert.throws(() => classifyArchivedResponse(candidate, bytes(pass), { status: "invalid", error: "Error: Invalid UTF-16 repair span" })));
test("an accepted archive with a malformed span still fails", () => assert.throws(() => classifyArchivedResponse(candidate, bytes({ ...pass, verdict: "LOCAL_REPAIR", issue: { span: { start: 0, end: 1, text: "z" }, constraint: "Software fixture only." } }), { status: "accepted" })));
test("evidence-format failures remain invalid even when the verdict schema is valid", () => {
  const raw = bytes(pass);
  const check = () => { throw new Error("Source quotation is not exact"); };
  assert.equal(classifyArchivedResponse(candidate, raw, { status: "invalid", error: "Error: Source quotation is not exact" }, check).validity, "INVALID");
});
