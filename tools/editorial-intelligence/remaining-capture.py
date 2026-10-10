"""File-only recorder for the remaining frozen cases; no CLI/model/network calls."""
import datetime
import hashlib
import json
import sys
import uuid
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / ".evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1"
PLAN_PATH = REPO / "data/experiments/editorial-intelligence-v1/pilot-human-review/remaining-plan.json"
PLAN_SHA256 = "568df57beeb9ccb60a98b7b4b611b4b85add6a8abf98cd185bf2641778039d0e"
CAPTURE = ROOT / "remaining-capture"


def now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save_new(path, value):
    with path.open("x") as file:
        json.dump(value, file, indent=2)
        file.write("\n")


def record():
    action, case, stage, *extra = sys.argv[1:]
    if case not in plan()["caseOrder"] or stage not in plan()["stageOrders"][case]:
        raise ValueError("Unknown pilot case or stage")
    name = f"{case}-{stage}"
    prefix = CAPTURE / name
    request = ROOT / "requests" / f"{name}.json"
    prompt = ROOT / "requests" / f"{name}.prompt.txt"
    template = ROOT / "requests" / f"{name}.metadata.json"
    response = Path(f"{prefix}.response.json")
    started = Path(f"{prefix}.started.json")
    provenance = Path(f"{prefix}.provenance.json")
    if action == "begin":
        for suffix in ("response.json", "events.jsonl", "stderr.txt", "started.json", "provenance.json"):
            if Path(f"{prefix}.{suffix}").exists():
                raise ValueError(f"Existing capture: {name}; no overwrite or retry")
        data = json.loads(request.read_bytes())
        meta = json.loads(template.read_bytes())
        expected = data["system"] + "\n\n" + json.dumps(data["payload"], ensure_ascii=False, indent=2) + "\n"
        if prompt.read_bytes() != expected.encode() or sha(request) != meta["requestSha256"]:
            raise ValueError("Exported prompt/request mismatch")
        if data["model"] != "gpt-6-astra":
            raise ValueError("Requested model differs from pinned Astra model")
        stages = plan()["stageOrders"][case]
        for previous in stages[:stages.index(stage)]:
            accepted(case, previous)
        save_new(started, {"classification": "EXPLORATORY", "caseId": case, "stage": stage,
            "startedAt": now(), "requestedModel": data["model"], "argv": extra,
            "cliVersion": (CAPTURE / "cli-version.txt").read_text().strip(),
            "attemptId": CAPTURE.name, "profile": plan()["profile"], "attemptSha256": sha(CAPTURE / "attempt.json"),
            "promptSha256": sha(prompt), "requestSha256": sha(request),
            "intendedConfig": data["intendedConfig"]})
        print(f"Prepared {name}; one manual CLI invocation authorized by the operator.")
        return
    if action != "end" or len(extra) != 1:
        raise ValueError("Use begin CASE STAGE ARGV... or end CASE STAGE EXIT_CODE")
    entry = json.loads(started.read_bytes())
    if sha(CAPTURE / "attempt.json") != entry["attemptSha256"]:
        raise ValueError("Attempt identity changed after begin")
    events_path = Path(f"{prefix}.events.jsonl")
    events, invalid_lines = [], 0
    for line in events_path.read_text().splitlines():
        try:
            event = json.loads(line)
            if isinstance(event, dict):
                events.append(event)
        except json.JSONDecodeError:
            invalid_lines += 1
    reports = []
    for index, event in enumerate(events):
        # Preserve explicitly reported fields only; never infer from argv or prose.
        for label, value in [("model", event.get("model")),
                             ("response.model", event.get("response", {}).get("model") if isinstance(event.get("response"), dict) else None)]:
            if isinstance(value, str) and value:
                reports.append({"eventIndex": index, "field": label, "value": value})
    identities = sorted({row["value"] for row in reports})
    usage_rows = [event.get("usage") for event in events if event.get("type") == "turn.completed"]
    usage = usage_rows[0] if len(usage_rows) == 1 and isinstance(usage_rows[0], dict) else {}
    def count(key):
        value = usage.get(key)
        return value if type(value) is int and value >= 0 else None
    failed_event = any(event.get("type") in {"error", "turn.failed"} for event in events)
    completed = now()
    entry.update({"completedAt": completed, "exitCode": int(extra[0]), "failedEvent": failed_event,
        "reportedModelFields": reports, "independentlyVerifiedModel": None,
        "responseSha256": sha(response) if response.exists() else None,
        "eventsSha256": sha(events_path), "stderrSha256": sha(Path(f"{prefix}.stderr.txt")),
        "invalidEventLines": invalid_lines, "reportedUsage": usage,
        "limitations": ["EXPLORATORY: no independently verified responding model identity.",
            "No CLI output cap established; intended caps are not claimed enforced.",
            "Optional tools restricted; built-in shell and inherited MCP/apps may remain available.",
            "Account rules, hooks, guards and project instructions remain active.",
            "Fresh ephemeral invocation; inherited context and internal provider retries are not independently verified.",
            "Start/end timestamps bound the local invocation, not provider inference latency."]})
    save_new(provenance, entry)
    if int(extra[0]) != 0 or failed_event or not response.exists():
        raise ValueError(f"{name} failed; stop, retain evidence, do not retry or substitute models")
    if any(model != "gpt-6-astra" for model in identities):
        raise ValueError("CLI reported a different model; stop without importing")
    metadata = json.loads(template.read_bytes())
    metadata.update({"selectedModel": "gpt-6-astra", "returnedModel": identities[0] if len(identities) == 1 else None,
        "tokens": {"input": count("input_tokens"), "output": count("output_tokens"), "reasoning": count("reasoning_output_tokens")},
        "startedAt": entry["startedAt"], "completedAt": completed,
        "configEvidence": "EXPLORATORY; requested flags, client-reported fields, fingerprints and limitations in " + provenance.name +
            ". Profile " + plan()["profile"] + "; attempt " + CAPTURE.name + ". Actual configuration remains unknown where not independently observed; no output cap is claimed."})
    # response bytes are never parsed, transformed or rewritten by this recorder.
    Path(f"{prefix}.metadata.json").write_text(json.dumps(metadata, indent=2) + "\n")
    print(f"Recorded {name}: EXPLORATORY; response preserved; unknown identity/accounting remains null.")


