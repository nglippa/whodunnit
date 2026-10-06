import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, it } from 'node:test';

const root = resolve(import.meta.dirname, '..');
const comparison = 'data/evaluation/post-v3-comparison';
const successor = 'data/evaluation/post-v3-successor';
const historicalFiles = [
  'cases.json', 'corpus-manifest.json', 'corpus-manifest.sha256',
  'creator-provenance.json', 'freshness-audit.json', 'prelabel-packet.json',
  'prelabels/reviewer-01.json', 'prelabels/reviewer-02-original-submission.json',
  'prelabels/reviewer-02.json',
];
const fixtures = [];
afterEach(() => { for (const fixture of fixtures.splice(0)) rmSync(fixture, { recursive: true, force: true }); });

function fixture(paths) {
  const dir = mkdtempSync(join(tmpdir(), 'whodunnit-freeze-test-'));
  fixtures.push(dir);
  writeFileSync(join(dir, '.git'), `gitdir: ${join(root, '.git')}\n`);
  for (const path of paths) {
    const target = join(dir, path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(root, path), target);
  }
  return dir;
}

function run(dir, script, args = []) {
  return spawnSync(process.execPath, [...args, join(dir, script)], { cwd: dir, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
}

function historicalFixture() {
  return fixture([
    'scripts/verify-post-v3-freeze.mjs', 'scripts/verify-post-v3-freeze-historical.mjs',
    `${comparison}/operational-manifest.json`,
    ...historicalFiles.map(name => `${comparison}/frozen/${name}`),
  ]);
}

function successorFixture() {
  return fixture([
    'scripts/verify-post-v3-successor-preregistration.mjs',
    'docs/POST-V3-SUCCESSOR-PREREGISTRATION.md',
    ...['preregistration.integrity.json', 'preregistration.json', 'reuse-policy.json', 'execution-contract.schema.json']
      .map(name => `${successor}/${name}`),
  ]);
}

it('passes the authoritative historical corpus and prelabel state', () => {
  const result = run(historicalFixture(), 'scripts/verify-post-v3-freeze-historical.mjs');
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.scope, 'original-pre-RAW-corpus-freeze');
  assert.equal(report.originalFileCount, 9);
  assert.equal(report.caseCount, 40);
});

it('rejects a historical frozen artifact mutation', () => {
  const dir = historicalFixture();
  const path = join(dir, comparison, 'frozen/cases.json');
  writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('\n')]));
  const result = run(dir, 'scripts/verify-post-v3-freeze-historical.mjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /original freeze bytes changed/);
});

it('rejects mutation of the protected operational anchor', () => {
  const dir = historicalFixture();
  const path = join(dir, comparison, 'operational-manifest.json');
  writeFileSync(path, Buffer.concat([readFileSync(path), Buffer.from('\n')]));
  const result = run(dir, 'scripts/verify-post-v3-freeze-historical.mjs');
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /historical corpus verification failed/);
});

it('accepts later authorized evidence descendants without changing historical scope', () => {
  const dir = historicalFixture();
  writeFileSync(join(dir, comparison, 'frozen/implementations.json'), '{}\n');
  writeFileSync(join(dir, comparison, 'frozen/raw.json'), '{}\n');
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs/POST-V3-LATER-EVIDENCE.md'), 'later evidence\n');
  const result = run(dir, 'scripts/verify-post-v3-freeze-historical.mjs');
  assert.equal(result.status, 0, result.stderr);
});

it('RAW verifier rejects frozen implementation and governed RAW mutations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'whodunnit-raw-freeze-test-'));
  fixtures.push(dir);
  const clone = spawnSync('git', ['clone', '--local', '--no-hardlinks', root, dir], { encoding: 'utf8' });
  assert.equal(clone.status, 0, clone.stderr);
  const state = spawnSync('git', ['status', '--porcelain', '--', 'src'], { cwd: dir, encoding: 'utf8' });
  assert.equal(state.stdout, '', state.stderr);
  const script = resolve(root, 'tools/eval/post-v3-raw-freeze-verify.ts');
  const verify = () => spawnSync(process.execPath, ['--import', resolve(root, 'node_modules/tsx/dist/loader.mjs'), script], {
    cwd: dir, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  });
  const baseline = verify();
  assert.equal(baseline.status, 0, baseline.stderr);
  assert.equal(JSON.parse(baseline.stdout).attempted, 40);

  const implementation = join(dir, 'src/lib/reconstruction/post-v3/index.ts');
  const implementationBytes = readFileSync(implementation);
  writeFileSync(implementation, Buffer.concat([implementationBytes, Buffer.from('\n')]));
  const alteredImplementation = verify();
  assert.notEqual(alteredImplementation.status, 0);
  assert.match(alteredImplementation.stderr, /file hash|source changed/);
  writeFileSync(implementation, implementationBytes);

  const raw = join(dir, comparison, 'frozen/raw.json');
  writeFileSync(raw, Buffer.concat([readFileSync(raw), Buffer.from('\n')]));
  const alteredRaw = verify();
  assert.notEqual(alteredRaw.status, 0);
  assert.match(alteredRaw.stderr, /file hash/);
});

it('successor gate preserves fresh-40 exclusion and exact preregistration bytes', () => {
  const dir = successorFixture();
  const baseline = run(dir, 'scripts/verify-post-v3-successor-preregistration.mjs');
  assert.equal(baseline.status, 0, baseline.stderr);
  const report = JSON.parse(baseline.stdout);
  assert.equal(report.valid, true);
  assert.equal(report.freshCaseCount, 40);
  assert.equal(report.oldInputsExcluded, true);
  assert.equal(report.selectedEffort, null);

  const path = join(dir, successor, 'reuse-policy.json');
  const policy = JSON.parse(readFileSync(path, 'utf8'));
  policy.decisions.find(row => row.component === 'Original 40-case corpus').classification = 'REUSE AS FROZEN';
  writeFileSync(path, `${JSON.stringify(policy)}\n`);
  const altered = run(dir, 'scripts/verify-post-v3-successor-preregistration.mjs');
  assert.notEqual(altered.status, 0);
  assert.match(altered.stderr, /exact bytes mismatch/);
});
