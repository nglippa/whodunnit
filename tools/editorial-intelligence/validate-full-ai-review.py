"""Validate frozen supplied judgments and already-unblinded artifact bindings.

File-only verification; no inference, judging, or modification of any artifact.
Run only after the freeze/unblind pass has completed.
"""
import datetime
import hashlib
import json
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / 'data/experiments/editorial-intelligence-v1/full-ai-review'
RUN = REPO / '.evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1'


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


freeze = read(OUT / 'judgment-freeze.json')
assert sha(OUT / 'judgments.final.json') == freeze['judgmentSha256']
assert sha(OUT / 'comparison-packets.json') == freeze['packetSha256']
assert sha(OUT / 'authoritative-results.json') == freeze['authoritativeResultsSha256']
assert freeze['pilotJudgmentSha256'] == '76ab71696d62b08fd70134ec0da94a5190b17065ab37f01eb15e2680ad92adf0'
pilot_path = REPO / 'data/experiments/editorial-intelligence-v1/pilot-human-review/judgments.final.json'
assert sha(pilot_path) == freeze['pilotJudgmentSha256']
assert (OUT / 'pilot-judgments.original.json').read_bytes() == pilot_path.read_bytes()
final = read(OUT / 'judgments.final.json')
judgments = {j['caseId']: j for j in final['judgments']}
assert len(final['judgments']) == len(judgments) == 12
for j in read(pilot_path)['judgments']:
    assert judgments[j['caseId']] == j
supplied = read(OUT / 'authoritative-results.json')
assert supplied['reviewer'] == 'ChatGPT GPT-6'
assert supplied['reviewerType'] == 'AI editorial evaluator'
assert len(supplied['cases']) == 10
for row in supplied['cases']:
    j = judgments[row['caseId']]
    assert j['overallPreference'] == row['preference']
    assert j['confidence'] == row['confidence']
    assert j['reason'] == row['evidenceAndNotes']
    assert [j['X']['naturalness'], j['Y']['naturalness'], j['X']['voiceFidelity'],
            j['Y']['voiceFidelity'], j['X']['restraint'], j['Y']['restraint']] == row['ratings']
for j in judgments.values():
    assert j['finalized'] is True
    assert j['overallPreference'] in ['X', 'Y', 'TIE']
    assert j['confidence'] in ['HIGH', 'MEDIUM']
    for label in ['X', 'Y']:
        a = j[label]
        assert all(type(a[k]) is int and 1 <= a[k] <= 5
                   for k in ['naturalness', 'voiceFidelity', 'restraint'])
        assert a['meaningIntegrity'] == 'SAFE'
        assert a['objectiveCompletion'] == 'YES'
        assert a['materialDefects'] == []
        assert a['evidence'] == []  # No structured quotations were supplied.
packets = {p['caseId']: p for p in read(OUT / 'comparison-packets.json')}
assert len(packets) == 12
assert set(packets) == set(judgments)
for rel, fingerprint in final['provenance']['originalBlindRequestFingerprints'].items():
    request_path = RUN / rel
    assert sha(request_path) == fingerprint
    payload = read(request_path)['payload']
    assert set(payload) == {'caseId', 'source', 'objective', 'X', 'Y', 'schema'}
    assert packets[payload['caseId']] == {k: payload[k] for k in packets[payload['caseId']]}
for p in packets.values():
    assert set(p) == {'caseId', 'source', 'objective', 'X', 'Y'}
    if judgments[p['caseId']]['overallPreference'] in ['X', 'Y']:
        assert p[judgments[p['caseId']]['overallPreference']] is not None
# Validate archived imports without regenerating or rewriting them.
for case in packets:
    for stage in ['direct', 'diagnosis', 'reconstruction']:
        directory = RUN / 'attempts' / case / stage
        result = read(directory / 'result.json')
        assert result['status'] == 'accepted'
        assert sha(directory / 'response.raw') == result['rawSha256']
        assert sha(directory / 'metadata.raw.json') == result['metadataSha256']
        assert sha(RUN / 'requests' / f'{case}-{stage}.json') == result['requestSha256']
        assert read(directory / 'response.raw') == result['output']['data']
