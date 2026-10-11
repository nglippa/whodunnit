"""File-only recorder for the user-run semantic discrimination probe.

This module never starts subprocesses, invokes models, or uses the network.
"""

import datetime
import hashlib
import json
import re
import sys
import time
import uuid
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
RUN = REPO / ".evaluations/semantic-discrimination-probe-v1"
MANIFEST = RUN / "manifest.json"
INSTRUCTIONS = REPO / "data/experiments/semantic-discrimination-probe-v1/evidence-instructions.txt"
CAPTURES = RUN / "captures"
AUTHORIZATION = REPO / "data/experiments/semantic-discrimination-probe-v1/continuation-authorization.json"
AUTHORIZATION_SHA256 = "ad06403b2a38c23e178fd7b8ad11abc6a79cf7e4b358e268cb5e3ed5c8781850"
RETRY_ARCHIVE = RUN / "retries/SP-008/1"
RETRY_RESERVATION = RUN / "retry-reservation/SP-008"
REQUESTED_MODEL = "gpt-6.1-sol"
PROFILE = "codex3"
PROFILE_HOME = "/Users/nicholaslippa/.codex-account-3"
CLI = "/opt/homebrew/bin/codex"
ID = re.compile(r"^SP-\d{3}$")
EVIDENCE_FIELDS = {"proposition", "sourceQuote", "candidateQuote", "uncertainty"}
TOOL_ITEM_TYPES = {
    "command_execution",
    "file_change",
    "mcp_tool_call",
    "web_search",
    "image_generation",
    "computer_action",
    "tool_call",
}


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z")


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def digest(path):
    return digest_bytes(path.read_bytes())


def strict_text(path):
    return path.read_bytes().decode("utf-8", errors="strict")


def strict_json(path):
    return json.loads(strict_text(path))


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def save_new_bytes(path, value):
    with path.open("xb") as output:
        output.write(value)


def save_new_json(path, value):
    save_new_bytes(path, json_bytes(value))


def request_record(request_id):
    if not ID.fullmatch(request_id):
        raise ValueError("Invalid blinded request ID")
    manifest = strict_json(MANIFEST)
    requests = manifest.get("requests")
    if not isinstance(requests, list) or len(requests) != 12:
        raise ValueError("Manifest must contain exactly twelve requests")
    if len({row.get("id") for row in requests if isinstance(row, dict)}) != 12:
        raise ValueError("Manifest request IDs are invalid or duplicated")
    entry = next((row for row in requests if row.get("id") == request_id), None)
    if entry is None:
        raise ValueError("Unknown blinded request ID")
    request_path = RUN / "requests" / request_id / "request.json"
    prompt_path = RUN / "requests" / request_id / "prompt.txt"
    if digest(request_path) != entry.get("requestSha256"):
        raise ValueError("Frozen request fingerprint changed")
    if digest(prompt_path) != entry.get("promptSha256"):
        raise ValueError("Frozen prompt fingerprint changed")
    request = strict_json(request_path)
    if request.get("id") != request_id or request.get("requestedModel") != REQUESTED_MODEL:
        raise ValueError("Request identity or pinned model changed")
    settings = request.get("settings")
    if not isinstance(settings, dict) or settings.get("reasoningEffort") != "high":
        raise ValueError("Frozen request reasoning effort changed")
    payload = request.get("payload")
    if not isinstance(payload, dict) or not isinstance(payload.get("source"), str) or not isinstance(payload.get("candidate"), str):
        raise ValueError("Frozen request payload is invalid")
    return entry, request, request_path, prompt_path


def continuation():
    if digest(AUTHORIZATION) != AUTHORIZATION_SHA256:
        raise ValueError("Continuation authorization changed")
    authorization = strict_json(AUTHORIZATION)
    for relative, expected in authorization["originalFiles"].items():
        if digest(RUN / relative) != expected:
            raise ValueError("Original evidence changed: " + relative)
    if digest(INSTRUCTIONS) != authorization["evidenceInstructionSha256"]:
        raise ValueError("Original supplement changed")
    if strict_json(RUN / "imports/SP-008/validation.json")["status"] != "invalid":
        raise ValueError("SP-008 first attempt must remain INVALID")
    return authorization


