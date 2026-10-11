# Whodunnit idle-time Qwen researcher

One background Python process, one existing local model, one persistent Markdown journal.
It proposes experiments; it never implements them. No new server, model download, scheduler,
dashboard, paid API, subscription CLI, or runtime agent team is involved.

## Four operations

Run from `~/Projects/Whodunnit`:

```sh
# Start researcher (survives closing this terminal; Mac must remain awake)
python3 tools/research/whodunnit_research.py start

# Stop researcher (graceful; current bounded request finishes, then owned model unloads)
python3 tools/research/whodunnit_research.py stop

# Status
python3 tools/research/whodunnit_research.py status

# Latest report
python3 tools/research/whodunnit_research.py latest-report
```

Repeated start does not create a second process. Stop uses a request file, never a stale PID
kill. Sleeping the Mac suspends progress; this is not an installed launchd service. Status
includes whether the singleton process lock is actually held, not merely a recorded PID.

## Research and evidence

Model: **`qwen3:14b-q8_0`**, requested exactly at **`http://127.0.0.1:11434/v1`**.
Ollama reported version **0.34.4**; the installed tag reports 14.8B / Q8_0. The existing
command-center registry supplies the 4,096-token context and ownership contract. Research
calls use `/v1/chat/completions`, JSON mode, temperature 0.3, 1,200 output tokens, requested
reasoning `none`, and a 180-second HTTP deadline. There is no model substitution or fallback.
Native Ollama calls are used only by the existing load/readiness/residency/unload lifecycle.
Its tiny readiness inference is a real additional call and is not research output.

The original `book-to-skill/SKILL.md`, its security reference, `no-ai-slop/SKILL.md`, and
`no-ai-slop/eval.md` are read in place under `~/.codex-account-2/skills/`. Their actual text
is passed to Qwen in chunks; the skills are not duplicated or regenerated. Book-to-skill's
structure extraction and precision principles inform research; its full skill-conversion
and publishing workflow is not invoked. No AI slop's patterns are contestable editorial
evidence, not a production ban list or detector objective.

