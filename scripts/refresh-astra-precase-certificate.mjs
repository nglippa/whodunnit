#!/usr/bin/env node
// Recompute only artifact hashes and the certificate sidecar; do not alter a governance verdict.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const root = resolve(import.meta.dirname, "..");
const relative = "data/evaluation/astra-control-fresh-48-v1/pre-case/pre-case-certificate.json";
const path = resolve(root, relative);
const certificate = JSON.parse(readFileSync(path, "utf8"));
assert.equal(certificate.experiment_id, "astra-control-fresh-48-v1");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
for (const [field, artifactPath] of Object.entries(certificate.artifact_paths)) {
  assert(/^[a-z0-9_]+$/.test(field));
  assert(typeof artifactPath === "string" && !artifactPath.startsWith("/") && !artifactPath.includes(".."));
  certificate[field] = sha256(readFileSync(resolve(root, artifactPath)));
}
assert.equal(certificate.case_count_created, 0);
assert.equal(certificate.prelabel_count, 0);
assert.equal(certificate.output_count, 0);
assert.equal(certificate.experimental_model_calls, 0);
assert.equal(certificate.experimental_spend, 0);
const bytes = Buffer.from(JSON.stringify(certificate, null, 2) + "\n", "utf8");
writeFileSync(path, bytes);
const sidecarRelative = certificate.certificate_hash_location;
assert(sidecarRelative.startsWith("data/evaluation/astra-control-fresh-48-v1/pre-case/") && sidecarRelative.endsWith(".sha256"));
writeFileSync(resolve(root, sidecarRelative), `${sha256(bytes)}  pre-case-certificate.json\n`, "utf8");
console.log(`certificate SHA-256 ${sha256(bytes)}`);
