#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const frozenDir = path.resolve(process.argv[2] ?? path.join(root, 'data/evaluation/post-v3-comparison/frozen'));
const operationalPath = path.join(root, 'data/evaluation/post-v3-comparison/operational-manifest.json');
const failures = [];
const check = (condition, message) => { if (!condition) failures.push(message); };
const bytes = p => fs.readFileSync(p);
const parse = p => JSON.parse(bytes(p).toString('utf8'));
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, normalize(v[k])]));
  return v;
}
const canonical = v => JSON.stringify(normalize(v));
const jcsSha = v => sha(Buffer.from(canonical(v), 'utf8'));
const expect = (condition, message) => check(condition, message);

const manifest = parse(path.join(frozenDir, 'corpus-manifest.json'));
const opBytes = bytes(operationalPath);
const op = JSON.parse(opBytes.toString('utf8'));
expect(manifest.experimentId === op.experimentId, 'experiment ID differs from operational manifest');
expect(manifest.anchors.operationalManifestSha256 === sha(opBytes), 'operational manifest anchor mismatch');
expect(manifest.anchors.protocolSha256 === op.protocol.documentSha256, 'protocol anchor mismatch');
expect(manifest.anchors.v3ManifestSha256 === op.protocol.v3ManifestSha256, 'V3 manifest anchor mismatch');
expect(manifest.anchors.v3Commit === op.protocol.v3Commit, 'V3 commit anchor mismatch');
expect(manifest.anchors.v15ArchitectureCommit === op.protocol.v15ArchitectureCommit, 'V15 architecture commit anchor mismatch');

const anchorLine = bytes(path.join(frozenDir, 'corpus-manifest.sha256')).toString('utf8').trim();
const manifestBytes = bytes(path.join(frozenDir, 'corpus-manifest.json'));
expect(anchorLine === `${sha(manifestBytes)}  corpus-manifest.json`, 'corpus-manifest.sha256 anchor mismatch');

for (const [name, expected] of Object.entries(manifest.artifactHashes)) {
  const p = path.join(frozenDir, name);
  expect(fs.existsSync(p), `missing artifact ${name}`);
  if (fs.existsSync(p)) {
    const b = bytes(p);
    expect(sha(b) === expected.fileBytesSha256, `exact file hash mismatch: ${name}`);
    expect(jcsSha(JSON.parse(b.toString('utf8'))) === expected.jcsSha256, `JCS hash mismatch: ${name}`);
  }
}

const cases = parse(path.join(frozenDir, 'cases.json'));
const packet = parse(path.join(frozenDir, 'prelabel-packet.json'));
const reviewers = [parse(path.join(frozenDir, 'prelabels/reviewer-01.json')), parse(path.join(frozenDir, 'prelabels/reviewer-02.json'))];
const originalReviewer2 = parse(path.join(frozenDir, 'prelabels/reviewer-02-original-submission.json'));
const ids = Array.from({length:40}, (_,i) => `PVC-${String(i+1).padStart(3,'0')}`);
expect(cases.length === 40 && new Set(cases.map(x=>x.caseId)).size === 40, 'cases must contain 40 unique IDs');
expect(JSON.stringify(cases.map(x=>x.caseId)) === JSON.stringify(ids), 'cases are not ordered PVC-001 through PVC-040');
expect(JSON.stringify(manifest.caseIds) === JSON.stringify(ids), 'manifest case ID list mismatch');

