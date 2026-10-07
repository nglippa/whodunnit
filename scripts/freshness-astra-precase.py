#!/usr/bin/env python3
"""Build and run the frozen, custodian-only Astra corpus lexical screen.

This script never sends text to a model or network. The exclusion inventory is
derived from the registered parent commit, not from mutable worktree files.
Its JSON manifest contains hashes and pointers, never excluded prose.
"""

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
import sys
import unicodedata


ROOT = pathlib.Path(__file__).resolve().parents[1]
ANCHOR = "6fd5809efb4e33449c6c9268316aabb90b016920"
EXPERIMENT = "astra-control-fresh-48-v1"
MIN_REFERENCE_TOKENS = 6
SHINGLE_WIDTH = 6


def git(*args):
    return subprocess.check_output(["git", *args], cwd=ROOT)


def sha256(value):
    if isinstance(value, str):
        value = value.encode("utf-8")
    return hashlib.sha256(value).hexdigest()


def normalize(value):
    value = unicodedata.normalize("NFC", value).casefold()
    return " ".join(value.split())


def tokens(value):
    out = []
    current = []
    for char in normalize(value):
        if unicodedata.category(char)[0] in ("L", "N"):
            current.append(char)
        elif current:
            out.append("".join(current))
            current = []
    if current:
        out.append("".join(current))
    return out


def shingles(value):
    ts = tokens(value)
    return {sha256("\x1f".join(ts[i:i + SHINGLE_WIDTH])) for i in range(len(ts) - SHINGLE_WIDTH + 1)}


def selected_path(path):
    if path.startswith("data/evaluation/astra-control-fresh-48-v1/"):
        return False
    if path.startswith("data/evaluation/"):
        return True
    if path.startswith(("data/fixtures/", "data/rules/packs/", "tools/eval/")):
        return True
    if path.startswith("docs/") and path.endswith(".md"):
        return True
    return path.startswith(("src/", "tools/")) and (path.endswith(".test.ts") or "fixture" in path.lower() or path == "src/lib/prompts/index.ts")


def source_blobs():
    current = []
    for row in git("ls-tree", "-r", "-z", ANCHOR).split(b"\0"):
        if not row:
            continue
        header, encoded_path = row.split(b"\t", 1)
        path = encoded_path.decode()
        if selected_path(path):
            current.append((path, header.decode().split()[2], "anchor_commit"))
    seen = {(path, blob) for path, blob, _ in current}
    historical = []
    for row in git("rev-list", "--objects", ANCHOR, "--", "data/evaluation", "data/fixtures", "data/rules/packs", "docs", "src", "tools/eval", "tools").decode().splitlines():
        if " " not in row:
            continue
        blob, path = row.split(" ", 1)
        if not selected_path(path) or (path, blob) in seen:
            continue
        if git("cat-file", "-t", blob).strip() != b"blob":
            continue
        seen.add((path, blob))
        historical.append((path, blob, "historical_ancestor_blob"))
    return sorted(current) + sorted(historical)


def category(path):
    if "/holdout-v3/" in path:
        if "/frozen/cases.json" in path or "/inputs/frozen/cases.json" in path:
            return "holdout_v3_case"
        if "/frozen/labels.json" in path or "/inputs/frozen/labels.json" in path:
            return "holdout_v3_prelabel"
        if any(word in path for word in ("editor-result", "repair-result", "editor-attempt", "repair-attempt", "reverify-result")):
            return "holdout_v3_raw_or_repair"
        if any(word in path for word in ("review", "audit", "packet", "response", "judgment")):
            return "holdout_v3_judgment_or_packet"
        return "holdout_v3_other_trace"
    if "/holdout-v2/" in path:
        return "holdout_v2_case" if "documents.json" in path else "holdout_v2_label_or_report"
    if "/holdout/" in path:
        return "holdout_v1_case" if "documents.json" in path else "holdout_v1_label_or_report"
    if "/post-v3-comparison/" in path:
        if path.endswith("/cases.json") or path.endswith("/prelabel-packet.json"):
            return "post_v3_40_case"
        if "/prelabels/" in path:
            return "post_v3_40_prelabel"
        if path.endswith("/raw.json") or "/raw-attempts/" in path:
            return "post_v3_40_raw_or_attempt"
        return "post_v3_40_report_or_investigation"
    if "/post-v3-successor/" in path or "successor" in path.lower():
        return "blocked_successor_case_like_or_method_evidence"
    if path.startswith("data/evaluation/cases/") or path == "data/evaluation/corpus.json":
        return "development_corpus"
    if path.startswith("data/evaluation/"):
        return "development_fixture_or_example"
    if "V14" in path or "V15" in path:
        return "v14_v15_validation_report_example"
    if path.startswith("docs/"):
        return "architecture_or_evaluation_report_example"
    return "test_or_prompt_embedded_example"


