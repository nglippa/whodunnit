#!/usr/bin/env node
/** Read-only integrity and exclusion gate for the committed successor registration. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = '8d9a4b6173e54020eaa44a36bb75fe07314ca456';
const base = 'data/evaluation/post-v3-successor';
const sidecarPath = `${base}/preregistration.integrity.json`;
const paths = {
  document: 'docs/POST-V3-SUCCESSOR-PREREGISTRATION.md',
  registration: `${base}/preregistration.json`,
  reusePolicy: `${base}/reuse-policy.json`,
  futureExecutionContractSchema: `${base}/execution-contract.schema.json`,
};
const sha = bytes => createHash('sha256').update(bytes).digest('hex');

function bytes(path) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (!path || rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`unsafe path: ${path}`);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`missing or unsafe file: ${path}`);
  return readFileSync(absolute);
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label} mismatch`);
}

function verify() {
  const historical = spawnSync('git', ['show', `${commit}:${sidecarPath}`], { cwd: root, maxBuffer: 1024 * 1024 });
  if (historical.error || historical.status !== 0) throw new Error('cannot read committed successor integrity sidecar');
  const sidecarBytes = bytes(sidecarPath);
  if (!sidecarBytes.equals(historical.stdout)) throw new Error('successor integrity sidecar changed since preregistration');
  const sidecar = JSON.parse(sidecarBytes.toString('utf8'));
  equal(sidecar.schemaVersion, 1, 'integrity schema');
  equal(sidecar.artifact, 'post-v3-successor-preregistration-integrity', 'integrity artifact');
  equal(sidecar.experimentId, 'post-v3-successor-fresh-40', 'integrity experiment');
  equal(sidecar.hashAlgorithm, 'sha256', 'integrity hash algorithm');
  if (Object.keys(sidecar.files ?? {}).sort().join() !== Object.keys(paths).sort().join()) throw new Error('integrity file inventory mismatch');
  for (const [key, path] of Object.entries(paths)) {
    const entry = sidecar.files[key];
    equal(entry?.path, path, `${key} path`);
    if (!/^[a-f0-9]{64}$/.test(entry.exactFileBytesSha256)) throw new Error(`${key} invalid expected hash`);
    equal(sha(bytes(path)), entry.exactFileBytesSha256, `${key} exact bytes`);
  }

  const registration = JSON.parse(bytes(paths.registration).toString('utf8'));
  const policy = JSON.parse(bytes(paths.reusePolicy).toString('utf8'));
  equal(registration.experimentId, 'post-v3-successor-fresh-40', 'registration experiment');
  equal(registration.status, 'PREREGISTERED_BLOCKED_BEFORE_DATA_CREATION', 'registration status');
  equal(registration.reusePolicyPath, paths.reusePolicy, 'registration reuse policy path');
  equal(registration.inputPolicy?.choice, 'FRESH_CORPUS_AND_FRESH_RAW_FOR_ALL_40', 'fresh input choice');
  equal(registration.inputPolicy?.caseCount, 40, 'fresh case count');
  equal(registration.inputPolicy?.oldCasesPrelabelsRawAndFailureIds, 'EXCLUDED_FROM_SUCCESSOR_INPUTS_AND_DENOMINATORS', 'old input exclusion');
  equal(registration.inputPolicy?.rawAttemptsPerCase, 1, 'RAW attempt count');
  equal(registration.inputPolicy?.rawRetries, 0, 'RAW retries');
  equal(registration.inputPolicy?.rawReplacementOrRegeneration, false, 'RAW replacement');
  equal(registration.effortSelection?.status, 'MECHANISM_FROZEN_VALUE_NOT_SELECTED', 'effort status');
  equal(registration.effortSelection?.selectedEffort, null, 'selected effort');
  equal(policy.experimentId, registration.experimentId, 'reuse policy experiment');
  const decisions = new Map(policy.decisions?.map(item => [item.component, item.classification]));
  for (const component of [
    'Original 40-case corpus', 'Original two prelabel sets',
    'Original 36 accepted RAW texts', 'Original four RAW technical-failure cases',
  ]) equal(decisions.get(component), 'EXCLUDE', `${component} exclusion`);
  for (const component of ['Successor 40-case corpus', 'Successor prelabels', 'Successor RAW text and attempt records'])
    equal(decisions.get(component), 'REGENERATE', `${component} regeneration`);
  return { valid: true, scope: 'current-successor-preregistration', registrationCommit: commit,
    protectedFileCount: Object.keys(paths).length, freshCaseCount: 40, oldInputsExcluded: true, selectedEffort: null };
}

try { process.stdout.write(`${JSON.stringify(verify())}\n`); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'successor preregistration verification failed'}\n`); process.exitCode = 1; }
