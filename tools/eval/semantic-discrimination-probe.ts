/** File-only probe. Never invokes a model, repairer, editor, or Candidate D. */
import { createHash, randomInt } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { getPrompt } from "../../src/lib/prompts";
import { candidateReviewSchemaV10 } from "../../src/lib/reconstruction/verified-reconstruction";

const root = process.cwd();
const run = join(root, ".evaluations/semantic-discrimination-probe-v1");
const controlsPath = join(root, "data/experiments/semantic-discrimination-probe-v1/controls.json");
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const json = (value: unknown) => JSON.stringify(value, null, 2) + "\n";
const decode = (bytes: Buffer) => new TextDecoder("utf-8", { fatal: true }).decode(bytes);
const read = (path: string) => JSON.parse(decode(readFileSync(path)));
const write = (path: string, value: string | Buffer) => writeFileSync(path, value, { flag: "wx", mode: 0o600 });
function requireThat(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const controlsSchema = z.object({ cases: z.array(z.object({
  caseId: z.enum(["EI-003", "EI-004", "EI-005"]), source: z.string(), objective: z.string(),
  capturedResponsePath: z.string(), capturedRawSha256: z.string(), originalTextSha256: z.string(),
  candidates: z.array(z.object({ kind: z.string(), candidate: z.string(), expectedOriginalAcceptance: z.boolean(),
    targetProposition: z.string().nullable(), sourceEvidence: z.string().nullable(),
    mutation: z.object({ old: z.string(), new: z.string() }).nullable(),
  })).length(4),
})).length(3) });
function validateControls() {
  const controls = controlsSchema.parse(read(controlsPath));
  const holdout = read(join(root, ".evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1/holdout.json"));
  const originalCases = Array.isArray(holdout) ? holdout : holdout.cases;
  requireThat(new Set(controls.cases.map(c => c.caseId)).size === 3, "Duplicate cases");
  for (const c of controls.cases) {
    const frozen = originalCases.find((v: { id?: string; caseId?: string }) => (v.id ?? v.caseId) === c.caseId);
    requireThat(frozen && frozen.source === c.source && frozen.objective === c.objective, "Holdout drift");
    const raw = readFileSync(join(root, c.capturedResponsePath));
    const result = read(join(root, c.capturedResponsePath, "..", "result.json"));
    const original = c.candidates[0];
    requireThat(result.status === "accepted" && result.rawSha256 === hash(raw) && hash(raw) === c.capturedRawSha256, "Captured response drift");
    requireThat(original.kind === "ORIGINAL" && original.expectedOriginalAcceptance && !original.mutation, "Invalid original");
    requireThat(result.output.data.text === original.candidate && JSON.parse(decode(raw)).text === original.candidate && hash(original.candidate) === c.originalTextSha256, "Original text drift");
    requireThat(new Set(c.candidates.map(v => v.candidate)).size === 4, "Duplicate candidates");
    requireThat(c.candidates[1].kind === "CHANGE" && c.candidates[2].kind === "DELETE", "Missing control types");
    for (const v of c.candidates.slice(1)) {
      requireThat(!v.expectedOriginalAcceptance && v.mutation && v.targetProposition && v.sourceEvidence && c.source.includes(v.sourceEvidence), "Invalid control evidence");
      requireThat(v.mutation.old.length > 0 && original.candidate.split(v.mutation.old).length === 2, "Mutation must occur exactly once");
      requireThat(original.candidate.replace(v.mutation.old, v.mutation.new) === v.candidate, "Control changed more than its recorded mutation");
    }
  }
  return controls;
}
const authorizationPath = join(root, "data/experiments/semantic-discrimination-probe-v1/continuation-authorization.json");
const authorizationSha256 = "ad06403b2a38c23e178fd7b8ad11abc6a79cf7e4b358e268cb5e3ed5c8781850";
function validateContinuation() {
  const bytes = readFileSync(authorizationPath);
  requireThat(hash(bytes) === authorizationSha256, "Continuation authorization drift");
  const authorization = JSON.parse(decode(bytes));
  for (const [path, expected] of Object.entries(authorization.originalFiles)) requireThat(hash(readFileSync(join(run, path))) === expected, `Original evidence drift: ${path}`);
  requireThat(hash(readFileSync(join(root, "data/experiments/semantic-discrimination-probe-v1/evidence-instructions.txt"))) === authorization.evidenceInstructionSha256, "Supplement drift");
  requireThat(read(join(run, "imports/SP-008/validation.json")).status === "invalid", "SP-008 first attempt must remain INVALID");
  return authorization;
}
const retrySchema = z.object({ requestId: z.literal("SP-008"), ordinal: z.literal(1),
  firstResponseSha256: z.string().regex(/^[a-f0-9]{64}$/), firstValidationSha256: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export const metadataSchema = z.object({
  requestSha256: z.string().regex(/^[a-f0-9]{64}$/), promptSha256: z.string().regex(/^[a-f0-9]{64}$/),
  responseSha256: z.string().regex(/^[a-f0-9]{64}$/), requestedModel: z.literal("gpt-6.1-sol"),
  reportedModel: z.string().min(1).nullable(), identityEvidence: z.string().min(8),
  authenticatedExecutionPath: z.string().min(8), operator: z.string().min(1),
  configuration: z.object({ reasoningEffort: z.string().nullable(), maxOutputTokens: z.number().int().positive().nullable(),
    tools: z.boolean().nullable(), sessionMemory: z.boolean().nullable() }).strict(),
  tokens: z.object({ input: z.number().int().nonnegative().nullable(), output: z.number().int().nonnegative().nullable(), reasoning: z.number().int().nonnegative().nullable() }).strict(),
  latencyMs: z.number().nonnegative().nullable(), costUsd: z.number().nonnegative().nullable(),
  requestId: z.string().nullable(), limitations: z.string().min(8),
  retry: retrySchema.optional(),
  execution: z.object({
    captureDirectory: z.string().regex(/^captures\/SP-\d{3}\/[a-zA-Z0-9-]+$/),
    profile: z.literal("codex3"), cliVersion: z.string().min(1), reasoningEffort: z.literal("high"),
    evidenceInstructionSha256: z.string().regex(/^[a-f0-9]{64}$/),
    effectivePromptSha256: z.string().regex(/^[a-f0-9]{64}$/),
    eventsSha256: z.string().regex(/^[a-f0-9]{64}$/), provenanceSha256: z.string().regex(/^[a-f0-9]{64}$/),
  }).strict().optional(),
}).strict();
export function validateReview(candidate: string, raw: Buffer) {
  const review = candidateReviewSchemaV10.parse(JSON.parse(decode(raw)));
  if (review.verdict === "PASS") requireThat(review.issue === null && review.meaningPreserved && review.objectiveSatisfied && review.voicePreserved && !review.unsupportedInformation, "Inconsistent PASS");
  else if (review.verdict === "REJECT") requireThat(review.issue === null, "REJECT must have no repair span");
  else {
    const span = review.issue?.span;
    requireThat(span && span.start < span.end && span.end <= candidate.length && candidate.slice(span.start, span.end) === span.text, "Invalid UTF-16 repair span");
  }
  return review;
}
function request(id: string) {
  requireThat(/^SP-\d{3}$/.test(id), "Invalid blind ID");
  const manifest = read(join(run, "manifest.json"));
  const entry = manifest.requests.find((v: { id: string }) => v.id === id);
  requireThat(entry, "Unknown blind ID");
  const path = join(run, "requests", id);
  const bytes = readFileSync(join(path, "request.json"));
  requireThat(hash(bytes) === entry.requestSha256 && hash(readFileSync(join(path, "prompt.txt"))) === entry.promptSha256, "Request fingerprint drift");
  return { entry, value: JSON.parse(decode(bytes)) };
}
// Evidence formatting checks, never semantic equivalence or absence judgments.
export function validatePropositionEvidence(source: string, candidate: string, reason: string) {
  const evidence = z.object({
    proposition: z.string().trim().min(1), sourceQuote: z.string().min(1),
    candidateQuote: z.string().min(1).nullable(), uncertainty: z.string().trim().min(1).nullable(),
  }).strict().parse(JSON.parse(reason));
  requireThat(source.includes(evidence.sourceQuote), "Source quotation is not exact");
  requireThat(evidence.candidateQuote === null || candidate.includes(evidence.candidateQuote), "Candidate quotation is not exact");
  return evidence;
}
function validateExecution(id: string, req: ReturnType<typeof request>, raw: Buffer, metadata: z.infer<typeof metadataSchema>) {
  const execution = metadata.execution;
  if (!execution) return;
  requireThat(execution.captureDirectory.split("/")[1] === id, "Capture ID mismatch");
  const capture = join(run, execution.captureDirectory);
  const instructions = readFileSync(join(root, "data/experiments/semantic-discrimination-probe-v1/evidence-instructions.txt"));
  const effective = readFileSync(join(capture, "effective.prompt.txt"));
  const basePrompt = readFileSync(join(run, "requests", id, "prompt.txt"));
  requireThat(hash(instructions) === execution.evidenceInstructionSha256 && hash(effective) === execution.effectivePromptSha256 && effective.equals(Buffer.concat([basePrompt, instructions])), "Effective prompt binding mismatch");
  requireThat(hash(readFileSync(join(capture, "events.jsonl"))) === execution.eventsSha256 && hash(readFileSync(join(capture, "provenance.json"))) === execution.provenanceSha256, "Capture provenance fingerprint mismatch");
  requireThat(readFileSync(join(capture, "response.raw")).equals(raw), "Captured response bytes differ");
  const provenance = read(join(capture, "provenance.json"));
  for (const [key, expected] of Object.entries({ id, requestedModel: metadata.requestedModel, reportedModel: metadata.reportedModel,
    profile: execution.profile, cliVersion: execution.cliVersion, reasoningEffort: execution.reasoningEffort,
    requestSha256: req.entry.requestSha256, promptSha256: req.entry.promptSha256, responseSha256: hash(raw),
    effectivePromptSha256: execution.effectivePromptSha256, evidenceInstructionSha256: execution.evidenceInstructionSha256,
    eventsSha256: execution.eventsSha256 })) requireThat(provenance[key] === expected, `Provenance ${key} mismatch`);
  requireThat(provenance.exitCode === 0 && Array.isArray(provenance.failures) && provenance.failures.length === 0, "Failed capture cannot be imported");
  requireThat(typeof provenance.startedAt === "string" && Number.isFinite(Date.parse(provenance.startedAt)) && typeof provenance.completedAt === "string" && Number.isFinite(Date.parse(provenance.completedAt)) && typeof provenance.wallDurationMs === "number" && provenance.wallDurationMs >= 0, "Missing capture timing");
}
function archiveEnvelope(id: string, retry = false) {
  const req = request(id);
  const path = retry ? join(run, "retries", id, "1") : join(run, "imports", id);
  const raw = readFileSync(join(path, "response.raw"));
  const metadataBytes = readFileSync(join(path, "metadata.raw.json"));
  const metadata = metadataSchema.parse(JSON.parse(decode(metadataBytes)));
  requireThat(metadata.requestSha256 === req.entry.requestSha256 && metadata.promptSha256 === req.entry.promptSha256 && metadata.responseSha256 === hash(raw), "Import fingerprint mismatch");
  requireThat(metadata.reportedModel === null || metadata.reportedModel === metadata.requestedModel, "Model substitution");
  if (retry) {
    requireThat(id === "SP-008" && metadata.retry && metadata.execution, "Only an explicit bound SP-008 retry is permitted");
    const authorization = validateContinuation();
    requireThat(metadata.retry.firstResponseSha256 === authorization.firstResponseSha256 && metadata.retry.firstValidationSha256 === authorization.firstValidationSha256, "Retry original-attempt binding mismatch");
    requireThat(metadata.execution.captureDirectory !== authorization.originalCaptureDirectory, "Retry cannot reuse the original capture");
    const reservation = read(join(run, "retry-reservation/SP-008/reservation.json"));
    requireThat(reservation.captureDirectory === metadata.execution.captureDirectory, "Retry reservation mismatch");
    const provenance = read(join(run, metadata.execution.captureDirectory, "provenance.json"));
    requireThat(json(provenance.retry) === json(metadata.retry), "Retry provenance label mismatch");
  } else requireThat(!metadata.retry, "Retry cannot be imported as a first attempt");
  validateExecution(id, req, raw, metadata);
  return { req, path, raw, metadata };
}
function validateImported(id: string, retry = false) {
  const { req, raw, metadata } = archiveEnvelope(id, retry);
  const metadataBytes = readFileSync(join(retry ? join(run, "retries", id, "1") : join(run, "imports", id), "metadata.raw.json"));
  const review = validateReview(req.value.payload.candidate, raw);
  if (metadata.execution) validatePropositionEvidence(req.value.payload.source, req.value.payload.candidate, review.reason);
  return { id, responseSha256: hash(raw), metadataSha256: hash(metadataBytes), requestSha256: req.entry.requestSha256, review, metadata };
}
export function classifyArchivedResponse(candidate: string, raw: Buffer, status: { status: string; error?: string }, evidenceCheck?: (reason: string) => void) {
  let review: ReturnType<typeof validateReview> | null = null;
  let failure: string | null = null;
  try { review = validateReview(candidate, raw); evidenceCheck?.(review.reason); } catch (error) { failure = String(error); }
  if (status.status === "invalid") {
    requireThat(failure !== null && status.error === failure, "Invalid archived response or error has changed");
    let claimedVerdict: string | null = null;
    try { const value = JSON.parse(decode(raw)); if (["PASS", "LOCAL_REPAIR", "REJECT"].includes(value.verdict)) claimedVerdict = value.verdict; } catch { /* Malformed evidence has no parseable verdict. */ }
    return { validity: "INVALID" as const, review: null, claimedVerdict, error: failure };
  }
  requireThat(status.status === "accepted" && failure === null && review, "Accepted archive is invalid");
  return { validity: "VALID" as const, review, claimedVerdict: review.verdict, error: null };
}
function inspectArchive(id: string, retry = false) {
  const path = retry ? join(run, "retries", id, "1") : join(run, "imports", id);
  const attemptKind = retry ? "RETRY" : "FIRST";
  if (!existsSync(path)) return { id, attemptKind, validity: "PENDING", claimedVerdict: null, propositionEvidenceCorrectness: "UNASSESSED", imported: null };
  const envelope = archiveEnvelope(id, retry); // Binding errors are always fatal, even for INVALID responses.
  const status = read(join(path, "validation.json"));
  const classified = classifyArchivedResponse(envelope.req.value.payload.candidate, envelope.raw, status, envelope.metadata.execution ? reason => { validatePropositionEvidence(envelope.req.value.payload.source, envelope.req.value.payload.candidate, reason); } : undefined);
  if (classified.validity === "INVALID") return { id, attemptKind, ...classified, responseSha256: hash(envelope.raw), metadataSha256: hash(readFileSync(join(path, "metadata.raw.json"))), propositionEvidenceCorrectness: "UNASSESSED", imported: null };
  const imported = validateImported(id, retry);
  requireThat(json(imported) === json({ ...status, status: undefined }), "Stored import drift");
  return { id, attemptKind, validity: "VALID", claimedVerdict: imported.review.verdict, propositionEvidenceCorrectness: "UNASSESSED", imported };
}
export function summarizeAttempts(first: Array<{ id: string; validity: string }>, retry: { id: string; validity: string }) {
  const counts = (rows: Array<{ validity: string }>) => ({ valid: rows.filter(v => v.validity === "VALID").length,
    invalid: rows.filter(v => v.validity === "INVALID").length, pending: rows.filter(v => v.validity === "PENDING").length });
  const available = first.filter(v => v.validity === "VALID").map(v => ({ id: v.id, attemptKind: "FIRST" }));
  if (retry.validity === "VALID" && !available.some(v => v.id === retry.id)) available.push({ id: retry.id, attemptKind: "RETRY" });
  return { firstAttempts: counts(first), retries: counts([retry]), availableValidResponses: available.length, available };
}
function main() {
  const [command, id, responsePath, metadataPath] = process.argv.slice(2);
  const controls = validateControls();
  if (command !== "export") validateContinuation();
  if (command === "export") {
    requireThat(!existsSync(run), "Run already exists; do not overwrite");
    mkdirSync(join(run, "requests"), { recursive: true });
    mkdirSync(join(run, "imports"));
    mkdirSync(join(run, "responses"));
    const entries = controls.cases.flatMap(c => c.candidates.map(v => ({ c, v })));
    for (let i = entries.length - 1; i > 0; i--) { const j = randomInt(i + 1); [entries[i], entries[j]] = [entries[j], entries[i]]; }
    const mapping = entries.map(({ c, v }, i) => ({ id: `SP-${String(i + 1).padStart(3, "0")}`, caseId: c.caseId, ...v }));
    const privateBytes = json(mapping);
    write(join(run, "private-control-key.json"), privateBytes);
    const requests = entries.map(({ c, v }, i) => {
      const blindId = mapping[i].id;
      const system = getPrompt({ id: "verify", version: 3 }).system;
      const payload = { source: c.source, objective: c.objective, candidate: v.candidate,
        deterministicFindings: [], authorizedChanges: [], voiceDeviations: [], protectedPhrases: [] };
      const value = { id: blindId, requestedModel: "gpt-6.1-sol", settings: { reasoningEffort: "high", maxOutputTokens: 4096, tools: false, sessionMemory: false, attempts: 1 },
        system, payload, responseSchema: z.toJSONSchema(candidateReviewSchemaV10) };
      const bytes = json(value);
      const prompt = `${system}\n\nINPUT\n${json(payload)}\nREQUIRED RESPONSE SCHEMA\n${json(value.responseSchema)}`;
      const path = join(run, "requests", blindId); mkdirSync(path);
      write(join(path, "request.json"), bytes); write(join(path, "prompt.txt"), prompt);
      const entry = { id: blindId, requestSha256: hash(bytes), promptSha256: hash(prompt), sourceSha256: hash(c.source), objectiveSha256: hash(c.objective), candidateSha256: hash(v.candidate) };
      write(join(path, "metadata-template.json"), json({ requestSha256: entry.requestSha256, promptSha256: entry.promptSha256,
        responseSha256: "FILL_WITH_SHA256_OF_RAW_RESPONSE", requestedModel: "gpt-6.1-sol", reportedModel: null,
        identityEvidence: "FILL_WITH_OBSERVED_IDENTITY_EVIDENCE_OR_EXPLICIT_UNKNOWN", authenticatedExecutionPath: "FILL_WITH_PERMITTED_MANUAL_EXECUTION_PATH", operator: "FILL_WITH_NONSECRET_OPERATOR_LABEL",
        configuration: { reasoningEffort: null, maxOutputTokens: null, tools: null, sessionMemory: null }, tokens: { input: null, output: null, reasoning: null }, latencyMs: null, costUsd: null, requestId: null, limitations: "FILL_WITH_KNOWN_LIMITATIONS" }));
      return entry;
    });
    const packet = "# Blinded semantic verification packet\n\nEvaluate each numbered request separately in a fresh context. Return only its required JSON. Do not consult control keys or other candidates.\n\n" + requests.map(entry => `## ${entry.id}\n\n\`\`\`text\n${readFileSync(join(run, "requests", entry.id, "prompt.txt"), "utf8")}\`\`\`\n`).join("\n");
    write(join(run, "verification-packet.md"), packet);
    write(join(run, "manifest.json"), json({ packetSha256: hash(packet), version: "semantic-discrimination-probe-v1", createdAt: new Date().toISOString(), controlsSha256: hash(readFileSync(controlsPath)), privateKeySha256: hash(privateBytes), requests }));
    console.log("Exported 12 blinded requests; zero model calls.");
  } else if (command === "import" || command === "import-retry") {
    requireThat(id && responsePath && metadataPath, "Usage: import SP-NNN response metadata");
    request(id);
    const retry = command === "import-retry";
    requireThat(!retry || id === "SP-008", "Only one SP-008 retry is authorized");
    const path = retry ? join(run, "retries", id, "1") : join(run, "imports", id); requireThat(!existsSync(path), "Attempt already archived; never overwrite");
    const raw = readFileSync(responsePath), metadata = readFileSync(metadataPath);
    const proposed = metadataSchema.parse(JSON.parse(decode(metadata)));
    requireThat(retry ? Boolean(proposed.retry) : !proposed.retry, "First/retry attempt label mismatch");
    mkdirSync(path, { recursive: true }); write(join(path, "response.raw"), raw); write(join(path, "metadata.raw.json"), metadata);
    try { const imported = validateImported(id, retry); write(join(path, "validation.json"), json({ status: "accepted", ...imported })); console.log(`${id}: valid import; this is not independent identity confirmation`); }
    catch (error) { write(join(path, "validation.json"), json({ status: "invalid", error: String(error) })); throw error; }
  } else if (command === "validate" || command === "report") {
    const manifestBytes = readFileSync(join(run, "manifest.json")), manifest = JSON.parse(decode(manifestBytes));
    requireThat(manifest.packetSha256 === hash(readFileSync(join(run, "verification-packet.md"))), "Blind packet drift");
    requireThat(manifest.controlsSha256 === hash(readFileSync(controlsPath)) && manifest.requests.length === 12 && new Set(manifest.requests.map((v: { id: string }) => v.id)).size === 12, "Manifest drift");
    const firstAttempts = [];
    for (const entry of manifest.requests) {
      const req = request(entry.id);
      requireThat(hash(req.value.payload.source) === entry.sourceSha256 && hash(req.value.payload.objective) === entry.objectiveSha256 && hash(req.value.payload.candidate) === entry.candidateSha256, "Input binding drift");
      firstAttempts.push(inspectArchive(entry.id));
    }
    const retry = inspectArchive("SP-008", true);
    const reservationPath = join(run, "retry-reservation/SP-008/reservation.json");
    let retryExecutionState = "NOT_STARTED";
    if (existsSync(reservationPath)) {
      const reservation = read(reservationPath);
      const authorization = validateContinuation();
      requireThat(/^captures\/SP-008\/[a-zA-Z0-9-]+$/.test(reservation.captureDirectory) && reservation.captureDirectory !== authorization.originalCaptureDirectory, "Retry reservation capture mismatch");
      const label = retrySchema.parse(reservation.retry);
      requireThat(label.firstResponseSha256 === authorization.firstResponseSha256 && label.firstValidationSha256 === authorization.firstValidationSha256, "Retry reservation first-attempt binding mismatch");
      retryExecutionState = retry.validity === "PENDING" ? "RESERVED_UNIMPORTED" : "ARCHIVED";
    }

    const accounting = summarizeAttempts(firstAttempts, retry);
    const imported = [...firstAttempts.filter(v => v.imported).map(v => v.imported!), ...(retry.imported ? [retry.imported] : [])];
    console.log(JSON.stringify({ archiveIntegrity: "VALID", ...accounting, firstAttemptResults: firstAttempts.map(({ imported: value, ...v }) => ({ ...v, semanticVerdict: value?.review.verdict ?? null })), retryResult: { executionState: retryExecutionState, id: retry.id, attemptKind: "RETRY", validity: retry.validity, semanticVerdict: retry.imported?.review.verdict ?? null, claimedVerdict: retry.claimedVerdict, propositionEvidenceCorrectness: "UNASSESSED" } }, null, 2));
    if (command === "report") {
      requireThat(accounting.availableValidResponses === 12, "Evaluation incomplete; no unblinding or scores");
      const frozen = json({ manifestSha256: hash(manifestBytes), accounting, firstAttempts, retry, retryExecutionState, imported });
      const frozenPath = join(run, "reviews.frozen.json");
      if (existsSync(frozenPath)) requireThat(readFileSync(frozenPath, "utf8") === frozen, "Frozen reviews drift"); else write(frozenPath, frozen);
      // Read expected labels only after every review is validated and frozen.
      const keyBytes = readFileSync(join(run, "private-control-key.json")); requireThat(hash(keyBytes) === manifest.privateKeySha256, "Private key drift");
      const key = JSON.parse(decode(keyBytes));
      const rows = imported.map(v => { const control = key.find((k: { id: string }) => k.id === v.id); requireThat(control && hash(control.candidate) === manifest.requests.find((r: { id: string }) => r.id === v.id).candidateSha256, "Control binding drift"); return { id: v.id, attemptKind: v.metadata.retry ? "RETRY" : "FIRST", caseId: control.caseId, kind: control.kind, expectedPass: control.expectedOriginalAcceptance, actualPass: v.review.verdict === "PASS", verdict: v.review.verdict, targetProposition: control.targetProposition, reason: v.review.reason, issue: v.review.issue, propositionIdentification: "UNASSESSED_REQUIRES_EVIDENCE_AUDIT" }; });
      const report = { accounting, firstAttemptDiscrimination: { validResponses: rows.filter(v => v.attemptKind === "FIRST").length, invalidResponses: accounting.firstAttempts.invalid, pendingResponses: accounting.firstAttempts.pending, rows: rows.filter(v => v.attemptKind === "FIRST") }, availableResponseDiscriminationIncludesExplicitRetry: rows.some(v => v.attemptKind === "RETRY"), judgmentSha256: hash(frozen), originalsAccepted: rows.filter(v => v.expectedPass && v.actualPass).length,
        controlsWithheld: rows.filter(v => !v.expectedPass && !v.actualPass).length, falseAcceptance: rows.filter(v => !v.expectedPass && v.actualPass).length,
        falseRejection: rows.filter(v => v.expectedPass && !v.actualPass).length, identityIndependentlyVerified: false, decision: "NO-GO until provenance and proposition identification are audited", rows };
      write(join(run, "discrimination-report.json"), json(report)); console.log(JSON.stringify(report, null, 2));
    }
  } else throw new Error("Commands: export | import ID RESPONSE METADATA | import-retry SP-008 RESPONSE METADATA | validate | report");
}
if (process.argv[1]?.endsWith("/semantic-discrimination-probe.ts")) main();