def retry_label():
    authorization = continuation()
    return {"requestId": "SP-008", "ordinal": 1,
            "firstResponseSha256": authorization["firstResponseSha256"],
            "firstValidationSha256": authorization["firstValidationSha256"]}


def continuation_status(request_id):
    continuation()
    if request_id != "SP-008":
        return "accepted" if accepted_import(request_id) else "pending"
    if RETRY_ARCHIVE.exists():
        status = strict_json(RETRY_ARCHIVE / "validation.json")["status"]
        if status not in {"accepted", "invalid"}:
            raise ValueError("Unknown retry archive status")
        return "retry-" + status
    if RETRY_RESERVATION.exists():
        return "retry-used-unimported"
    return "retry-pending"


def accepted_import(request_id):
    imported = RUN / "imports" / request_id
    if not imported.exists():
        return False
    validation = imported / "validation.json"
    if not validation.is_file() or strict_json(validation).get("status") != "accepted":
        raise ValueError(f"Existing import for {request_id} is not accepted; stop without retrying")
    return True


def expected_argv(capture):
    return [
        "env",
        f"CODEX_HOME={PROFILE_HOME}",
        CLI,
        "exec",
        "--model",
        REQUESTED_MODEL,
        "--sandbox",
        "read-only",
        "--ephemeral",
        "--json",
        "--output-last-message",
        str(capture / "response.raw"),
        "-c",
        'model_reasoning_effort="high"',
        "-c",
        'web_search="disabled"',
        "-c",
        "features.multi_agent=false",
        "-c",
        "features.memories=false",
        "-c",
        "apps._default.enabled=false",
        "-c",
        "tools.view_image=false",
        "-",
    ]


def prepare(request_id, cli_version, retry=False):
    authorization = continuation()
    if retry and request_id != "SP-008":
        raise ValueError("Only SP-008 has one authorized retry")
    if not retry and request_id == "SP-008":
        raise ValueError("SP-008 first attempt remains INVALID; use explicit prepare-retry")
    if not retry and accepted_import(request_id):
        raise ValueError(f"{request_id} is already accepted; do not invoke it again")
    entry, request, request_path, prompt_path = request_record(request_id)
    prior_root = CAPTURES / request_id
    if not retry and prior_root.exists() and any(prior_root.iterdir()):
        raise ValueError(f"A prior capture exists for {request_id}; retain it and stop without retrying")
    if not isinstance(cli_version, str) or not cli_version.strip():
        raise ValueError("Missing user-observed CLI version")

    capture = prior_root / uuid.uuid4().hex
    if retry:
        # Atomic one-slot reservation: failures/crashes never authorize another attempt.
        RETRY_RESERVATION.mkdir(parents=True, exist_ok=False)
        save_new_json(RETRY_RESERVATION / "reservation.json", {"captureDirectory": str(capture.relative_to(RUN)), "retry": retry_label()})
        if capture.relative_to(RUN).as_posix() == authorization["originalCaptureDirectory"]:
            raise ValueError("Retry cannot reuse first capture")
    capture.mkdir(parents=True, exist_ok=False)
    argv = expected_argv(capture)

    prompt_bytes = prompt_path.read_bytes()
    instruction_bytes = INSTRUCTIONS.read_bytes()
    instruction_bytes.decode("utf-8", errors="strict")
    effective_bytes = prompt_bytes + instruction_bytes
    save_new_bytes(capture / "effective.prompt.txt", effective_bytes)
    started_at = utc_now()
    attempt = {
        "id": request_id,
        "requestedModel": REQUESTED_MODEL,
        "profile": PROFILE,
        "cliVersion": cli_version.strip(),
        "reasoningEffort": "high",
        "requestSha256": entry["requestSha256"],
        "promptSha256": entry["promptSha256"],
        "effectivePromptSha256": digest_bytes(effective_bytes),
        "evidenceInstructionSha256": digest_bytes(instruction_bytes),
        "startedAt": started_at,
        "startedEpochMs": time.time_ns() // 1_000_000,
        "argv": argv,
        "requestPath": str(request_path.relative_to(REPO)),
        "promptPath": str(prompt_path.relative_to(REPO)),
        "limitations": [
            "The requested model and reasoning effort are invocation settings, not independent provider attestations.",
            "The effective prompt appends separately hashed evidence-format instructions to the unchanged frozen prompt bytes.",
            "Tools and session memory are requested disabled; actual provider configuration is unknown unless explicitly reported.",
        ],
    }
    if retry:
        attempt["retry"] = retry_label()
    save_new_json(capture / "attempt.json", attempt)
    print(str(capture))


