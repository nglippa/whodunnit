/** Offline pre-generation integrity check. Reads corpus metadata bytes only, never case-bearing contents. */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";

const repoRoot = resolve(process.cwd());
const base = "data/evaluation/post-v3-comparison";
const manifestPath = `${base}/frozen/raw-generation-manifest.json`;
const sidecarPath = `${base}/frozen/raw-generation-manifest.integrity.json`;
const sha256 = (bytes: string | Buffer) => createHash("sha256").update(bytes).digest("hex");
const shaSchema = z.string().regex(/^[a-f0-9]{64}$/);

const manifestSchema = z.object({
  schemaVersion: z.literal(1),
  status: z.string(),
  anchors: z.object({
    preregistrationPath: z.string(),
    operationalManifest: z.object({ path: z.string(), exactFileBytesSha256: shaSchema }).passthrough(),
    implementationFreeze: z.object({ path: z.string(), exactFileBytesSha256: shaSchema }).passthrough(),
    implementationIntegrity: z.object({ path: z.string(), exactFileBytesSha256: shaSchema }).passthrough(),
    corpusMetadata: z.object({ path: z.string(), exactFileBytesSha256: shaSchema, inspectionBoundary: z.string() }).passthrough(),
  }).passthrough(),
  files: z.record(z.string(), shaSchema),
  attemptPolicy: z.object({ maximumCallsPerCase: z.literal(1), maximumCallsTotal: z.literal(40), timeoutMs: z.literal(120_000) }).passthrough(),
  authorizationState: z.object({ generationAuthorized: z.literal(false), rawGenerated: z.literal(false) }).passthrough(),
  outputPaths: z.array(z.string()).min(2),
  integrity: z.object({ hashAlgorithm: z.literal("sha256") }).passthrough(),
}).passthrough();

const sidecarSchema = z.object({
  schemaVersion: z.literal(1),
  manifestPath: z.literal(manifestPath),
  hashAlgorithm: z.literal("sha256"),
  exactFileBytesSha256: shaSchema,
}).strict();
const implementationsIntegritySchema = z.object({
  schemaVersion: z.string(),
  artifact: z.string(),
  implementationManifest: z.object({ path: z.string(), exactByteSha256: shaSchema, rfc8785JcsCanonicalSha256: shaSchema }).passthrough(),
  predecessorHashes: z.object({
    implementationCommit: z.string(),
    v15AnchorCommit: z.string(),
    protocolDocumentSha256: shaSchema,
    protocolCommit: z.string(),
    operationalManifestSha256: shaSchema,
    corpusManifestSha256ProvidedMetadata: shaSchema,
    candidateCodeAndTestSha256: z.record(z.string(), shaSchema),
    sharedV15DependencyHashes: z.record(z.string(), shaSchema),
  }).passthrough(),
}).passthrough();

function safeRegularFile(relativePath: string) {
  if (!relativePath || isAbsolute(relativePath)) throw new Error(`unsafe relative file path: ${relativePath}`);
  const absolute = resolve(repoRoot, relativePath);
  const rel = relative(repoRoot, absolute);
  if (rel === ".." || rel.startsWith(`..${sep}`)) throw new Error(`path escapes repository: ${relativePath}`);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`missing or unsafe file: ${relativePath}`);
  return readFileSync(absolute);
}

function verifyHash(relativePath: string, expected: string) {
  const actual = sha256(safeRegularFile(relativePath));
  if (actual !== expected) throw new Error(`hash mismatch: ${relativePath}`);
  return actual;
}