report = read(OUT / 'unblinded-report.json')
assert report['judgmentSha256'] == freeze['judgmentSha256']
assert report['packetSha256'] == freeze['packetSha256']
assert report['freezeSha256'] == sha(OUT / 'judgment-freeze.json')
assert datetime.datetime.fromisoformat(freeze['frozenAt']) < datetime.datetime.fromisoformat(report['unblindedAt'])
assert sha(OUT / 'revealed-mapping.json') == report['mappingSha256']
assert (OUT / 'revealed-mapping.json').read_bytes() == (RUN / 'private/blind-mapping.json').read_bytes()
maps = read(OUT / 'revealed-mapping.json')
assert len(maps) == 12 and len({m['caseId'] for m in maps}) == 12
counts = {'direct': 0, 'specialized': 0, 'ties': 0}
rows = {r['caseId']: r for r in report['cases']}
assert len(rows) == len(report['cases']) == 12
holdout_types = {r['id']: r['stratum'] for r in read(RUN / 'holdout.json')['cases']}
strata = {}
for m in maps:
    c = m['caseId']
    j, p, row = judgments[c], packets[c], rows[c]
    assert {m['X'], m['Y']} == {'A', 'B'}
    assert row['caseType'] == holdout_types[c]
    for label in ['X', 'Y']:
        arm = 'direct' if m[label] == 'A' else 'specialized'
        stage = 'direct' if m[label] == 'A' else 'reconstruction'
        assert p[label] == read(RUN / 'attempts' / c / stage / 'result.json')['output']['data']['text']
        assert row[label + 'Arm'] == arm
        assert row[arm + 'Assessment'] == j[label]
    assert row['blindPreference'] == j['overallPreference']
    assert row['confidence'] == j['confidence']
    assert row['reason'] == j['reason']
    assert row['uncertainty'] == j['uncertainty']
    assert row['identicalFinals'] == (p['X'] == p['Y'])
    winner = 'ties' if j['overallPreference'] == 'TIE' else ('direct' if m[j['overallPreference']] == 'A' else 'specialized')
    assert row['result'] == ('TIE' if winner == 'ties' else winner)
    counts[winner] += 1
    s = strata.setdefault(holdout_types[c], {'cases': 0, 'directWins': 0, 'specializedWins': 0,
        'ties': 0, 'directSafe': 0, 'specializedSafe': 0, 'directComplete': 0, 'specializedComplete': 0})
    s['cases'] += 1
    s[{'direct': 'directWins', 'specialized': 'specializedWins', 'ties': 'ties'}[winner]] += 1
    for arm in ['direct', 'specialized']:
        s[arm + 'Safe'] += row[arm + 'Assessment']['meaningIntegrity'] == 'SAFE'
        s[arm + 'Complete'] += row[arm + 'Assessment']['objectiveCompletion'] == 'YES'
assert counts == report['counts'] == {'direct': 5, 'specialized': 0, 'ties': 7}
assert strata == report['caseTypes']
for arm in ['direct', 'specialized']:
    assert report['safety'][arm] == {'safe': 12, 'total': 12, 'unsafe': 0, 'uncertain': 0, 'rate': 1.0}
    assert report['objectiveCompletion'][arm] == {'yes': 12, 'total': 12, 'partial': 0, 'no': 0, 'uncertain': 0, 'rate': 1.0}
assert report['confirmedMaterialDefects'] == 0
assert report['newModelInvocations'] == 0
assert report['statisticalSignificanceClaim'] is False
print(json.dumps({'frozenJudgments': 12, 'exactNewRatingFields': 60, 'pilotJudgmentsUnchanged': 2,
    'acceptedImportsVerified': 36, 'blindPacketBindings': 12, 'mappingFinalBindings': 24,
    'caseTypesVerified': 6, 'preferences': counts, 'freezeBeforeFullUnblinding': True,
    'safety': '12/12 each', 'objectiveCompletion': '12/12 each', 'newModelInvocations': 0}))