def check_argv(capture_text, argv):
    capture = Path(capture_text).resolve()
    if capture.parent.parent != CAPTURES.resolve() or not ID.fullmatch(capture.parent.name):
        raise ValueError("Invalid capture directory layout")
    attempt = strict_json(capture / "attempt.json")
    if attempt.get("argv") != expected_argv(capture) or argv != attempt.get("argv"):
        raise ValueError("Invocation differs from the exact reserved profile/model/settings")


def parse_events(path):
    text = strict_text(path)
    events = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line:
            raise ValueError(f"Blank JSONL event line {line_number}")
        try:
            event = json.loads(line)
        except json.JSONDecodeError as error:
            raise ValueError(f"Invalid JSONL event line {line_number}") from error
        if not isinstance(event, dict):
            raise ValueError(f"Non-object JSONL event line {line_number}")
        events.append(event)
    if not events:
        raise ValueError("No CLI JSONL events were captured")
    return events


def reported_models(events):
    reports = []
    for index, event in enumerate(events):
        for field, value in (
            ("model", event.get("model")),
            ("response.model", event.get("response", {}).get("model") if isinstance(event.get("response"), dict) else None),
        ):
            if isinstance(value, str) and value:
                reports.append({"eventIndex": index, "field": field, "value": value})
    return reports


def used_tool(events):
    for event in events:
        event_type = event.get("type")
        if isinstance(event_type, str) and (event_type in TOOL_ITEM_TYPES or event_type.startswith("tool.")):
            return True
        item = event.get("item")
        if isinstance(item, dict) and item.get("type") in TOOL_ITEM_TYPES:
            return True
    return False


def observed_usage(events):
    completed = [event for event in events if event.get("type") == "turn.completed"]
    if len(completed) != 1 or not isinstance(completed[0].get("usage"), dict):
        return {"input": None, "output": None, "reasoning": None}, None
    usage = completed[0]["usage"]

    def count(key):
        value = usage.get(key)
        return value if type(value) is int and value >= 0 else None

    return {
        "input": count("input_tokens"),
        "output": count("output_tokens"),
        "reasoning": count("reasoning_output_tokens"),
    }, usage


def utf16_length(value):
    return len(value.encode("utf-16-le")) // 2


def validate_evidence(response, request):
    if not isinstance(response, dict):
        raise ValueError("Raw response must be a JSON object")
    reason = response.get("reason")
    if not isinstance(reason, str) or utf16_length(reason) > 300:
        raise ValueError("Response reason must be a JSON string within the existing 300-character limit")
    try:
        evidence = json.loads(reason)
    except json.JSONDecodeError as error:
        raise ValueError("Response reason is not valid evidence JSON") from error
    if not isinstance(evidence, dict) or set(evidence) != EVIDENCE_FIELDS:
        raise ValueError("Evidence JSON must contain exactly proposition, sourceQuote, candidateQuote, and uncertainty")
    proposition = evidence["proposition"]
    source_quote = evidence["sourceQuote"]
    candidate_quote = evidence["candidateQuote"]
    uncertainty = evidence["uncertainty"]
    if not isinstance(proposition, str) or not proposition.strip():
        raise ValueError("Evidence proposition must be a nonempty string")
    if not isinstance(source_quote, str) or not source_quote or source_quote not in request["payload"]["source"]:
        raise ValueError("Evidence sourceQuote must be an exact nonempty source substring")
    if candidate_quote is not None and (
        not isinstance(candidate_quote, str)
        or not candidate_quote
        or candidate_quote not in request["payload"]["candidate"]
    ):
        raise ValueError("Evidence candidateQuote must be an exact nonempty candidate substring or null")
    if uncertainty is not None and (not isinstance(uncertainty, str) or not uncertainty.strip()):
        raise ValueError("Evidence uncertainty must be a nonempty string or null")
    return candidate_quote is None


