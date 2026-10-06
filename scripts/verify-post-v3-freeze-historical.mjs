#!/usr/bin/env node
/** Re-run the original corpus gate at its pre-RAW scope without changing frozen bytes. */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const commit = '0bace0834bf5f85b4bc9ae3d29311badcd2adacc';
const frozenPath = 'data/evaluation/post-v3-comparison/frozen';
const verifierPath = 'scripts/verify-post-v3-freeze.mjs';
const originalFiles = [
  'cases.json',
  'corpus-manifest.json',
  'corpus-manifest.sha256',
  'creator-provenance.json',
  'freshness-audit.json',
  'prelabel-packet.json',
  'prelabels/reviewer-01.json',
  'prelabels/reviewer-02-original-submission.json',
  'prelabels/reviewer-02.json',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

function gitFile(path) {
  const result = spawnSync('git', ['show', `${commit}:${path}`], { cwd: root, maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0 || result.error) throw new Error(`cannot read frozen Git object: ${path}`);
  return result.stdout;
}

function currentFile(path) {
  const absolute = resolve(root, path);
  const rel = relative(root, absolute);
  if (rel === '..' || rel.startsWith(`..${sep}`)) throw new Error(`unsafe file path: ${path}`);
  const stat = lstatSync(absolute, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) throw new Error(`missing or unsafe current file: ${path}`);
  return readFileSync(absolute);
}

function verify() {
  const paths = [verifierPath, ...originalFiles.map(name => `${frozenPath}/${name}`)];
  const archived = new Map();
  for (const path of paths) {
    const historical = gitFile(path);
    if (!currentFile(path).equals(historical)) throw new Error(`original freeze bytes changed: ${path}`);
    archived.set(path, historical);
  }

  const temp = mkdtempSync(join(tmpdir(), 'post-v3-freeze-'));
  try {
    const historicalDir = join(temp, 'frozen');
    for (const name of originalFiles) {
      const target = join(historicalDir, name);
      mkdirSync(dirname(target), { recursive: true, mode: 0o700 });
      writeFileSync(target, archived.get(`${frozenPath}/${name}`), { mode: 0o600 });
    }
    const result = spawnSync(process.execPath, [resolve(root, verifierPath), historicalDir], {
      cwd: root, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    });
    if (result.error) throw result.error;
    if (!result.stdout) throw new Error(`historical verifier exited without a report (status ${result.status})`);
    const report = JSON.parse(result.stdout);
    if (result.status !== 0 || report.status !== 'PASS' || report.failures?.length) {
      throw new Error(`historical corpus verification failed: ${JSON.stringify(report.failures ?? [])}`);
    }
    return {
      valid: true,
      scope: 'original-pre-RAW-corpus-freeze',
      freezeCommit: commit,
      originalFileCount: originalFiles.length,
      currentOriginalBytesMatchFreeze: true,
      verifierSha256: hash(archived.get(verifierPath)),
      caseCount: report.caseCount,
      reviewerCounts: report.reviewerCounts,
    };
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

try { process.stdout.write(`${JSON.stringify(verify())}\n`); }
catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'historical freeze verification failed'}\n`); process.exitCode = 1; }