const expectedStrata = Object.fromEntries(op.corpusPlan.primaryStrata.map(s=>[s.id,s.count]));
const primaryCounts = {};
const creatorCounts = {};
const lengthCounts = {};
const genreCounts = {};
const allowedTags = new Set(op.corpusPlan.secondaryTags);
const caseById = new Map(cases.map(c=>[c.caseId,c]));
for (const c of cases) {
  primaryCounts[c.primaryStratum]=(primaryCounts[c.primaryStratum]||0)+1;
  creatorCounts[c.creatorId]=(creatorCounts[c.creatorId]||0)+1;
  lengthCounts[c.lengthBand]=(lengthCounts[c.lengthBand]||0)+1;
  genreCounts[c.genre]=(genreCounts[c.genre]||0)+1;
  expect(Array.isArray(c.secondaryTags) && c.secondaryTags.every(t=>allowedTags.has(t)), `${c.caseId} has a secondary tag outside the allowed vocabulary`);
  expect(Array.isArray(c.creatorSubmittedSecondaryTags), `${c.caseId} is missing creatorSubmittedSecondaryTags`);
  const expectedAssignment = op.corpusPlan.creators.flatMap(x=>x.assignments.map(a=>({...a,creatorId:x.roleId}))).find(x=>x.caseId===c.caseId);
  expect(!!expectedAssignment && c.primaryStratum===expectedAssignment.primaryStratum && c.creatorId===expectedAssignment.creatorId, `${c.caseId} allocation differs from operational manifest`);
}
expect(JSON.stringify(normalize(primaryCounts))===JSON.stringify(normalize(expectedStrata)), 'primary stratum distribution mismatch');
expect(Object.keys(creatorCounts).length===4 && Object.values(creatorCounts).every(n=>n===10), 'creator distribution is not four creators with 10 cases each');
expect(jcsSha(manifest.distributions.primaryStratum)===jcsSha(primaryCounts), 'manifest primary stratum distribution mismatch');
expect(jcsSha(manifest.distributions.creator)===jcsSha(creatorCounts), 'manifest creator distribution mismatch');
expect(jcsSha(manifest.distributions.lengthBand)===jcsSha(lengthCounts), 'manifest length band distribution mismatch');
expect(jcsSha(manifest.distributions.genre)===jcsSha(genreCounts), 'manifest genre distribution mismatch');

const expectedCaseHashes=cases.map(c=>({caseId:c.caseId,sourceUtf8Sha256:sha(Buffer.from(c.source,'utf8')),objectiveUtf8Sha256:sha(Buffer.from(c.objective,'utf8')),metadataJcsSha256:jcsSha({primaryStratum:c.primaryStratum,creatorId:c.creatorId,genre:c.genre,lengthBand:c.lengthBand,declaredProvenance:c.declaredProvenance,secondaryTags:c.secondaryTags,creatorSubmittedSecondaryTags:c.creatorSubmittedSecondaryTags})}));
expect(jcsSha(manifest.caseHashes)===jcsSha(expectedCaseHashes), 'per-case source/objective/metadata hash mismatch');

expect(packet.length===40 && packet.every(p=>Object.keys(p).sort().join(',')==='caseId,objective,source'), 'prelabel packet must contain only caseId/source/objective for 40 records');
expect(JSON.stringify(packet.map(p=>p.caseId))===JSON.stringify(ids), 'prelabel packet case order mismatch');
for(const p of packet){const c=caseById.get(p.caseId);expect(!!c && p.source===c.source && p.objective===c.objective, `${p.caseId} packet source/objective differs from cases`);}

