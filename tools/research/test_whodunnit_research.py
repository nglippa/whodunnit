import contextlib
from contextlib import closing
import importlib.util
import io
import json
import sqlite3
import tempfile
import types
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("research", HERE / "whodunnit_research.py")
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)
spec2 = importlib.util.spec_from_file_location("notice", HERE / "command_center_notice.py")
notice = importlib.util.module_from_spec(spec2)
spec2.loader.exec_module(notice)


def finding():
    return {**{k: "Concrete testable proposal" for k in ("root_cause", "confidence", "uncertainty", "title", "principle", "problem", "proposal", "benefit", "risk", "experiment", "challenge")},
        "strength": "HYPOTHESIS", "impact": "HIGH", "evidence": [
            {"source": "S1", "line": 4}, {"source": "S2", "line": 8}]}


CHUNKS = {"S1": {"text": "protected claim", "kind": "code", "path": "engine.ts", "start_line": 4, "end_line": 4, "sha256": "fixture-code"},
          "S2": {"text": "preserve voice", "kind": "writing", "path": "skill.md", "start_line": 8, "end_line": 8, "sha256": "fixture-skill"}}


class ResearchTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.db = self.root / "queue.sqlite3"
        with closing(sqlite3.connect(self.db)) as db:
            for table in ("tasks", "collaboration_runs"):
                db.execute(f"CREATE TABLE {table}(id TEXT,state TEXT,scheduled_at TEXT)")
        self.now = datetime.now(timezone.utc)

    def tearDown(self):
        self.temp.cleanup()

    def enqueue(self, table="tasks", state="pending", seconds=100):
        with closing(sqlite3.connect(self.db)) as db:
            db.execute(f"INSERT INTO {table} VALUES ('other',?,?)", (state, (self.now + timedelta(seconds=seconds)).isoformat()))
            db.commit()

    def test_empty_and_future_schedule_allows_idle(self):
        self.assertIsNone(r.schedule_block(self.db, 400, self.now))
        self.enqueue(seconds=401)
        self.assertIsNone(r.schedule_block(self.db, 400, self.now))

    def test_due_and_running_schedule_blocks_both_kinds(self):
        for table in ("tasks", "collaboration_runs"):
            self.enqueue(table=table, seconds=399)
            self.assertIn(table, r.schedule_block(self.db, 400, self.now))
            with closing(sqlite3.connect(self.db)) as db:
                db.execute(f"DELETE FROM {table}")
                db.commit()
            self.enqueue(table=table, state="running", seconds=5000)
            self.assertIn("running", r.schedule_block(self.db, 1, self.now))
            with closing(sqlite3.connect(self.db)) as db:
                db.execute(f"DELETE FROM {table}")
                db.commit()

    def test_unavailable_or_malformed_schedule_fails_closed(self):
        self.assertIsNotNone(r.schedule_block(self.root / "missing", 400))
        with closing(sqlite3.connect(self.db)) as db:
            db.execute("INSERT INTO tasks VALUES ('x','pending','bad')")
            db.commit()
        self.assertIsNotNone(r.schedule_block(self.db, 400))

    def test_schema_requires_exact_quote_and_both_evidence_kinds(self):
        value = {"findings": [finding()], "open_questions": [], "next_topic": "meaning-correspondence"}
        verified = r.validate_review(json.dumps(value), CHUNKS)
        self.assertEqual(verified['findings'][0]['evidence'][0]['quote'], 'protected claim')
        value["findings"][0]["evidence"][0]["line"] = 999
        with self.assertRaisesRegex(ValueError, "Unsupported"):
            r.validate_review(json.dumps(value), CHUNKS)
        value["findings"][0]["evidence"] = [{"source": "S2", "line": 8}]
        with self.assertRaisesRegex(ValueError, "both"):
            r.validate_review(json.dumps(value), CHUNKS)

    def test_released_comparisons_require_all_cases_and_output_evidence(self):
        chunks = {**CHUNKS, "S3": {**CHUNKS["S2"], "case_ids": ["EI-003", "EI-004", "EI-005"]}}
        value = {"findings": [], "open_questions": ["Insufficient evidence"], "next_topic": "voice-and-restraint"}
        with self.assertRaisesRegex(ValueError, "Three released"):
            r.validate_review(json.dumps(value), chunks)
        value["comparisons"] = [{"caseId": c, "observation": "Exact difference", "interpretation": "Uncertain cause", "limitation": "Exploratory review"} for c in chunks["S3"]["case_ids"]]
        r.validate_review(json.dumps(value), chunks)
        value["findings"] = [finding()]
        with self.assertRaisesRegex(ValueError, "released output evidence"):
            r.validate_review(json.dumps(value), chunks)
        value["findings"][0]["evidence"][1]["source"] = "S3"
        r.validate_review(json.dumps(value), chunks)

    def test_released_packet_binding_and_initial_context(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources")
        _, chunks, prompt = runner.prepare()
        self.assertEqual(chunks["S2"]["case_ids"], ["EI-003", "EI-004", "EI-005"])
        self.assertIn("If you're visiting", chunks["S2"]["text"])
        self.assertIn("RECONSTRUCT_SYSTEM_V7", chunks["S1"]["text"])
        self.assertIn("Host-rendered", chunks["S2"]["line_scope"])
        with patch.object(r, "digest", return_value="changed"):
            with self.assertRaisesRegex(ValueError, "fingerprint changed"):
                runner.released_examples()

    def test_wrong_model_truncation_and_malformed_never_accepted(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources", smoke=True)
        review = {"findings": [finding()], "open_questions": [], "next_topic": "meaning-correspondence"}
        value = {"model": "substitute", "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(review)}}]}
        with self.assertRaisesRegex(ValueError, "Wrong model"):
            runner.accept("meaning-correspondence", CHUNKS, {}, json.dumps(value), 2)
        value["model"] = r.MODEL
        value["choices"][0]["finish_reason"] = "length"
        with self.assertRaisesRegex(ValueError, "incomplete"):
            runner.accept("meaning-correspondence", CHUNKS, {}, json.dumps(value), 2)
        self.assertEqual(runner.progress["cycles"], 0)

    def test_accepted_cycle_notes_report_dedup_and_six_active_hours(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources", smoke=True)
        review = {"findings": [finding()], "open_questions": ["Need negative controls"], "next_topic": "meaning-correspondence"}
        raw = json.dumps({"model": r.MODEL, "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(review)}}]})
        runner.accept("meaning-correspondence", CHUNKS, {}, raw, 2)
        self.assertEqual(len(list((runner.state / "cycles").glob("*/notes.md"))), 1)
        self.assertTrue((runner.state / "journal.md").is_file())
        self.assertEqual(len(list((runner.state / "reports").glob("*.md"))), 1)
        runner.smoke = False
        runner.accept("meaning-correspondence", CHUNKS, {}, raw, r.REPORT_SECONDS)
        self.assertEqual(len(runner.progress["investigated"]), 1)
        self.assertEqual(len(list((runner.state / "reports").glob("*.md"))), 2)
        latest = r.read_json(runner.state / "latest-report.json")
        self.assertIn("No new supported", Path(latest["path"]).read_text())

    def test_chunk_progress_and_fingerprint(self):
        p = self.root / "source.txt"
        p.write_text("first line\nsecond line\nthird line\n")
        chunk, cursor, start, end, fp = r.bounded_chunk(p, 0, 12)
        self.assertEqual((chunk, cursor, start, end), ("first line\n", 1, 1, 1))
        self.assertEqual(fp, r.digest(p.read_bytes()))

    def test_singleton_lock(self):
        a = r.locked(self.root)
        self.assertIsNone(r.locked(self.root))
        a.close()
        b = r.locked(self.root)
        self.assertIsNotNone(b)
        b.close()

    def test_notifications_dedup_and_console_options(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources")
        with patch.object(r.subprocess, "run") as run:
            run.return_value.returncode = 0
            runner.notify("Other operation owns resource")
            runner.notify("Other operation owns resource")
            self.assertEqual(run.call_count, 1)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            notice.print_notice(runner.resources)
        for name in ("Pause current continue with new", "Pause new continue with active", "Other"):
            self.assertIn(name, output.getvalue())
        runner.clear_notice()
        self.assertEqual(notice.read_notice(runner.resources)["state"], "RESUMED")

    def test_manifest_has_no_holdout_or_raw_evaluation_paths(self):
        config = r.read_json(r.MANIFEST)
        for path in config["history"] + sum(config["topics"].values(), []):
            self.assertTrue((r.ROOT / path).is_file(), path)
            self.assertNotIn("holdout", path)
            self.assertNotIn("data/", path)
            self.assertNotIn(".evaluations", path)

    def test_resident_handoff_releases_after_new_due_job(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources", self.root / "cc")
        runner.state.mkdir()
        calls, effects = [], []
        review = {"findings": [finding()], "open_questions": [], "next_topic": "meaning-correspondence"}
        raw = json.dumps({"model": r.MODEL, "choices": [{"finish_reason": "stop", "message": {"content": json.dumps(review)}}]})
        entry = types.SimpleNamespace(identifier=r.MODEL, endpoint=r.ENDPOINT, provider="ollama", family="qwen",
            load_timeout=180, unload_timeout=30, health_timeout=3, snapshot_json=lambda: "{}")

        class Dependencies:
            def native(self, *_):
                effects.append("native lifecycle")
                return {"model": r.MODEL, "done": True}

        class HTTP:
            def __init__(self, endpoint, timeout):
                assert endpoint == r.ENDPOINT
            def _request(self, method, path, body):
                calls.append(json.loads(body))
                # Simulate work queued while an existing bounded inference is in flight.
                with closing(sqlite3.connect(runner.queue)) as db:
                    db.execute("INSERT INTO tasks VALUES ('new-work','pending',?)", (r.stamp(),))
                    db.commit()
                return 200, raw.encode()

        class Manager:
            def __init__(self, resources, config, stopping, deps):
                self.registry = types.SimpleNamespace(entries=[entry])
                self.store = types.SimpleNamespace(close=lambda: effects.append("closed"))
                self.deps = deps
            @contextlib.contextmanager
            def lease(self):
                effects.append("leased")
                try:
                    yield True
                finally:
                    effects.append("released")
            def reconcile(self):
                effects.append("reconciled")
            def probe_live(self):
                return {"models": [{"ok": True, "value": {"loaded": []}}]}
            def execute(self, task, on_result):
                try:
                    self.deps.native(entry, "POST", "/api/chat", {"messages": [{"content": task["prompt"]}], "options": {"num_predict": 1200}}, 180)
                    on_result("", "", "sid")
                finally:
                    effects.append("verified cleanup")
                    (runner.state / "stop.request").write_text("test")
                return types.SimpleNamespace(cleanup_error=None, error=None)

        with patch.dict(r.sys.modules, {"lifecycle": types.SimpleNamespace(Manager=Manager, Dependencies=Dependencies),
                                       "models": types.SimpleNamespace(LocalHTTP=HTTP)}), \
             patch.object(r, "IDLE_QUIET_SECONDS", 0), \
             patch.object(runner, "prepare", return_value=("meaning-correspondence", CHUNKS, "test prompt")), \
             patch.object(r.time, "sleep"):
            self.assertEqual(runner.run(), 0)
        self.assertEqual(len(calls), 1)  # No next request after new competing work.
        self.assertEqual(effects, ["leased", "reconciled", "verified cleanup", "released", "closed"])
        self.assertEqual(runner.progress["cycles"], 1)
        self.assertEqual(len(list((runner.state / "attempts").glob("*.json"))), 1)

    def test_active_work_never_loads_or_infers(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources", self.root / "cc")
        self.enqueue(state="running")
        entry = types.SimpleNamespace(identifier=r.MODEL, endpoint=r.ENDPOINT, provider="ollama", load_timeout=180, unload_timeout=30)
        class Manager:
            def __init__(self, *_, **__):
                self.registry = types.SimpleNamespace(entries=[entry])
                self.store = types.SimpleNamespace(close=lambda: None)
            def lease(self):
                raise AssertionError("Active scheduled work must block before lease/load")
        with patch.dict(r.sys.modules, {"lifecycle": types.SimpleNamespace(Manager=Manager, Dependencies=object),
                                       "models": types.SimpleNamespace(LocalHTTP=object)}), \
             patch.object(runner, "notify"), \
             patch.object(r.time, "sleep", side_effect=lambda _: (runner.state / "stop.request").write_text("test")):
            self.assertEqual(runner.run(), 0)
        self.assertEqual(runner.progress["cycles"], 0)

    def test_quiet_window_does_not_take_short_gap(self):
        runner = r.Researcher(self.root / "state", self.db, self.root / "resources", self.root / "cc")
        entry = types.SimpleNamespace(identifier=r.MODEL, endpoint=r.ENDPOINT, provider="ollama", load_timeout=180, unload_timeout=30)
        class Manager:
            def __init__(self, *_, **__):
                self.registry = types.SimpleNamespace(entries=[entry])
                self.store = types.SimpleNamespace(close=lambda: None)
            def lease(self):
                raise AssertionError("Short idle gap must not acquire model ownership")
        with patch.dict(r.sys.modules, {"lifecycle": types.SimpleNamespace(Manager=Manager, Dependencies=object),
                                       "models": types.SimpleNamespace(LocalHTTP=object)}), \
             patch.object(r.time, "sleep", side_effect=lambda _: (runner.state / "stop.request").write_text("test")):
            self.assertEqual(runner.run(), 0)
        self.assertEqual(runner.progress["cycles"], 0)


if __name__ == "__main__":
    unittest.main()
