"""Software continuation tests in temporary directories; no model receipts/calls."""
import contextlib
import hashlib
import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("capture", Path(__file__).with_name("semantic-discrimination-capture.py"))
capture = importlib.util.module_from_spec(spec)
spec.loader.exec_module(capture)


class RetryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.run = self.root / "run"
        self.original = self.run / "captures/SP-008/original"
        self.original.mkdir(parents=True)
        (self.original / "evidence.txt").write_bytes(b"immutable software fixture")
        self.before = (self.original / "evidence.txt").read_bytes()
        self.prompt = self.root / "prompt.txt"
        self.prompt.write_bytes(b"toy frozen prompt\n")
        self.instructions = self.root / "instructions.txt"
        self.instructions.write_bytes(b"toy evidence format supplement\n")
        self.request = self.root / "request.json"
        self.request.write_text('{}')
        self.authorization = {"originalCaptureDirectory": "captures/SP-008/original", "firstResponseSha256": "a" * 64, "firstValidationSha256": "b" * 64}
        self.patches = [patch.object(capture, name, value) for name, value in {
            "REPO": self.root, "RUN": self.run, "CAPTURES": self.run / "captures",
            "INSTRUCTIONS": self.instructions, "RETRY_ARCHIVE": self.run / "retries/SP-008/1",
            "RETRY_RESERVATION": self.run / "retry-reservation/SP-008",
        }.items()]
        self.patches += [patch.object(capture, "continuation", return_value=self.authorization),
            patch.object(capture, "request_record", return_value=({"requestSha256": capture.digest(self.request), "promptSha256": capture.digest(self.prompt)}, {}, self.request, self.prompt))]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def prepare_retry(self):
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            capture.prepare("SP-008", "software-test-version", retry=True)
        return Path(output.getvalue().strip())

    def test_explicit_retry_preserves_original_and_prompt(self):
        directory = self.prepare_retry()
        attempt = json.loads((directory / "attempt.json").read_bytes())
        self.assertNotEqual(directory, self.original)
        self.assertEqual(attempt["retry"]["ordinal"], 1)
        self.assertEqual(attempt["retry"]["firstResponseSha256"], "a" * 64)
        self.assertEqual((self.original / "evidence.txt").read_bytes(), self.before)
        self.assertEqual((directory / "effective.prompt.txt").read_bytes(), self.prompt.read_bytes() + self.instructions.read_bytes())
        self.assertEqual(attempt["effectivePromptSha256"], hashlib.sha256(self.prompt.read_bytes() + self.instructions.read_bytes()).hexdigest())

    def test_second_retry_is_rejected_even_before_a_response_exists(self):
        self.prepare_retry()
        with self.assertRaises(FileExistsError):
            self.prepare_retry()
        self.assertEqual((self.original / "evidence.txt").read_bytes(), self.before)

    def test_retry_cannot_target_other_requests(self):
        with self.assertRaisesRegex(ValueError, "Only SP-008"):
            capture.prepare("SP-009", "test", retry=True)

    def test_original_sp008_cannot_be_regenerated(self):
        with self.assertRaisesRegex(ValueError, "first attempt remains INVALID"):
            capture.prepare("SP-008", "test")

    def test_retry_capture_is_never_a_first_attempt_success(self):
        self.assertEqual(capture.continuation_status("SP-008"), "retry-pending")
        self.prepare_retry()
        self.assertEqual(capture.continuation_status("SP-008"), "retry-used-unimported")


if __name__ == "__main__":
    unittest.main()
