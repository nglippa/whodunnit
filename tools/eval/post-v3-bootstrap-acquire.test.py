"""Offline mocks only; no real keychain, CLI, sockets or HTTP.
python3 tools/eval/post-v3-bootstrap-acquire.test.py
"""
import contextlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('acquire', Path(__file__).with_name('post-v3-bootstrap-acquire.py'))
acquire = importlib.util.module_from_spec(spec)
spec.loader.exec_module(acquire)


class AcquisitionTests(unittest.TestCase):
    def run_case(self, status=200, body=None):
        if body is None:
            body = json.dumps({'client_data': {'heather_vale': {'claude-sonnet-5-5': 128000},
                                              'per_turn_effort': True},
                               'oauth_account': {'email': 'private-account'},
                               'org_model_default': {'name': 'private-account',
                                                     'default_effort_level': 'medium'}}).encode()
        events = []
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / 'evidence'

            class Connection:
                def __init__(self, host, timeout):
                    self.assert_host = host
                    events.append(('construct', host, timeout))

                def request(self, method, path, headers):
                    assert (destination / 'request-start.json').exists()
                    events.append(('request', method, path))

                def getresponse(self):
                    return type('Response', (), {'status': status, 'read': lambda self, n: body[:n]})()

                def close(self):
                    events.append(('close',))

            credentials = type('Credentials', (), {'stdout': json.dumps({'claudeAiOauth': {
                'accessToken': 'private-token', 'subscriptionType': 'pro',
                'expiresAt': (time.time() + 3600) * 1000}}).encode()})()
            with patch.object(acquire, 'DEST', destination), patch.object(acquire, 'check_local', return_value={}), \
                    patch.object(acquire, 'snapshot', return_value={'synthetic': True}), \
                    patch.object(acquire.subprocess, 'run', return_value=credentials), \
                    patch.object(acquire.http.client, 'HTTPSConnection', Connection), \
                    patch('sys.argv', ['test', '--acquire']), contextlib.redirect_stdout(io.StringIO()):
                acquire.main()
                records = {p.name: p.read_text() for p in destination.iterdir()}
                with self.assertRaises(AssertionError):
                    acquire.main()
            return events, records

    def test_single_fixed_get_start_first_no_overwrite_and_secret_projection(self):
        events, records = self.run_case()
        self.assertEqual(len([e for e in events if e[0] == 'request']), 1)
        self.assertEqual(events[0], ('construct', 'api.anthropic.com', 5))
        finish = json.loads(records['request-finish.json'])
        self.assertEqual(finish['status'], 'CONFIGURATION_ACQUIRED')
        self.assertEqual(finish['response']['orgModelDefault']['default_effort_level'], 'medium')
        self.assertTrue(finish['response']['orgModelDefault']['name']['redacted'])
        joined = ''.join(records.values())
        self.assertNotIn('private-token', joined)
        self.assertNotIn('private-account', joined)
        self.assertNotIn('Jcs', joined)

    def test_redirect_has_no_followup(self):
        events, records = self.run_case(302)
        self.assertEqual(len([e for e in events if e[0] == 'request']), 1)
        self.assertEqual(json.loads(records['request-finish.json'])['status'], 'TECHNICAL_FAILURE')

    def test_malformed_and_oversize_have_no_retry_or_body_persistence(self):
        for body in (b'private-unparseable-response', b'x' * 1048577):
            events, records = self.run_case(body=body)
            self.assertEqual(len([e for e in events if e[0] == 'request']), 1)
            finish = json.loads(records['request-finish.json'])
            self.assertEqual(finish['status'], 'TECHNICAL_FAILURE')
            self.assertNotIn('private-unparseable-response', ''.join(records.values()))


if __name__ == '__main__':
    unittest.main()