def reason(path):
    if "/post-v3-successor/" in path or "successor" in path.lower():
        return "possible case-like protocol example; old successor has no outcome evidence"
    if "/post-v3-comparison/" in path:
        return "prior 40-case source, objective, RAW, prelabel, failure or inspected report"
    if "/holdout" in path:
        return "prior holdout source, transformation, RAW, label, judgment or inspected example"
    return "prior development fixture, prompt, report or repeatedly inspectable example"


def inherited_id(value, current):
    if not isinstance(value, dict):
        return current
    for key in ("caseId", "corpusCaseId", "id", "fixtureId", "documentId"):
        if key in value and isinstance(value[key], (str, int)):
            return str(value[key])
    return current


def pointer_part(part):
    return str(part).replace("~", "~0").replace("/", "~1")


def string_entries(value, pointer="", case_id=None):
    if isinstance(value, dict):
        case_id = inherited_id(value, case_id)
        for key, child in value.items():
            yield from string_entries(child, pointer + "/" + pointer_part(key), case_id)
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from string_entries(child, pointer + "/" + str(index), case_id)
    elif isinstance(value, str) and len(tokens(value)) >= MIN_REFERENCE_TOKENS:
        yield pointer or "/", case_id, value


def text_entries(path, blob):
    try:
        content = blob.decode("utf-8")
    except UnicodeDecodeError:
        return
    if path.endswith(".json"):
        try:
            yield from string_entries(json.loads(content))
        except json.JSONDecodeError:
            return
    elif path.endswith(".jsonl"):
        for index, line in enumerate(content.splitlines()):
            try:
                yield from string_entries(json.loads(line), "/" + str(index))
            except json.JSONDecodeError:
                continue
    else:
        # Whole markdown/test files are references. Paragraphs keep review
        # pointers usable without copying text into this manifest.
        for index, paragraph in enumerate(re.split(r"\n\s*\n", content)):
            if len(tokens(paragraph)) >= MIN_REFERENCE_TOKENS:
                yield "/paragraph/" + str(index), None, paragraph


def build(out_path):
    artifacts = []
    grouped = {}
    for artifact_index, (path, blob_id, version) in enumerate(source_blobs()):
        blob = git("cat-file", "-p", blob_id)
        count = 0
        for pointer, case_id, value in text_entries(path, blob):
            t = tokens(value)
            normalized_hash = sha256(normalize(value))
            group = grouped.setdefault(normalized_hash, {
                "normalizedSha256": normalized_hash,
                "rawUtf8Sha256Variants": [],
                "tokenCount": len(t),
                "references": [],
            })
            raw_hash = sha256(value)
            if raw_hash not in group["rawUtf8Sha256Variants"]:
                group["rawUtf8Sha256Variants"].append(raw_hash)
            group["references"].append({
                "artifactIndex": artifact_index,
                "caseOrExampleId": case_id or path + "#" + pointer,
                "pointer": pointer,
            })
            count += 1
        artifacts.append({
            "logicalPath": path,
            "resolvedCanonicalPath": str((ROOT / path).resolve()),
            "exactFileBytesSha256": sha256(blob),
            "gitBlobId": blob_id,
            "version": version,
            "contentClass": category(path),
            "exclusionBasis": reason(path),
            "referenceEntryCount": count,
        })
    entries = list(grouped.values())
    result = {
        "schemaVersion": 1,
        "experimentId": EXPERIMENT,
        "artifact": "freshness-exclusion-manifest",
        "anchorCommit": ANCHOR,
        "source": "anchor-commit blobs and distinct historical ancestor blobs; excluded text never embedded",
        "normalization": "Unicode NFC, full casefold, whitespace collapse and trim",
        "tokenization": "maximal Unicode letter-or-number runs; underscore is separator",
        "shingleWidthTokens": SHINGLE_WIDTH,
        "minimumExtractedReferenceTokens": MIN_REFERENCE_TOKENS,
        "pythonVersion": sys.version.split()[0],
        "unicodeDataVersion": unicodedata.unidata_version,
        "screenImplementation": "scripts/freshness-astra-precase.py",
        "screenImplementationSha256": sha256(pathlib.Path(__file__).read_bytes()),
        "counts": {"sourceArtifacts": len(artifacts), "distinctReferenceTexts": len(entries), "referenceOccurrences": sum(len(x["references"]) for x in entries)},
        "coverageLimitations": [
            "This inventory resolves selected anchor-commit artifacts and their committed ancestor blobs; ignored files, external conversations and private creator memory are not enumerated.",
            "Machine entries are natural-language strings of at least six tokens, plus paragraph-level Markdown and test references; shorter distinctive facts require independent semantic review.",
            "A lexical nonmatch is not evidence of semantic novelty; every draft requires an independent semantic reviewer with controlled access to the old corpus and reports.",
        ],
        "artifacts": artifacts,
        "entries": entries,
    }
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(json.dumps(result["counts"], sort_keys=True))