def plan():
    if sha(PLAN_PATH) != PLAN_SHA256:
        raise ValueError("Frozen expansion plan changed")
    return json.loads(PLAN_PATH.read_bytes())


def accepted(case, stage):
    directory = ROOT / "attempts" / case / stage
    result = json.loads((directory / "result.json").read_bytes())
    if result["status"] != "accepted":
        raise ValueError(f"{case} {stage} was rejected; retain evidence and stop")
    for name, field in [("response.raw", "rawSha256"), ("metadata.raw.json", "metadataSha256")]:
        if sha(directory / name) != result[field]:
            raise ValueError("Accepted artifact changed")
    if sha(ROOT / "requests" / f"{case}-{stage}.json") != result["requestSha256"]:
        raise ValueError("Accepted request changed")
    if json.loads((directory / "response.raw").read_bytes()) != result["output"]["data"]:
        raise ValueError("Accepted output binding changed")


def verify():
    data = plan()
    for path, fingerprint in data["pinnedRepositoryFiles"].items():
        if sha(REPO / path) != fingerprint:
            raise ValueError(f"Frozen input changed: {path}")
    for path, fingerprint in data["preservedRunFiles"].items():
        if sha(ROOT / path) != fingerprint:
            raise ValueError(f"Existing pilot evidence changed: {path}")
    manifest = json.loads((ROOT / "manifest.json").read_bytes())
    if sha(ROOT / "holdout.json") != manifest["holdoutSha256"]:
        raise ValueError("Pinned holdout changed")
    for case in ("EI-001", "EI-003"):
        for stage in ("direct", "diagnosis", "reconstruction"):
            accepted(case, stage)


