"""Read local bytes only. Never execute/import Claude, spawn, or use networking.

The output is an INCOMPLETE investigative snapshot, not execution authorization.
Run from the repository root; stdout contains no credentials or account IDs.
"""
import hashlib
import json
import os
from pathlib import Path


def digest(data):
    return hashlib.sha256(data).hexdigest()


binary = Path('/Users/nicholaslippa/.local/share/claude/versions/2.1.288')
blob = binary.read_bytes()
expected = 'bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750'
assert digest(blob) == expected, 'Registered binary mismatch'
home = Path.home()
global_path = home / '.claude.json'
global_bytes = global_path.read_bytes()
global_config = json.loads(global_bytes)
account = global_config.get('oauthAccount', {})
scope_name = (account['organizationUuid'].lower() + '-' +
              digest(account['accountUuid'].lower().encode())[:12] + '-cc.json')
catalog_path = home / '.claude/cache/model-catalog' / scope_name
catalog_bytes = catalog_path.read_bytes() if catalog_path.exists() else None
catalog = json.loads(catalog_bytes) if catalog_bytes else None
features = global_config.get('cachedGrowthBookFeatures', {})
environment = dict(os.environ)
removed = []
import re
for key in list(environment):
    if (re.match(r'^(?:ANTHROPIC_|CLAUDE_CODE_USE_|AWS_|GOOGLE_|OPENROUTER_)', key)
            or re.search(r'FALLBACK|AUTH_TOKEN', key)):
        removed.append(key)
        del environment[key]
environment['MAX_STRUCTURED_OUTPUT_RETRIES'] = '0'
environment['CLAUDE_CODE_MAX_RETRIES'] = '0'
selectors = {key: {'present': True, 'valueSha256': digest(value.encode())}
             for key, value in sorted(environment.items())
             if key.startswith(('CLAUDE_', 'ANTHROPIC_', 'DISABLE_'))
             or key in ('HOME', 'MAX_THINKING_TOKENS', 'MAX_STRUCTURED_OUTPUT_RETRIES')}
anchors = {
    'active_catalog_lookup': (181735611, 'function VF(){'),
    'model_payload_resolver': (181793707, 'function $x(e){'),
    'maximum_output_resolver': (181799599, 'function NZ(e){'),
    'account_effort_resolver': (182842613, 'function cIe(e){'),
    'effort_precedence': (182850321, 'function vbn(e,n){'),
    'feature_value_precedence': (181579458, 'getFeatureValueWithSource(e,n){'),
    'served_catalog_cache_loader': (195406532, 'function y1n(e,r){'),
    'served_catalog_initialization': (195739590, 'async function Qt({headless:e}){'),
    'warm_cache_growthbook_kick': (196216966, 'function Na(e){'),
    'bootstrap_transport': (194872180, 'function rt(e,n){'),
    'bootstrap_cache_update': (194874602, 'function wrs(e,n,'),
    'background_bootstrap_registration': (194842170, 'function ast(n){'),
}
code = {}
for name, (offset, token) in anchors.items():
    # Byte offsets are checked against source bytes rather than Unicode offsets.
    assert blob[offset:offset + len(token)] == token.encode(), name
    code[name] = {'binaryByteOffset': offset,
                  'following2048BytesSha256': digest(blob[offset:offset + 2048])}
source_files = ['tools/eval/post-v3-live-transport.ts',
                'tools/eval/post-v3-live-profiles.ts',
                'data/evaluation/post-v3-comparison/operational-manifest.json']
settings = []
for path in [home / '.claude/settings.json', home / '.claude/settings.local.json',
             Path('/Library/Application Support/ClaudeCode/managed-settings.json')]:
    settings.append({'path': str(path), 'present': path.exists(),
                     'sha256': digest(path.read_bytes()) if path.exists() else None,
                     'note': 'Presence/hash only; no credential or configuration values copied'})
slot_key = 'bi1-' + digest(json.dumps(['sdk-cli', 'claude-sonnet-5-5', '2.1.288',
                                     account['organizationUuid']], separators=(',', ':')).encode())[:16]
slot = global_config.get('clientDataCacheSlots', {}).get(slot_key)
org_default = global_config.get('orgModelDefaultCache')
org_default_safe = ({key: org_default.get(key) for key in
                     ['name', 'default_effort_level', 'override_user_effort',
                      'override_user_selection', 'updated_at', 'data_source']}
                    if isinstance(org_default, dict) else None)
