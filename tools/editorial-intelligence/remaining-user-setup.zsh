# USER TERMINAL ONLY. The orchestration agent must never source this file.
# Preserve existing authentication/rules/guards; select codex3 per process only.
cd /Users/nicholaslippa/Projects/Whodunnit || return
P="$PWD/.evaluations/editorial-intelligence-manual-v1/astra-manual-12-v1"
A="/Users/nicholaslippa/.codex-account-3"
set -o noclobber

remaining_step() {
  local pilot_case="$1" pilot_stage="$2" pilot_exit=0 pilot_capture
  test -f "$P/remaining-cli-version.txt" || env CODEX_HOME="$A" /opt/homebrew/bin/codex --version > "$P/remaining-cli-version.txt" || return
  pilot_capture=$(python3 tools/editorial-intelligence/remaining-capture.py reserve "$pilot_case" "$pilot_stage") || return
  local pilot_base="$pilot_capture/$pilot_case-$pilot_stage"
  local -a pilot_argv
  pilot_argv=(env "CODEX_HOME=$A" /opt/homebrew/bin/codex exec
    --model gpt-6-astra --sandbox read-only --ephemeral --json
    --output-last-message "$pilot_base.response.json"
    -c 'model_reasoning_effort="high"'
    -c 'web_search="disabled"'
    -c 'features.multi_agent=false'
    -c 'features.memories=false'
    -c 'apps._default.enabled=false'
    -c 'tools.view_image=false' -)
  python3 tools/editorial-intelligence/remaining-capture.py begin "$pilot_capture" "${pilot_argv[@]}" || return
  "${pilot_argv[@]}" < "$P/requests/$pilot_case-$pilot_stage.prompt.txt" \
    > "$pilot_base.events.jsonl" 2> "$pilot_base.stderr.txt" || pilot_exit=$?
  python3 tools/editorial-intelligence/remaining-capture.py end "$pilot_capture" "$pilot_exit" || return
  node --import tsx tools/editorial-intelligence/manual.ts import \
    astra-manual-12-v1 "$pilot_case" "$pilot_stage" \
    "$pilot_base.response.json" "$pilot_base.metadata.json"
}

run_remaining() {
  local pilot_next pilot_case pilot_stage
  while true; do
    pilot_next=$(python3 tools/editorial-intelligence/remaining-capture.py next) || return
    if [[ -z "$pilot_next" ]]; then
      printf '%s\n' 'All remaining stages accepted. No judge has been run.'
      return 0
    fi
    IFS=$'\t' read -r pilot_case pilot_stage <<< "$pilot_next"
    remaining_step "$pilot_case" "$pilot_stage" || return
  done
}