const requiredFields=['caseId','reviewerId','timestamp','expectedEditingScope','expectedSafeBehavior','authorizedReplacements','preservedMaterialFacts','voiceConstraints','ambiguity','missingInformation','expectedCompletionDisposition','rationaleWithSourceAndObjectiveCitations'];
for(let ri=0;ri<2;ri++){
  const arr=reviewers[ri], expectedId=ri===0?'PRELABELER-01':'PRELABELER-02';
  expect(arr.length===40 && new Set(arr.map(x=>x.caseId)).size===40 && ids.every(id=>arr.some(x=>x.caseId===id)), `${expectedId} must label all 40 cases exactly once`);
  for(const x of arr){
    expect(x.reviewerId===expectedId, `${x.caseId} reviewer ID must be ${expectedId}`);
    expect(requiredFields.every(k=>Object.hasOwn(x,k)), `${x.caseId} ${expectedId} missing required schema field`);
    expect(['complete','incomplete','abstain'].includes(x.expectedCompletionDisposition), `${x.caseId} ${expectedId} has invalid completion disposition`);
    expect(Array.isArray(x.authorizedReplacements)&&Array.isArray(x.preservedMaterialFacts)&&Array.isArray(x.voiceConstraints)&&Array.isArray(x.ambiguity)&&Array.isArray(x.missingInformation), `${x.caseId} ${expectedId} has invalid schema array field`);
    expect(x.authorizedReplacements.every(y=>['sourceValue','replacementValue','scope','authorizationEvidenceInObjective'].every(k=>Object.hasOwn(y,k))), `${x.caseId} ${expectedId} has invalid authorized replacement schema`);
    expect(x.preservedMaterialFacts.every(y=>['fact','sourceEvidence'].every(k=>Object.hasOwn(y,k))), `${x.caseId} ${expectedId} has invalid preserved fact schema`);
    expect(x.ambiguity.every(y=>['interpretations','materiality','completionDependency'].every(k=>Object.hasOwn(y,k))), `${x.caseId} ${expectedId} has invalid ambiguity schema`);
    expect(x.missingInformation.every(y=>['requiredFact','available','consequenceIfUnavailable'].every(k=>Object.hasOwn(y,k))), `${x.caseId} ${expectedId} has invalid missing information schema`);
  }
}
expect(originalReviewer2.length===40 && originalReviewer2.every(x=>x.reviewerId==='PRELABEL-02'), 'reviewer-02 original submission is not preserved as submitted');
expect(originalReviewer2.every((x,i)=>{const a={...x},b={...reviewers[1][i]};delete a.reviewerId;delete b.reviewerId;return jcsSha(a)===jcsSha(b)}), 'reviewer-02 custodian correction changed fields beyond reviewerId or changed order');
expect(manifest.reviewerLabelJcsSha256.reviewer01===jcsSha(reviewers[0]), 'reviewer-01 JCS label hash mismatch');
expect(manifest.reviewerLabelJcsSha256.reviewer02===jcsSha(reviewers[1]), 'reviewer-02 JCS label hash mismatch');
expect(manifest.reviewerLabelJcsSha256.reviewer02Original===jcsSha(originalReviewer2), 'reviewer-02 original JCS label hash mismatch');
const assignments={reviewerAssignments:ids.map(id=>({caseId:id,reviewerIds:[reviewers[0].find(x=>x.caseId===id)?.reviewerId,reviewers[1].find(x=>x.caseId===id)?.reviewerId]})),requiredReviewerIds:['PRELABELER-01','PRELABELER-02']};
expect(manifest.reviewerAssignmentJcsSha256===jcsSha(assignments), 'reviewer assignment JCS hash mismatch');

function walk(dir, prefix=''){ return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>{const name=prefix?`${prefix}/${d.name}`:d.name;return d.isDirectory()?walk(path.join(dir,d.name),name):[name];}); }
const forbidden = walk(frozenDir).filter(n=>/raw|implementation|arm-output|run-output/i.test(n));
expect(forbidden.length===0, `forbidden raw/implementation/arm/run output found: ${forbidden.join(', ')}`);
expect(manifest.privacyAndExecution.rawOrArmOutputsIncluded===false, 'manifest claims raw/arm outputs are included');

const disagreements=[];
for(const id of ids){
 const a=reviewers[0].find(x=>x.caseId===id),b=reviewers[1].find(x=>x.caseId===id);
 const fields=['expectedEditingScope','expectedSafeBehavior','authorizedReplacements','preservedMaterialFacts','voiceConstraints','ambiguity','missingInformation','expectedCompletionDisposition'];
 const differing=fields.filter(k=>canonical(a[k])!==canonical(b[k]));
 if(differing.length) disagreements.push({caseId:id,fields:differing});
}
const distributionReport={primaryStratum:primaryCounts,creator:creatorCounts,lengthBand:lengthCounts,genre:genreCounts,secondaryTags:cases.flatMap(x=>x.secondaryTags).reduce((a,t)=>(a[t]=(a[t]||0)+1,a),{})};
console.log(JSON.stringify({status:failures.length?'FAIL':'PASS',frozenDir,caseCount:cases.length,reviewerCounts:reviewers.map(x=>x.length),distributionReport,disagreementCaseCount:disagreements.length,disagreements,failures},null,2));
if(failures.length) process.exitCode=1;