def screened_fields(drafts):
    if not isinstance(drafts, list) or len(drafts) != 48:
        raise ValueError("screen requires exactly 48 draft records")
    seen = set()
    for draft in drafts:
        if not isinstance(draft, dict) or set(draft) != {"caseId", "source", "objective"}:
            raise ValueError("draft fields must be exactly caseId, source, objective")
        case_id = draft["caseId"]
        if not isinstance(case_id, str) or case_id in seen:
            raise ValueError("duplicate or invalid caseId")
        seen.add(case_id)
        for field in ("source", "objective"):
            value = draft[field]
            if not isinstance(value, str) or not value:
                raise ValueError("empty or non-string draft field")
            yield case_id, field, value


def screen(manifest_path, draft_path, output_path):
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest["anchorCommit"] != ANCHOR or manifest["experimentId"] != EXPERIMENT:
        raise ValueError("wrong exclusion manifest")
    if manifest["pythonVersion"] != sys.version.split()[0] or manifest["unicodeDataVersion"] != unicodedata.unidata_version:
        raise ValueError("frozen Python/Unicode runtime mismatch")
    if manifest["screenImplementationSha256"] != sha256(pathlib.Path(__file__).read_bytes()):
        raise ValueError("frozen screen implementation hash mismatch")
    historical = []
    for artifact in manifest["artifacts"]:
        path = artifact["logicalPath"]
        blob = git("cat-file", "-p", artifact["gitBlobId"])
        if sha256(blob) != artifact["exactFileBytesSha256"]:
            raise ValueError("excluded source hash mismatch: " + path)
        historical.extend((path, artifact["gitBlobId"], pointer, value) for pointer, _, value in text_entries(path, blob))
    if len(historical) != manifest["counts"]["referenceOccurrences"]:
        raise ValueError("reference count mismatch")
    drafts = list(screened_fields(json.loads(draft_path.read_text(encoding="utf-8"))))
    history_index = {}
    known_normalized = set()
    for path, blob_id, pointer, value in historical:
        normal_hash = sha256(normalize(value))
        if normal_hash in known_normalized:
            continue
        known_normalized.add(normal_hash)
        for shingle in shingles(value):
            history_index.setdefault(shingle, []).append((path, blob_id, pointer))
    findings = []
    for case_id, field, value in drafts:
        exact, normalized, grams = sha256(value), sha256(normalize(value)), shingles(value)
        for entry in manifest["entries"]:
            flags = []
            if exact in entry["rawUtf8Sha256Variants"]:
                flags.append("EXACT_DUPLICATE")
            if normalized == entry["normalizedSha256"]:
                flags.append("NORMALIZED_DUPLICATE")
            if flags:
                ref = entry["references"][0]
                artifact = manifest["artifacts"][ref["artifactIndex"]]
                findings.append({"caseId": case_id, "field": field, "referencePath": artifact["logicalPath"], "referenceGitBlobId": artifact["gitBlobId"], "referencePointer": ref["pointer"], "flags": flags})
        for gram in sorted(grams):
            for path, blob_id, pointer in history_index.get(gram, []):
                findings.append({"caseId": case_id, "field": field, "referencePath": path, "referenceGitBlobId": blob_id, "referencePointer": pointer, "flags": ["COMMON_SIX_TOKEN_SHINGLE"], "shingleSha256": gram})
    for i, (a_id, a_field, a_value) in enumerate(drafts):
        for b_id, b_field, b_value in drafts[i + 1:]:
            if a_id == b_id:
                continue
            flags = []
            if sha256(a_value) == sha256(b_value):
                flags.append("EXACT_DUPLICATE")
            if sha256(normalize(a_value)) == sha256(normalize(b_value)):
                flags.append("NORMALIZED_DUPLICATE")
            common = shingles(a_value) & shingles(b_value)
            if common:
                flags.append("COMMON_SIX_TOKEN_SHINGLE")
            if flags:
                findings.append({"caseId": a_id, "field": a_field, "peerCaseId": b_id, "peerField": b_field, "flags": flags, "commonShingleCount": len(common)})
    result = {
        "experimentId": EXPERIMENT,
        "artifact": "freshness-lexical-screen",
        "manifestSha256": sha256(manifest_path.read_bytes()),
        "draftInputSha256": sha256(draft_path.read_bytes()),
        "draftCases": 48,
        "draftPeerPairs": 1128,
        "status": "ESCALATE_PENDING_INDEPENDENT_SEMANTIC_REVIEW",
        "findings": findings,
    }
    output_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"findings": len(findings), "status": result["status"]}))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("mode", choices=("build", "screen"))
    parser.add_argument("--manifest", type=pathlib.Path, required=True)
    parser.add_argument("--drafts", type=pathlib.Path)
    parser.add_argument("--output", type=pathlib.Path)
    args = parser.parse_args()
    if args.mode == "build":
        build(args.manifest)
    else:
        if not args.drafts or not args.output:
            parser.error("screen needs --drafts and --output")
        screen(args.manifest, args.drafts, args.output)


if __name__ == "__main__":
    main()
