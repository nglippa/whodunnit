"""One authorized configuration GET; never invoke Claude/model/experimental arms.

This is a faithful transport replica of registered rt/ot, NOT genuine complete
client request construction. OAuth remains in process memory; no refresh/retry.
Requires explicit --acquire, an absent evidence directory, and host keychain.
"""
import argparse
import datetime
import getpass
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
BINARY = Path('/Users/nicholaslippa/.local/share/claude/versions/2.1.288')
BINARY_HASH = 'bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750'
DEST = ROOT / 'data/evaluation/post-v3-comparison/precall-acquisition'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def stamp():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def write(name, value):
    # Exclusive records, including failure records; never overwrite evidence.
    with (DEST / name).open('x') as out:
        json.dump(value, out, indent=2, sort_keys=True)
        out.write('\n')
        out.flush()
        os.fsync(out.fileno())


def snapshot():
    result = subprocess.run(['python3', str(ROOT / 'tools/eval/post-v3-precall-inspect.py')],
                            cwd=ROOT, capture_output=True, timeout=20, check=True)
    return json.loads(result.stdout)


def check_local():
    blob = BINARY.read_bytes()
    assert sha(blob) == BINARY_HASH
    anchors = {194871409: b'function ot(e){return{params:{entrypoint:e.entrypoint,model:e.model}',
               194872180: b'function rt(e,n){',
               181182522: b'function A$(e="")',
               179188225: b'fp="oauth-2025-04-20"',
               185934221: b'function Pft(){'}
    for offset, token in anchors.items():
        assert blob[offset:offset + len(token)] == token
    # These inherited selectors would require an alternate faithful profile.
    forbidden = [key for key in os.environ if
                 key.startswith(('ANTHROPIC_', 'CLAUDE_CODE_USE_', 'AWS_', 'GOOGLE_', 'OPENROUTER_'))
                 or re.search('FALLBACK|AUTH_TOKEN', key)
                 or key in ('CLAUDE_CONFIG_DIR', 'CLAUDE_SECURESTORAGE_CONFIG_DIR',
                            'CLAUDE_CODE_CUSTOM_OAUTH_URL', 'CLAUDE_CODE_OAUTH_CLIENT_ID',
                            'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_DESKTOP_APP_VERSION')]
    assert not forbidden, 'Unsupported inherited provider/auth/routing selectors'
    return {str(offset): sha(blob[offset:offset + 2048]) for offset in anchors}


