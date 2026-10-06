# Successor pre-draw housekeeping blocker

Recorded 2026-10-06T05:33:47Z. This report covers this attempt only. The startup
gate failed, so no experimental implementation or validation began. No cache
contents, quarantined directory, or Git stash was inspected or used.

Read-only commands included `git status --short`, `git rev-parse HEAD`, `find`
for filenames and nested `.git` metadata, `stat`, `ps` process metadata, and
`lsof` working-directory/open-file metadata. Process inspection required sandbox
approval. No process was stopped and no directory was moved.

The observed file was `graft/.cache/telemetry-repo-id.json`, 54 bytes, created
and modified Oct 6 00:27:00 2026 (local machine time). The directory `graft/`
was created and modified at that time; `.cache/` was modified Oct 6 00:31:26.
No nested `.git` was found within the inspected depth of two. PID 33321,
PPID 14199, ran `/opt/homebrew/bin/node /opt/homebrew/bin/graft mcp`; `lsof`
identified its working directory as `/Users/nicholaslippa/whodunnit`. Its open
files included installed Graft native modules but no open cache file was shown.

Installed-tool source, not repository/cache evidence, identifies a possible
recreation mechanism: `/opt/homebrew/lib/node_modules/@nanonets/graft/dist/telemetry/identity.js` lines 68–77
creates `cacheDir(repo)/telemetry-repo-id.json` when absent. `telemetry/gate.js`
at `/opt/homebrew/lib/node_modules/@nanonets/graft/dist/telemetry/gate.js`
documents `DO_NOT_TRACK` and the persistent telemetry-disable setting. Neither
was changed or executed. An associated active process is established; causal
recreation during this attempt is not empirically established.

## Complete report fields

1. Original directory: `/Users/nicholaslippa/whodunnit/graft/`.
2. Diagnosis: active associated Graft MCP; ordinary inactivity not established.
3. Quarantine destination: none chosen; existing parent `/Users/nicholaslippa/whodunnit-quarantine` observed by metadata only.
4. Moved: no.
5. Reappeared: unknown; no move occurred in this attempt.
6. Initial status: exact output `?? graft/` followed by newline, exit 0.
7. Repeated status: exact output `?? graft/` followed by newline, exit 0.
8. HEAD: `87654bccd00195b6dee2636bbb38fd70d787e3c4`, matching required HEAD at both checks.
9. Native capture path: not assessed—startup blocked.
10. Interception boundary: not assessed—startup blocked.
11. Bootstrap preservation: not assessed—startup blocked.
12. Fully constructed request: not assessed—startup blocked.
13. Fail-closed proof: not assessed—startup blocked.
14. Independent dispatch guard: not assessed—startup blocked.
15. Capture dispatches: zero in this attempt.
16. Registered client path (user assertion): `/Users/nicholaslippa/.local/share/claude/versions/2.1.288`.
17. Registered version (user assertion): 2.1.288; not independently verified.
18. Required SHA-256 (user assertion): `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`; not verified.
19. Requested model (user assertion): `claude-sonnet-5-5`.
20. Resolved model: not assessed—startup blocked.
21. Fallback behavior: not assessed—startup blocked.
22. Low effort: not assessed—startup blocked.
23. Medium effort: not assessed—startup blocked.
24. High effort: not assessed—startup blocked.
25. Xhigh effort: not assessed—startup blocked.
26. Max effort: not assessed—startup blocked.
27. Effort normalization: not assessed—startup blocked.
28. Effort validity: not assessed—startup blocked.
29. All 16 non-effort profiles: not assessed—startup blocked.
30. Profile artifact/hash: not assessed—startup blocked.
31. Prompt hashes: not assessed—startup blocked.
32. Schema hashes: not assessed—startup blocked.
33. Profile invariant: not assessed—startup blocked.
34. Reasoning fields: not assessed—startup blocked.
35. Temperature: not assessed—startup blocked.
36. Top-p: not assessed—startup blocked.
37. Top-k: not assessed—startup blocked.
38. Maximum output: not assessed—startup blocked.
39. Tools/MCP: not assessed for execution contract—startup blocked.
40. Permissions/hooks: not assessed for execution contract—startup blocked.
41. Persistence: not assessed—startup blocked.
42. Retries: not assessed—startup blocked.
43. Timeout: not assessed—startup blocked.
44. Repair: not assessed—startup blocked.
45. Extra body fields: not assessed—startup blocked.
46. Environment precedence: not assessed—startup blocked.
47. Execution fields: not verified in this attempt; existing resolution status unknown.
48. Draw hash: not assessed—startup blocked.
49. Target query: zero in this attempt; fixed target remains 2026-10-15 00:00 UTC.
50. Effort selection: none in this attempt.
51. Capture-equivalence audit: not performed—startup blocked.
52. Dispatch-safety audit: not performed—startup blocked.
53. Contract-completeness audit: not performed—startup blocked.
54. Audit findings: active-process housekeeping blocker only; no experiment findings.
55. Lock created: no lock created in this attempt; existing artifacts not inspected.
56. Lock integrity: not assessed—startup blocked.
57. Lock requirements: not verified in this attempt; existing resolution status unknown.
58. Required pending state: AWAITING_PREREGISTERED_NIST_PULSE; no selection made in this attempt; existing artifact not inspected.
59. Decision: D — CAPTURE SAFETY STILL NOT PROVEN; preserves prior D, does not establish new capture evidence.
60. Successor state: PREREGISTERED — BLOCKED (user assertion, retained).
61. Exact blocker: dirty startup status `?? graft/` and active associated Graft MCP prevent metadata-safe inactive-directory quarantine.
62. Model inference calls: zero in this attempt.
63. Model endpoint dispatches: zero in this attempt.
64. Target Beacon queries: zero in this attempt.
65. Successor cases generated: zero in this attempt.
66. Prelabels generated: zero in this attempt.
67. RAW generated: zero in this attempt.
68. V15/A/B/C/D arm execution, blind review and scoring: zero in this attempt.
69. Candidate changes: zero in this attempt.
70. V16 execution/changes: zero in this attempt.
71. Production changes and protocol amendments: zero in this attempt.
72. Experimental paid-model spend: zero in this attempt; orchestration cost not assessed.
73. Validation: offline status and HEAD checks and staged-report whitespace validation only; substantive suite not run.
74. Durable report: `docs/successor-pre-draw-housekeeping-blocker-2026-10-06.md`.
75. Commit: commit containing this report (see `git log -- docs/successor-pre-draw-housekeeping-blocker-2026-10-06.md`).
76. Push: none in this attempt.
77. Deploy: none in this attempt.
78. Exact next permitted task: obtain user authorization to stop/reconfigure the associated session Graft MCP, or otherwise establish its inactivity; then perform metadata-safe quarantine without overwrite or deletion, verify absence/destination and two clean status gates with exact registered HEAD, and continue the entire committed successor pre-draw capture/lock mission from the beginning under all prohibitions.
