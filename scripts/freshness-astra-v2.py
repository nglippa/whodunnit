#!/usr/bin/env python3
"""V2 adapter: reuse exact pinned v1 lexical screen; never build inventory."""
import argparse
import hashlib
import importlib.util
import json
import pathlib
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASE = ROOT / 'data/evaluation/astra-control-fresh-48-v2'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--drafts', type=pathlib.Path, required=True)
    parser.add_argument('--output', type=pathlib.Path, required=True)
    args = parser.parse_args()
    pin = json.loads((BASE / 'freshness-provenance.json').read_text())
    method, manifest = ROOT / pin['methodPath'], ROOT / pin['manifestPath']
    for path, expected in [(method, pin['methodSha256']), (manifest, pin['manifestSha256'])]:
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise ValueError('frozen freshness hash mismatch')
    spec = importlib.util.spec_from_file_location('frozen_v1_freshness', method)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    # module.__file__ remains the v1 script: its pinned self/runtime guards apply.
    with tempfile.TemporaryDirectory() as directory:
        temporary = pathlib.Path(directory) / 'screen.json'
        module.screen(manifest, args.drafts, temporary)
        result = json.loads(temporary.read_text())
    result['inheritedMethodExperimentId'] = result['experimentId']
    result['experimentId'] = 'astra-control-fresh-48-v2'
    result['adapterSha256'] = hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest()
    with args.output.open('x', encoding='utf-8') as handle:
        handle.write(json.dumps(result, ensure_ascii=False, indent=2) + '\n')


if __name__ == '__main__':
    main()