snapshot = {
    'status': 'INCOMPLETE', 'executionPermitted': False,
    'method': 'Static byte reads only; genuine CLI request construction not executed',
    'binary': {'path': str(binary), 'version': '2.1.288', 'sha256': expected},
    'sourceHashes': {path: digest(Path(path).read_bytes()) for path in source_files},
    'invocation': {
        'cwdPolicy': 'fresh empty mkdtemp(post-v3-review-) under host tmpdir',
        'argvTemplate': ['--print', '--model', 'sonnet', '--effort', '<proof.effort: unresolved>',
                         '--system-prompt', '<stage system bytes>', '--json-schema', '<stage schema JSON>',
                         '--output-format', 'json', '--no-session-persistence', '--tools', '',
                         '--safe-mode', '--setting-sources', '', '--strict-mcp-config', '--mcp-config',
                         '{"mcpServers":{}}', '--disable-slash-commands'],
        'environmentPolicy': 'inherit host environment then registered denylist scrub; not allowlist',
        'removedEnvironmentKeyNames': sorted(removed), 'retainedRelevantSelectors': selectors,
        'timeoutMs': 20000, 'retries': 0,
    },
    'localState': {
        'globalConfigPath': str(global_path), 'globalConfigSha256': digest(global_bytes),
        'configurationFiles': settings, 'orgModelDefaultCache': org_default_safe,
        'featureCacheTimestamp': global_config.get('cachedGrowthBookFeaturesAt'),
        'selectedCachedFeatures': {key: {'present': key in features, 'value': features.get(key)}
                                   for key in ['tengu_delegated_quail', 'tengu_witty_wand']},
        'accountScopeCatalogMatch': bool(catalog_bytes),
        'catalogSha256': digest(catalog_bytes) if catalog_bytes else None,
        'catalogVersion': catalog.get('version') if catalog else None,
        'catalogFetchedAt': catalog.get('fetchedAt') if catalog else None,
        'catalogStaleAt': catalog.get('staleAt') if catalog else None,
        'catalogSurface': catalog.get('catalog', {}).get('surface') if catalog else None,
        'sonnetRow': next((row for row in catalog['catalog']['config']['models']
                           if row.get('id') == 'claude-sonnet-5-5'), None) if catalog else None,
        'sonnetThinkingState': next((row for row in catalog['catalog']['state']['thinking_by_model']
                                     if row.get('id') == 'claude-sonnet-5-5'), None) if catalog else None,
        'applicableSdkClientDataSlotMatch': slot is not None,
        'sdkClientDataSlotAt': slot.get('at') if slot else None,
        'sdkClientDataSha256': digest(json.dumps(slot.get('data'), sort_keys=True,
                                               separators=(',', ':')).encode()) if slot else None,
        'sdkSonnetOutputLimit': slot.get('data', {}).get('heather_vale', {}).get('claude-sonnet-5-5') if slot else None,
        'sdkPerTurnEffort': slot.get('data', {}).get('per_turn_effort') if slot else None,
        'startupNapCachedFlagPresent': 'tengu_cicada_nap_ms' in features,
        'startupNapCachedFlag': features.get('tengu_cicada_nap_ms'),
        'startupPrefetchedAt': global_config.get('startupPrefetchedAt'),
        'bootstrapWaitCachedFlagPresent': 'tengu_deep_shore' in features,
        'bootstrapWaitCachedFlag': features.get('tengu_deep_shore'),
    },
    'sourceAnchors': code,
    'proof': {'requestedAlias': 'sonnet', 'locallyResolvedModel': None,
              'effectiveEffort': None, 'temperature': None, 'maximumOutputTokens': None,
              'payloadCaptured': False, 'payloadSha256': None,
              'inferenceNetworkCalls': 0, 'otherNetworkCalls': 0,
              'networkSafety': 'No child processes, CLI imports, socket/fetch libraries or network operations'},
    'unresolved': ['Concrete proof.effort input is absent from the future invocation profile',
                   'Cached branches are not an independently captured genuine active request payload',
                   'Normal startup launches asynchronous bootstrap metadata unless bare/nap gate excludes it; '
                   'its remote client_data/org_model_default response may replace locally cached effective controls '
                   'before request construction. No remote fetch or network-denied fallback was substituted.'],
}
print(json.dumps(snapshot, indent=2, sort_keys=True))