def finish(capture_text, exit_code_text):
    capture = Path(capture_text).resolve()
    try:
        capture.relative_to(CAPTURES.resolve())
    except ValueError as error:
        raise ValueError("Capture directory is outside the probe capture root") from error
    if capture.parent.parent != CAPTURES.resolve() or not ID.fullmatch(capture.parent.name):
        raise ValueError("Invalid capture directory layout")
    attempt_path = capture / "attempt.json"
    attempt = strict_json(attempt_path)
    request_id = capture.parent.name
    if attempt.get("id") != request_id or attempt.get("profile") != PROFILE:
        raise ValueError("Capture identity changed after reservation")
    entry, request, _, _ = request_record(request_id)
    if attempt.get("requestSha256") != entry["requestSha256"] or attempt.get("promptSha256") != entry["promptSha256"]:
        raise ValueError("Frozen request identity changed after reservation")
    if digest(capture / "effective.prompt.txt") != attempt.get("effectivePromptSha256"):
        raise ValueError("Effective prompt changed after reservation")

    if attempt.get("retry") is not None:
        if request_id != "SP-008" or attempt["retry"] != retry_label():
            raise ValueError("Retry label or original binding changed")
        reservation = strict_json(RETRY_RESERVATION / "reservation.json")
        if reservation["captureDirectory"] != str(capture.relative_to(RUN)):
            raise ValueError("Retry capture differs from reservation")
    completed_at = utc_now()
    wall_duration_ms = max(0, time.time_ns() // 1_000_000 - int(attempt["startedEpochMs"]))
    exit_code = int(exit_code_text)
    events_path = capture / "events.jsonl"
    response_path = capture / "response.raw"
    stderr_path = capture / "stderr.txt"
    failures = []
    events = []
    try:
        events = parse_events(events_path)
    except (OSError, UnicodeError, ValueError) as error:
        failures.append(str(error))
    reports = reported_models(events)
    identities = sorted({report["value"] for report in reports})
    reported_model = identities[0] if len(identities) == 1 else None
    if exit_code != 0:
        failures.append(f"CLI exited with status {exit_code}")
    if any(event.get("type") in {"error", "turn.failed"} for event in events):
        failures.append("CLI emitted an error or turn.failed event")
    if len([event for event in events if event.get("type") == "turn.completed"]) != 1:
        failures.append("CLI did not report exactly one completed verification turn")
    if used_tool(events):
        failures.append("CLI emitted a tool-use event")
    if any(identity != REQUESTED_MODEL for identity in identities):
        failures.append("CLI reported a substituted model")
    if len(identities) > 1:
        failures.append("CLI reported conflicting model identities")
    response = None
    candidate_quote_missing = None
    if not response_path.is_file():
        failures.append("CLI did not produce response.raw")
    else:
        try:
            response = json.loads(strict_text(response_path))
            candidate_quote_missing = validate_evidence(response, request)
        except (UnicodeError, json.JSONDecodeError, ValueError) as error:
            failures.append(str(error))

    tokens, reported_usage = observed_usage(events)
    provenance = {
        "id": request_id,
        "requestedModel": REQUESTED_MODEL,
        "reportedModel": reported_model,
        "reportedModelFields": reports,
        "profile": PROFILE,
        "cliVersion": attempt["cliVersion"],
        "reasoningEffort": "high",
        "requestSha256": entry["requestSha256"],
        "promptSha256": entry["promptSha256"],
        "effectivePromptSha256": attempt["effectivePromptSha256"],
        "evidenceInstructionSha256": attempt["evidenceInstructionSha256"],
        "responseSha256": digest(response_path) if response_path.is_file() else None,
        "eventsSha256": digest(events_path) if events_path.is_file() else None,
        "stderrSha256": digest(stderr_path) if stderr_path.is_file() else None,
        "startedAt": attempt["startedAt"],
        "completedAt": completed_at,
        "wallDurationMs": wall_duration_ms,
        "exitCode": exit_code,
        "argv": attempt["argv"],
        "reportedUsage": reported_usage,
        "candidateQuoteWasNull": candidate_quote_missing,
        "failures": failures,
        "limitations": attempt["limitations"] + [
            "Reported model identity is taken only from CLI JSONL model or response.model fields and is not independently verified.",
            "Token counts are copied only from one turn.completed usage object; unavailable values remain null.",
            "Wall duration covers the local CLI process and is not provider inference latency.",
            "No cost or provider latency is inferred.",
            "A null candidateQuote records the model's claimed absence and still requires human localization audit.",
        ],
    }
    if attempt.get("retry") is not None:
        provenance["retry"] = attempt["retry"]
    provenance_path = capture / "provenance.json"
    save_new_json(provenance_path, provenance)
    if failures:
        raise ValueError("; ".join(failures) + "; evidence archived, stop without retrying")

    capture_relative = str(capture.relative_to(RUN))
    metadata = {
        "requestSha256": entry["requestSha256"],
        "promptSha256": entry["promptSha256"],
        "responseSha256": digest(response_path),
        "requestedModel": REQUESTED_MODEL,
        "reportedModel": reported_model,
        "identityEvidence": "CLI JSONL model fields only; unknown when absent and never independently verified",
        "authenticatedExecutionPath": "User terminal Codex CLI with per-process codex3 profile selection",
        "operator": "user-terminal",
        "configuration": {"reasoningEffort": None, "maxOutputTokens": None, "tools": None, "sessionMemory": None},
        "tokens": tokens,
        "latencyMs": None,
        "costUsd": None,
        "requestId": None,
        "limitations": "See hashed capture provenance; actual provider configuration, identity, latency, cost, and null-quote localization remain unverified.",
        "execution": {
            "captureDirectory": capture_relative,
            "profile": PROFILE,
            "cliVersion": attempt["cliVersion"],
            "reasoningEffort": "high",
            "evidenceInstructionSha256": attempt["evidenceInstructionSha256"],
            "effectivePromptSha256": attempt["effectivePromptSha256"],
            "eventsSha256": digest(events_path),
            "provenanceSha256": digest(provenance_path),
        },
    }
    if attempt.get("retry") is not None:
        metadata["retry"] = attempt["retry"]
    save_new_json(capture / "metadata.raw.json", metadata)
    print(str(capture / "metadata.raw.json"))


def main():
    if len(sys.argv) < 2:
        raise ValueError("Use ids, status ID, prepare ID CLI_VERSION, check-argv CAPTURE ARGV..., or finish CAPTURE EXIT_CODE")
    action, *args = sys.argv[1:]
    if action == "ids" and not args:
        manifest = strict_json(MANIFEST)
        for row in manifest.get("requests", []):
            request_record(row.get("id", ""))
            print(row["id"])
        return
    if action == "status" and len(args) == 1:
        request_record(args[0])
        print(continuation_status(args[0]))
        return
    if action in {"prepare", "prepare-retry"} and len(args) == 2:
        prepare(args[0], args[1], retry=action == "prepare-retry")
        return
    if action == "check-argv" and len(args) >= 2:
        check_argv(args[0], args[1:])
        return
    if action == "finish" and len(args) == 2:
        finish(args[0], args[1])
        return
    raise ValueError("Use ids, status ID, prepare ID CLI_VERSION, check-argv CAPTURE ARGV..., or finish CAPTURE EXIT_CODE")


if __name__ == "__main__":
    main()
