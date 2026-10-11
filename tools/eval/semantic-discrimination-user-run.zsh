#!/bin/zsh
# USER TERMINAL ONLY. Agents must never execute or source this workflow.
# Existing authentication, account rules, and security guards remain in effect.

set -eu
set -o pipefail
set -o noclobber

[[ "${1:-}" == "--continue-with-sp008-retry" ]] || {
  print -u2 -- 'Use --continue-with-sp008-retry to finish pending originals and the one explicitly authorized SP-008 retry.'
  exit 1
}

cd /Users/nicholaslippa/Projects/Whodunnit

eval_run="$PWD/.evaluations/semantic-discrimination-probe-v1"
eval_account="/Users/nicholaslippa/.codex-account-3"
eval_cli="/opt/homebrew/bin/codex"
eval_recorder="tools/eval/semantic-discrimination-capture.py"
eval_probe="tools/eval/semantic-discrimination-probe.ts"

# Validate every frozen request and all previously accepted imports before any skip or model call.
node --import tsx "$eval_probe" validate

eval_cli_version=$(env CODEX_HOME="$eval_account" "$eval_cli" --version)
[[ -n "$eval_cli_version" ]]

# Pending originals first: their execution does not depend on SP-008 succeeding.
eval_ids=(SP-001 SP-002 SP-003 SP-004 SP-005 SP-006 SP-007 SP-009 SP-010 SP-011 SP-012 SP-008)
for eval_id in "${eval_ids[@]}"; do
  eval_status=$(python3 "$eval_recorder" status "$eval_id")
  if [[ "$eval_status" == "accepted" || "$eval_status" == "retry-accepted" || "$eval_status" == "retry-invalid" || "$eval_status" == "retry-used-unimported" ]]; then
    print -r -- "$eval_id: $eval_status; preserving existing attempt without another invocation."
    continue
  fi
  eval_prepare=prepare
  eval_import=import
  if [[ "$eval_status" == "retry-pending" ]]; then
    print -r -- 'SP-008 FIRST remains permanently INVALID. Executing the single separately labeled RETRY.'
    eval_prepare=prepare-retry
    eval_import=import-retry
  else
    [[ "$eval_status" == "pending" ]]
  fi

  eval_capture=$(python3 "$eval_recorder" "$eval_prepare" "$eval_id" "$eval_cli_version")
  eval_argv=(env "CODEX_HOME=$eval_account" "$eval_cli" exec
    --model gpt-6.1-sol --sandbox read-only --ephemeral --json
    --output-last-message "$eval_capture/response.raw"
    -c 'model_reasoning_effort="high"'
    -c 'web_search="disabled"'
    -c 'features.multi_agent=false'
    -c 'features.memories=false'
    -c 'apps._default.enabled=false'
    -c 'tools.view_image=false' -)

  python3 "$eval_recorder" check-argv "$eval_capture" "${eval_argv[@]}"
  eval_exit=0
  "${eval_argv[@]}" < "$eval_capture/effective.prompt.txt" \
    > "$eval_capture/events.jsonl" 2> "$eval_capture/stderr.txt" || eval_exit=$?
  python3 "$eval_recorder" finish "$eval_capture" "$eval_exit"
  node --import tsx "$eval_probe" "$eval_import" "$eval_id" \
    "$eval_capture/response.raw" "$eval_capture/metadata.raw.json"
done

# Validate the complete set, but never report or unblind it here.
node --import tsx "$eval_probe" validate
print -r -- 'Archive validation complete. First-attempt validity and available valid responses are reported separately above. No unblinding was run.'