def pending(ignore_capture=None):
    data = plan()
    for case in data["caseOrder"]:
        for stage in data["stageOrders"][case]:
            directory = ROOT / "attempts" / case / stage
            if directory.exists():
                accepted(case, stage)
                continue
            for path in (ROOT / "remaining-capture").glob("*/attempt.json"):
                if ignore_capture is not None and path.parent.resolve() == ignore_capture.resolve():
                    continue
                prior = json.loads(path.read_bytes())
                if prior["caseId"] == case and prior["stage"] == stage:
                    raise ValueError(f"Unfinished capture {path.parent.name}; preserve it and review before retrying")
            return case, stage
    return None


def capture(path):
    folder = Path(path).resolve()
    if folder.parent != (ROOT / "remaining-capture").resolve():
        raise ValueError("Invalid capture directory")
    return folder


def expected_argv(case, stage, folder):
    return ["env", "CODEX_HOME=" + str(Path.home() / plan()["profileDirectoryName"]),
        "/opt/homebrew/bin/codex", "exec", "--model", "gpt-6-astra", "--sandbox", "read-only", "--ephemeral", "--json",
        "--output-last-message", str(folder / f"{case}-{stage}.response.json"),
        "-c", 'model_reasoning_effort="high"', "-c", 'web_search="disabled"',
        "-c", "features.multi_agent=false", "-c", "features.memories=false",
        "-c", "apps._default.enabled=false", "-c", "tools.view_image=false", "-"]


def main():
    global CAPTURE
    verify()
    action, *args = sys.argv[1:]
    if action in ("next", "validate") and not args:
        upcoming = pending()
        if action == "validate":
            print(json.dumps({"originalPilotResponsesVerified": 6, "remainingCases": len(plan()["caseOrder"]),
                "nextStage": upcoming, "newModelCalls": 0, "frozenInputsValid": True}))
        elif upcoming:
            print("\t".join(upcoming))
        return
    if action == "reserve":
        case, stage = args
        if pending() != (case, stage):
            raise ValueError("Not the next unfinished stage in the frozen order; no regeneration")
        if not (ROOT / "requests" / f"{case}-{stage}.prompt.txt").is_file():
            raise ValueError("Next prompt is not available; prior import must finish first")
        version = (ROOT / "remaining-cli-version.txt").read_bytes()
        folder = ROOT / "remaining-capture" / (datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ") + "-" + uuid.uuid4().hex[:12])
        folder.mkdir(parents=True)
        save_new(folder / "attempt.json", {"caseId": case, "stage": stage, "attemptId": folder.name,
            "profile": plan()["profile"], "classification": "EXPLORATORY", "requestedModel": "gpt-6-astra"})
        (folder / "cli-version.txt").write_bytes(version)
        print(str(folder))
        return
    if action in ("begin", "end"):
        folder_text, *remaining = args
        CAPTURE = capture(folder_text)
        attempt = json.loads((CAPTURE / "attempt.json").read_bytes())
        case, stage = attempt["caseId"], attempt["stage"]
        if attempt != {"caseId": case, "stage": stage, "attemptId": CAPTURE.name,
            "profile": plan()["profile"], "classification": "EXPLORATORY", "requestedModel": "gpt-6-astra"}:
            raise ValueError("Attempt identity/profile does not match reserved capture")
        if pending(ignore_capture=CAPTURE) != (case, stage):
            raise ValueError("Capture is not the next unfinished stage")
        if (ROOT / "attempts" / case / stage).exists():
            raise ValueError("Stage already imported; never regenerate")
        if action == "begin":
            argv = remaining
            if argv != expected_argv(case, stage, CAPTURE):
                raise ValueError("Invocation differs from the exact recorded profile/model/settings; conflicting overrides prohibited")
        elif len(remaining) != 1:
            raise ValueError("end requires CLI exit code")
        sys.argv = ["remaining-capture.py", action, case, stage, *remaining]
        record()
        return
    raise ValueError("Use next, validate, reserve CASE STAGE, begin CAPTURE ARGV..., or end CAPTURE EXIT_CODE")


if __name__ == "__main__":
    main()