function verifyPredecessors(manifest: z.infer<typeof manifestSchema>) {
  for (const anchor of [manifest.anchors.operationalManifest, manifest.anchors.implementationFreeze, manifest.anchors.implementationIntegrity, manifest.anchors.corpusMetadata])
    verifyHash(anchor.path, anchor.exactFileBytesSha256);

  const implementationBytes = safeRegularFile(manifest.anchors.implementationFreeze.path);
  const implementation = z.object({ implementationFiles: z.record(z.string(), shaSchema), sharedV15DependencyHashes: z.record(z.string(), shaSchema) }).passthrough().parse(JSON.parse(implementationBytes.toString("utf8")));
  for (const hashes of [implementation.implementationFiles, implementation.sharedV15DependencyHashes])
    for (const [path, expected] of Object.entries(hashes)) verifyHash(path, expected);

  const integrityBytes = safeRegularFile(manifest.anchors.implementationIntegrity.path);
  const integrity = implementationsIntegritySchema.parse(JSON.parse(integrityBytes.toString("utf8")));
  if (sha256(implementationBytes) !== integrity.implementationManifest.exactByteSha256) throw new Error("implementation manifest anchor mismatch");
  if (sha256(safeRegularFile(manifest.anchors.corpusMetadata.path)) !== integrity.predecessorHashes.corpusManifestSha256ProvidedMetadata) throw new Error("corpus metadata anchor mismatch");
  const corpusSidecarPath = `${base}/frozen/corpus-manifest.sha256`;
  const corpusSidecar = safeRegularFile(corpusSidecarPath).toString("utf8").trim().split(/\s+/)[0];
  if (corpusSidecar !== sha256(safeRegularFile(manifest.anchors.corpusMetadata.path))) throw new Error("corpus metadata sidecar mismatch");
  for (const [path, expected] of Object.entries(integrity.predecessorHashes.candidateCodeAndTestSha256)) verifyHash(path, expected);
  for (const [path, expected] of Object.entries(integrity.predecessorHashes.sharedV15DependencyHashes)) verifyHash(path, expected);
}

function verifyNoGeneratedArtifacts() {
  const allowed = new Set([
    `${base}/raw-editor-prompt-v1.txt`,
    `${base}/raw-response.schema.json`,
    manifestPath,
    sidecarPath,
  ]);
  const generatedName = /(^|[-_.])(raw|comparison|candidate|output|result|attempt)([-_.]|$)/i;
  const visit = (relativeDirectory: string) => {
    const absoluteDirectory = resolve(repoRoot, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) throw new Error(`symlink in comparison artifact directory: ${relativePath}`);
      if (entry.isDirectory()) visit(relativePath);
      else if (generatedName.test(entry.name) && !allowed.has(relativePath)) throw new Error(`unexpected RAW/comparison artifact: ${relativePath}`);
    }
  };
  visit(base);
}

export function verifyRawGenerationContract() {
  const sidecar = sidecarSchema.parse(JSON.parse(safeRegularFile(sidecarPath).toString("utf8")));
  const manifestBytes = safeRegularFile(manifestPath);
  if (sha256(manifestBytes) !== sidecar.exactFileBytesSha256) throw new Error("generation manifest sidecar hash mismatch");
  const manifest = manifestSchema.parse(JSON.parse(manifestBytes.toString("utf8")));
  if (manifest.status !== "FROZEN_PRE_GENERATION") throw new Error("generation manifest is not frozen before generation");
  if (manifest.authorizationState.generationAuthorized || manifest.authorizationState.rawGenerated) throw new Error("generation authorization or RAW artifact state is invalid");
  if (manifest.anchors.corpusMetadata.inspectionBoundary !== "Hash file bytes only. Do not open cases, objectives, prelabels, or case-bearing audits before implementation and RAW transport freeze.") throw new Error("corpus metadata boundary changed");

  for (const [path, expected] of Object.entries(manifest.files)) verifyHash(path, expected);
  const responseSchemaPath = `${base}/raw-response.schema.json`;
  z.object({
    $schema: z.literal("https://json-schema.org/draft/2020-12/schema"),
    type: z.literal("object"),
    properties: z.object({ text: z.object({ type: z.literal("string"), minLength: z.literal(1), maxLength: z.literal(60_000) }).strict() }).strict(),
    required: z.tuple([z.literal("text")]),
    additionalProperties: z.literal(false),
  }).strict().parse(JSON.parse(safeRegularFile(responseSchemaPath).toString("utf8")));
  verifyPredecessors(manifest);

  const requiredOutputs = new Set([`${base}/frozen/raw.json`, `${base}/run/`]);
  if (requiredOutputs.size !== manifest.outputPaths.length || manifest.outputPaths.some(path => !requiredOutputs.has(path))) throw new Error("unexpected RAW/comparison output path policy");
  for (const path of manifest.outputPaths) {
    const absolute = resolve(repoRoot, path);
    if (existsSync(absolute)) throw new Error(`RAW/comparison output already exists: ${path}`);
  }
  verifyNoGeneratedArtifacts();
  return { valid: true, status: manifest.status, manifestSha256: sha256(manifestBytes), filesVerified: Object.keys(manifest.files).length, outputsAbsent: true };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.stdout.write(JSON.stringify(verifyRawGenerationContract()) + "\n"); }
  catch (error) { process.stderr.write(`${error instanceof Error ? error.message : "RAW contract verification failed"}\n`); process.exitCode = 1; }
}