def safe_response(body):
    value = json.loads(body)
    assert isinstance(value, dict), 'Bootstrap envelope is not an object'
    data = value.get('client_data')
    assert data is None or isinstance(data, dict), 'client_data is not an object'
    data = data or {}
    selected = {}
    for key in ('heather_vale', 'per_turn_effort'):
        item = data.get(key)
        if key == 'heather_vale':
            assert item is None or isinstance(item, dict)
            selected[key] = {model: amount for model, amount in (item or {}).items()
                             if re.fullmatch(r'claude-[a-z0-9.\-]+(?:\[1m\])?', model)
                             and isinstance(amount, (int, float))}
        else:
            assert item is None or isinstance(item, bool)
            selected[key] = item
    default = value.get('org_model_default')
    assert default is None or isinstance(default, dict)
    default_safe = None
    if default:
        default_safe = {}
        for key in ('name', 'default_effort_level', 'override_user_effort',
                    'override_user_selection', 'updated_at', 'data_source'):
            item = default.get(key)
            permitted = (item is None or
                         key == 'name' and isinstance(item, str) and
                         re.fullmatch(r'claude-[a-z0-9.\-]+(?:\[1m\])?', item) or
                         key == 'default_effort_level' and item in
                         ('low', 'medium', 'high', 'xhigh', 'max', 'auto') or
                         key in ('override_user_effort', 'override_user_selection') and
                         isinstance(item, bool) or
                         key == 'updated_at' and isinstance(item, (int, float)))
            default_safe[key] = item if permitted else {
                'redacted': True, 'valueJsonSha256': sha(json.dumps(item, sort_keys=True).encode())}
    return {'topLevelFieldNames': sorted(value),
            'clientDataFieldNames': sorted(data),
            'clientDataSortedPythonJsonSha256': sha(json.dumps(data, sort_keys=True, separators=(',', ':')).encode()),
            'selectedClientData': selected, 'orgModelDefault': default_safe,
            'note': 'Sanitized contributing fields only; no auth/account identifiers retained'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--acquire', action='store_true', required=True)
    parser.parse_args()
    code_hashes = check_local()
    assert not DEST.exists(), 'Acquisition already started; no second attempt allowed'
    # Registered A$(Rme)/fR() with default config/auth suffix.
    username = os.environ.get('USER') or getpass.getuser()
    if not re.fullmatch('[a-zA-Z0-9._-]+', username):
        username = 'claude-code-user'
    credentials = subprocess.run(['/usr/bin/security', 'find-generic-password',
                                  '-a', username, '-w', '-s', 'Claude Code-credentials'],
                                 capture_output=True, timeout=2, check=True)
    account = json.loads(credentials.stdout).get('claudeAiOauth')
    assert isinstance(account, dict), 'No account OAuth credential'
    token = account.get('accessToken')
    assert isinstance(token, str) and token, 'No account OAuth access token'
    assert account.get('subscriptionType') == 'pro', 'Unexpected subscription route'
    assert isinstance(account.get('expiresAt'), (int, float))
    assert account['expiresAt'] > time.time() * 1000 + 60000, 'OAuth expired/near-expiry; no refresh allowed'
    before = snapshot()
    DEST.mkdir()
    write('before.json', before)
    profile = {'method': 'GET', 'host': 'api.anthropic.com',
               'path': '/api/claude_cli/bootstrap?entrypoint=sdk-cli&model=claude-sonnet-5-5',
               'headersNonsecret': {'Content-Type': 'application/json', 'User-Agent': 'claude-code/2.1.288',
                                    'anthropic-beta': 'oauth-2025-04-20'},
               'auth': 'claude.ai OAuth Bearer in memory only', 'timeoutSeconds': 5,
               'redirects': 0, 'retries': 0, 'responseSizeCeilingBytes': 1048576,
               'binarySha256': BINARY_HASH, 'sourceAnchorHashes': code_hashes,
               'toolSha256': sha(Path(__file__).read_bytes()),
               'kind': 'faithful rt/ot transport replica; not genuine whole-client capture',
               'fidelity': {'queryAndOAuthHeaders': 'Source-derived rt/ot/fp/pn',
                            'Pft': 'Empty: custom-header selectors absent; SDK entrypoint does not select desktop header',
                            'httpLibrary': 'Python stdlib HTTPS replaces Axios; library-generated wire headers may differ',
                            'responseParser': 'Narrow type-validated projection, not full original Q schema'},
               'caseDataInRequest': False}
    write('request-start.json', {'startedAt': stamp(), 'requestProfile': profile})
    connection = http.client.HTTPSConnection(profile['host'], timeout=5)
    finish = {'finishedAt': None, 'attempts': 1, 'inferenceRequests': 0,
              'requestProfileSortedPythonJsonSha256': sha(json.dumps(profile, sort_keys=True, separators=(',', ':')).encode())}
    try:
        def deadline(signum, frame):
            raise TimeoutError('Bounded metadata deadline')
        signal.signal(signal.SIGALRM, deadline)
        signal.setitimer(signal.ITIMER_REAL, 5)
        headers = dict(profile['headersNonsecret'], Authorization='Bearer ' + token)
        connection.request('GET', profile['path'], headers=headers)
        response = connection.getresponse()
        body = response.read(1048577)
        finish.update({'httpStatus': response.status, 'responseBytes': len(body),
                       'responseSha256': sha(body)})
        assert len(body) <= 1048576, 'Response exceeds bound'
        assert response.status == 200, 'Non-200 response; no followup/redirect/retry'
        finish['response'] = safe_response(body)
        finish['status'] = 'CONFIGURATION_ACQUIRED'
    except Exception as exc:
        # Never save response body, headers, exception string or credentials.
        finish.update({'status': 'TECHNICAL_FAILURE', 'errorClass': type(exc).__name__})
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        connection.close()
        finish['finishedAt'] = stamp()
        write('request-finish.json', finish)
        write('after.json', snapshot())
    print(json.dumps({'status': finish['status'], 'httpStatus': finish.get('httpStatus'),
                      'inferenceRequests': 0, 'attempts': 1, 'evidenceDirectory': str(DEST)}))


if __name__ == '__main__':
    main()
