"""Read-only validation of frozen human judgments, unblinding and expansion plan."""
import hashlib
import json
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ARTIFACTS = REPO / "data/experiments/editorial-intelligence-v1/pilot-human-review"
RUN = REPO / ".evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1"


def read(path):
    return json.loads(path.read_bytes())


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


freeze = read(ARTIFACTS / "judgment-freeze.json")
judgments = read(ARTIFACTS / "judgments.final.json")
assert sha(ARTIFACTS / "judgments.final.json") == freeze["judgmentSha256"]
assert sha(ARTIFACTS / "comparison-packets.json") == freeze["packetSha256"]
assert freeze["frozenBeforeAgentOpenedPrivateMapping"] and freeze["userAttestedFinalizedBeforeUnblinding"]
assert judgments["status"] == "FINALIZED_BEFORE_UNBLINDING"
assert judgments["packetSha256"] == freeze["packetSha256"]
assert {row["caseId"] for row in judgments["judgments"]} == {"EI-001", "EI-003"}
for row in judgments["judgments"]:
    assert row["finalized"]
    assert row["overallPreference"] == ("Y" if row["caseId"] == "EI-003" else "TIE")
    assert row["confidence"] == ("MEDIUM" if row["caseId"] == "EI-003" else "HIGH")
    for label in ("X", "Y"):
        assert row[label] == {"naturalness": 5, "voiceFidelity": 5, "meaningIntegrity": "SAFE",
            "objectiveCompletion": "YES", "restraint": 5, "materialDefects": [], "evidence": []}
    assert all(row[field] is None for field in ("reason", "genuineImprovements", "superficialPolish", "uncertainty"))

holdout = read(REPO / "data/experiments/editorial-intelligence-v1/holdout.json")
manifest = read(RUN / "manifest.json")
order = sorted(holdout["cases"], key=lambda row: hashlib.sha256((manifest["protocol"]["blindSeed"] + row["id"]).encode()).hexdigest())
expected_mapping = [{"caseId": row["id"], "X": "A" if i % 2 == 0 else "B", "Y": "B" if i % 2 == 0 else "A",
    "fullHoldoutPosition": i} for i, row in enumerate(order) if row["id"] in ("EI-001", "EI-003")]
mapping = read(ARTIFACTS / "revealed-mapping.json")
assert mapping == expected_mapping == read(RUN / "private/exploratory-pilot-mapping.json")
packets = read(ARTIFACTS / "comparison-packets.json")
for packet in packets:
    assert set(packet) == {"caseId", "source", "objective", "X", "Y"}
    bound = next(row for row in mapping if row["caseId"] == packet["caseId"])
    for label in ("X", "Y"):
        stage = "direct" if bound[label] == "A" else "reconstruction"
        result = read(RUN / "attempts" / packet["caseId"] / stage / "result.json")
        assert result["status"] == "accepted" and result["output"]["data"]["text"] == packet[label]
    if packet["caseId"] == "EI-001":
        assert packet["X"] == packet["Y"] == packet["source"]

report = read(ARTIFACTS / "unblinded-report.json")
assert report["judgmentSha256"] == freeze["judgmentSha256"]
assert report["packetSha256"] == freeze["packetSha256"]
assert report["mappingSha256"] == sha(ARTIFACTS / "revealed-mapping.json")
assert datetime.fromisoformat(report["unblindedAt"]) > datetime.fromisoformat(freeze["recordedAt"])
assert report["preferenceCounts"] == {"direct": 1, "specialized": 0, "ties": 1}
assert report["decision"] == "B — DIRECT EDITING WINS EXPLORATORY PILOT"
assert not report["statisticalSignificanceClaim"] and report["newModelCallsThisPass"] == 0

plan = read(ARTIFACTS / "remaining-plan.json")
remaining = [row["id"] for row in holdout["cases"] if row["id"] not in ("EI-001", "EI-003")]
assert plan["caseOrder"] == remaining and len(remaining) == 10
for i, row in enumerate(holdout["cases"]):
    if row["id"] in remaining:
        expected = ["diagnosis", "reconstruction", "direct"] if i % 2 else ["direct", "diagnosis", "reconstruction"]
        assert plan["stageOrders"][row["id"]] == expected
assert sum(map(len, plan["stageOrders"].values())) == plan["stageCallsRemaining"] == 30
for name, fingerprint in plan["pinnedRepositoryFiles"].items():
    assert sha(REPO / name) == fingerprint
for name, fingerprint in plan["preservedRunFiles"].items():
    assert sha(RUN / name) == fingerprint

print(json.dumps({"frozenJudgments": 2, "ratingFieldsPreserved": 20, "packetFingerprintValid": True,
    "mappingsVerified": 2, "pilotDirectWins": 1, "pilotSpecializedWins": 0, "pilotTies": 1,
    "remainingCases": 10, "stageOrdersValid": 10, "stagesRemaining": 30,
    "preservedRunArtifacts": len(plan["preservedRunFiles"]), "pinnedRepositoryFiles": len(plan["pinnedRepositoryFiles"]),
    "newModelCalls": 0}))