Writing references are the [original Strunk edition](https://www.gutenberg.org/ebooks/37134)
and [Quiller-Couch's On the Art of Writing](https://www.gutenberg.org/ebooks/17470). These
Project Gutenberg editions are public domain in the United States. Complete downloads,
including license text, remain local with URL and SHA-256 provenance. This does not download
the later Strunk/White revision. Historical prescriptions must be challenged against voice,
meaning, and modern usage; the researcher is instructed not to enforce them automatically.

`tools/research/whodunnit_sources.json` is an exact input allowlist. It includes selected
engine modules and published architectural/evaluation summaries, including the direct-editor
baseline, Candidate D's coverage barriers, and the non-independent semantic discrimination
audit. No `data/evaluation`, raw `.evaluations`, private blind mappings, sealed holdout texts, private
documents, environment files, or credentials are supplied. Qwen cannot request new paths.
Do not extend this list with sealed material. Missing sources pause research rather than
silently broadening access. Public book downloads are bounded at setup; the running model
has no browsing or network tools.

Topics rotate among meaning correspondence, voice/restraint, objective/fallback validity,
composition/clarity, and measurement/evidence. The least-studied topics take priority;
Qwen can suggest the next topic among ties. Each source retains a chunk cursor. Each cycle
reads code, a permitted history summary, a writing reference/skill, and recent journal
context. Each topic has a concrete research question and prioritizes an already
published evaluation report on alternate visits rather than relying on introductory architecture
text. The model is explicitly told which core protections already exist so it can investigate
their measured limitations instead of recommending them again. It produces specific
observations or hypotheses, proposed experiments, risks, and counterarguments. Empty findings
are accepted. Qwen selects printed source/line IDs;
the harness validates those IDs and copies the exact supporting line into the derived notes.
It does not ask Qwen to transcribe quotations. Each finding needs both engine and
writing/history evidence. Invalid responses
are preserved, rejected, and backed off; they are never automatically repaired.

Source-line validation verifies literal grounding, **not reasoning quality, semantic correctness,
novelty, or expected benefit**. An `OBSERVED` label is Qwen's provisional assessment, not
independent proof. Exact repeated problem/proposal pairs are suppressed, while semantic
repetition still relies on journal context and model discipline. A single smoke run cannot
establish that hours of research will consistently produce good proposals. Review reports
with ChatGPT before authorizing any implementation experiment.

## Journal and reports

All local research lives under `.research/whodunnit/` (gitignored):

| File/directory | Contents |
| --- | --- |
| `journal.md` | Compact recent findings, studied topic counts, experiments, open questions |
| `cycles/*/notes.md` | Permanent Markdown cycle notes and supporting locations |
| `cycles/*/record.json` | Complete chunks, source fingerprints, validated review and provenance |
| `cycles/*/response.json` | Exact captured response bytes, never rewritten |
| `attempts/*.json` | Every transport attempt, including rejected/malformed responses |
| `references/` | Licensed book downloads and fingerprints |
| `reports/*.md` | Historical ranked recommendation reports, never overwritten |
| `progress.json` | Cursors, investigated fingerprints, topic visits, cumulative active time |
| `status.json`, `process.log`, `events.jsonl` | Process state, errors, conflict history |

A report is produced after each **six cumulative hours of research HTTP inference time**,
including unsuccessful attempts. Waiting, sleep, pause, preload and readiness time do not
advance that timer. Report generation happens at a successfully validated cycle boundary.
Reports rank **new** findings since the previous report using Qwen's provisional evidence
and impact labels. They contain the problem, exact evidence/location, proposed change,
expected benefit, risk, experiment, and challenge. If there are no new supported findings,
the report says so. A labeled smoke report is separate from a six-hour report. There is
no measured quality-improvement claim, cost estimate, or invented provider latency.

## Idle scheduling and resource ownership

The researcher reuses `command-center/basic-qwen-bonsai/tools/research/lifecycle.py` and the
**same** `.research/heavy-model.lease` and lifecycle store as existing command-center jobs.
It does not create a parallel resource manager, enqueue research tasks, or alter any queue row.
The existing manager handles exact-model readiness, persisted ownership, crash recovery,
unload acknowledgement and verified `/api/ps` absence. External resident models are refused;
the shared Ollama daemon is never stopped. A cleanup failure stops the researcher with a
blocker for operator inspection rather than guessing that memory was freed.

Before acquiring ownership and again under the lease, the researcher opens the existing
queue read-only and checks both ordinary and collaboration work. Running work blocks it.
Pending work within the full load + inference + unload + safety allowance blocks loading
(420 seconds with current settings). Loading also requires a continuously quiet schedule for
60 seconds, so brief gaps between stages submitted by an external process do not immediately
trigger a Qwen load. A busy schedule or lease resets this quiet window. It checks again
immediately before each request using
an inference + cleanup allowance. Missing/corrupt scheduling data fails closed. Live model
probes must also show idle resources. Qwen stays resident over consecutive idle research
cycles; it is not unloaded/reloaded after each cycle.

If a new task arrives during inference, the researcher completes at most that bounded request,
saves its notes, verifies owned-model cleanup, and releases the lease before scheduled work
can run. It rechecks every second between requests and polls paused state every five seconds.
This is cooperative boundary yielding, **not instantaneous preemption**. Scheduled jobs
already visible to the queue are protected with a look-ahead allowance. Future tasks submitted
by an external scheduler at the last moment can be delayed by the current bounded request
and cleanup. Applications that ignore the shared lease cannot be made safe by this process;
they must use the same existing ownership mechanism. No lease is removed to force progress.

## Conflict notifications and procedures

On entering a pause episode, an AppleScript desktop notification is requested. macOS may
suppress it depending on notification permissions/Focus settings; exit status is recorded
in `desktop-notification.json`. The researcher also writes a dedicated command-center
notice at `.research/whodunnit-notification.json`. Reason changes update that notice without
repeated desktop interruptions during the same pause episode.

A small read-only display is installed in the existing command-center console and `status`;
the existing JSON bridge includes the notice in its `status` response. No dashboard or
notification server was created. A console already waiting for keyboard input shows new
notices on the next menu refresh/status request, not asynchronously in the middle of input.
Reopen a console that was started before this integration to load the new display; existing
inference workers need no restart.
The three procedures are:

1. **Pause current continue with new:** stop the active owner through its own supported
   controls, wait for verified cleanup, and reschedule/cancel conflicting pending work in
   the existing command center. The researcher resumes only once schedule and ownership are
   clear. This option is an operator procedure, not permission to kill a PID.
2. **Pause new continue with active:** the automatic default. The researcher yields, then
   resumes after the conflict clears. Use Stop researcher if it should stay stopped.
3. **Other:** inspect both status views and adjust the existing schedule or investigate
   the exact blocker. No automatic schedule mutation or unsafe model switching occurs.

Command-center integration changed only notification import/display in `cli.py`, one optional
`notification` field in bridge status, and the new `whodunnit_notice.py` reader. Pre-existing
command-center changes are preserved. The reader source is retained as
`tools/research/command_center_notice.py` in Whodunnit for inspection and focused tests.

## Validation and smoke evidence

Focused validation:

```sh
python3 -m unittest discover -s tools/research -p 'test_whodunnit_research.py' -v
```

The tests cover active/future schedule exclusion, fail-closed scheduling, exact quotes,
wrong-model/truncated response rejection, singleton ownership, topic/source boundaries,
deduplication, reports, notifications, and yielding without a second inference after new
competing work is queued. Existing command-center bridge/lifecycle tests exercise the reused
ownership and cleanup contracts. No application suite or browser verification is needed for
this background process and existing terminal console.

The initial genuine Qwen inference completed but was rejected because it collapsed whitespace
in a quotation. That raw attempt remains intact. A second genuine inference passed the quote
and response checks, wrote cycle notes and a labeled smoke report, and ended with verified
model unload. A later background cycle also failed quotation transcription and remains
preserved. The final research schema therefore uses source-line selections and host-copied
quotations; no failed response was repaired or retroactively accepted. The report is evidence
that the process works, **not evidence of strong research quality**: its initial suggestion
repeats an existing architectural principle. Subsequent research instructions explicitly
disallow presenting existing principles as new changes.
The exact smoke provenance is recorded locally in `smoke-verification.json`.

Validation at setup: **13 researcher tests, 6 existing bridge tests and 30 existing lifecycle
tests passed**. No full application suite was run. The initial accepted smoke inference used
1,963 prompt tokens and 409 completion tokens and took 39.44 seconds according to the local
capture. There were two research inferences and two readiness inferences across the initial
two smoke sessions; one research response was rejected and one accepted. Subsequent captures
are counted separately in the latest local verification receipt. The source journal and smoke
reports remain local, with raw captures and SHA-256 fingerprints.

## Evidence-driven methodology (v3)

The only corpus exception is the already completed and publicly unblinded twelve-case
editorial experiment in `data/experiments/editorial-intelligence-v1/full-ai-review`.
Its exact packet SHA-256 is pinned; frozen judgment bindings are checked before reading.
No raw evaluation folders or sealed cases are scanned. The existing full-review validator
checks accepted imports against these released packets. Host-rendered example lines are
explicitly identified as derived comparison lines, not original JSON file line numbers.

The first cycle compares EI-003, EI-004 and EI-005, including complete SOURCE, OBJECTIVE,
direct and specialized texts and the frozen review limitations. Subsequent cycles rotate
three-case groups across the same released corpus. All naturalness ratings were 5/5;
Qwen must not invent artificial direct prose or interpret semantic rejection as poor style.
These experimental outputs do not establish causation by a production prompt.

Every cycle records three observations, interpretations and limitations, and at most one
recommendation. Each recommendation requires actual engine and output citations, a
root-cause hypothesis, writing principle, concrete change, predicted benefit, regressions,
falsifiable experiment, adversarial challenge, confidence and uncertainty. Existing
preservation features must not be re-proposed as new. Empty findings are acceptable.
Literal citation validation does not independently validate the model's interpretation.

The existing smoke operation also serves as a one-cycle methodology check; its report
remains explicitly provisional. Resource ownership, idle scheduling, original skill files,
six-hour reporting and historical notes remain intact. No production changes are made.
