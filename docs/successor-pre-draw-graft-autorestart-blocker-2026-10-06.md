# Successor pre-draw Graft auto-restart blocker

Recorded 2026-10-06T05:49:41Z. This report covers the authorized narrow
housekeeping continuation only. No scientific implementation or client execution
began: the three-clean-status gate never passed. No stash or quarantined Graft
contents were inspected. The original blocker report remains committed.

The baseline ancestor check exited 0. The only intervening commit was the
authorized documentation commit `04251339bf62649d0031517b6d4774aa2bfc7d9a`,
changing only the prior 107-line blocker report. This authorized descendant was
accepted for housekeeping; neither history nor experimental registration was
rewritten. The original baseline remains `87654bccd00195b6dee2636bbb38fd70d787e3c4`.

Reidentification with `ps` and `lsof` established PID 33321, owned by
`nicholaslippa`, running `/opt/homebrew/bin/node /opt/homebrew/bin/graft mcp`
in `/Users/nicholaslippa/whodunnit`. Parent PID 14199 was the account's managed
Codex app-server daemon. User-authorized `kill -TERM 33321` exited 0. After a
three-second wait it was absent; remaining Graft processes had unrelated working
directories and were untouched. `mv -n` then preserved the whole directory at
`/Users/nicholaslippa/whodunnit-quarantine/graft-20261006T054000Z-33321`.
The source was absent and destination existed immediately afterward.

The first post-move status showed ` M .gitignore` and `?? .ignore`.
Both had modification time Oct 6 00:35:47 local; `.ignore` was created then.
Read-only inspection found only the exact Graft-generated append in `.gitignore`
and the 180-byte Graft ripgrep configuration in `.ignore`. Installed source
`/opt/homebrew/lib/node_modules/@nanonets/graft/dist/context/node-file.js`
lines 101 and 146–147 contains the matching templates. The full modified
`.gitignore` was preserved with `cp -n` at
`/Users/nicholaslippa/whodunnit-quarantine/gitignore-graft-20261006T054000Z-33321`;
`.ignore` was moved intact with `mv -n` to
`/Users/nicholaslippa/whodunnit-quarantine/ignore-graft-20261006T054000Z-33321`.
Only the generated append was removed. `git show HEAD:.gitignore | cmp - .gitignore`
exited 0, proving byte equality with the committed file. No reset was used.

The next status again showed `?? graft/`; its directory metadata showed Oct 6
00:48 local. A new PID 88667 ran Graft MCP under the same parent 14199 with the
same repository working directory. Process restart and directory reappearance
are observed; exact causal timing was not traced. The recreated directory was
left untouched. No repeated kill, global config edit, or supervisor termination
was attempted.

The relevant account configuration at
`/Users/nicholaslippa/.codex-account-2/config.toml` lines 109–111 registers
`[mcp_servers.graft]`, `command = "graft"`, `args = ["mcp"]` at user scope.
No project `.codex/config.toml` exists. A corresponding user-level registration
was observed in the default account config, which was also untouched. Available
tool metadata exposed no runtime MCP-disable facility; local daemon files yielded
no discoverable configuration documentation by filename. A supported live
session-scoped disable was not established. This is a limitation of the evidence,
not a claim that such a facility cannot exist. Editing shared user settings would
not prove current-session reload or satisfy the required narrow scope.

## Complete report fields

1. Process: repository-associated Graft MCP under managed Codex app-server.
2. PIDs: original 33321; replacement 88667; common parent 14199.
3. Ownership: original owned by nicholaslippa; repository CWD and account daemon association verified; unrelated Graft processes untouched.
4. Stop: narrowly authorized SIGTERM to 33321 succeeded; original absent after three seconds.
5. Restart: replacement 88667 observed under the same supervisor and repository CWD.
6. Quarantine: whole original directory and both generated ignore sidecars preserved at the three exact paths above, with no overwrite or deletion.
7. Reappeared: yes; repository `graft/` reappeared after successful move and remains untouched.
8. Three clean checks: not achieved; first post-move gate failed with ignore side effects, and the next attempted gate failed with `?? graft/`. Second and third clean checks were not completed.
9. Baseline: `87654bccd00195b6dee2636bbb38fd70d787e3c4`.
10. Blocker commit: `04251339bf62649d0031517b6d4774aa2bfc7d9a`.
11. Ancestry: baseline ancestor of accepted HEAD; check exit 0.
12. Unexpected commits: none between baseline and accepted HEAD; sole diff was the authorized previous report.
13. Accepted HEAD: `04251339bf62649d0031517b6d4774aa2bfc7d9a` for this continuation; report commits preserve baseline ancestry.
14. Native call graph: not assessed—startup blocked.
15. Capture boundary: not assessed—startup blocked.
16. Bootstrap equivalence: not assessed—startup blocked.
17. Account/config equivalence: not assessed—startup blocked.
18. Fail-closed interception: not assessed—startup blocked.
19. Independent dispatch guard: not assessed—startup blocked.
20. Capture dispatch: zero in this continuation.
21. Registered binary (user assertion): `/Users/nicholaslippa/.local/share/claude/versions/2.1.288`.
22. Version (user assertion): 2.1.288; unverified in this continuation.
23. Required SHA-256 (user assertion): `bbe93063f7a0879a1021b2891e5c9354e5b3b98433e32efe6750f7710afed750`; unverified.
24. Requested model (user assertion): `claude-sonnet-5-5`.
25. Resolved model: not assessed—startup blocked.
26. Fallback: not assessed—startup blocked.
27. Low effort: not assessed—startup blocked.
28. Medium effort: not assessed—startup blocked.
29. High effort: not assessed—startup blocked.
30. Xhigh effort: not assessed—startup blocked.
31. Max effort: not assessed—startup blocked.
32. Effort clamps/normalization: not assessed—startup blocked.
33. Effort validity: not assessed—startup blocked.
34. All 16 non-effort profiles: not assessed—startup blocked.
35. Profile artifact/hash: not assessed—startup blocked.
36. Prompt hashes: not assessed—startup blocked.
37. Schema hashes: not assessed—startup blocked.
38. Invariant: not assessed—startup blocked.
39. Reasoning: not assessed—startup blocked.
40. Temperature: not assessed—startup blocked.
41. Top-p: not assessed—startup blocked.
42. Top-k: not assessed—startup blocked.
43. Maximum output: not assessed—startup blocked.
44. Tools/MCP execution contract: not assessed—startup blocked.
45. Permissions/hooks execution contract: not assessed—startup blocked.
46. Persistence: not assessed—startup blocked.
47. Retries: not assessed—startup blocked.
48. Timeout: not assessed—startup blocked.
49. Repair: not assessed—startup blocked.
50. Extra body: not assessed—startup blocked.
51. Environment precedence: not assessed—startup blocked.
52. Unresolved execution fields: not verified in this continuation; existing resolution status unknown.
53. Draw hash: not assessed—startup blocked.
54. Target query: zero; fixed target remains 2026-10-15 00:00 UTC, not queried.
55. Effort selection: none in this continuation.
56. Capture-equivalence audit: not performed—startup blocked.
57. Dispatch-safety audit: not performed—startup blocked.
58. Contract-completeness audit: not performed—startup blocked.
59. Findings: Graft auto-restart and directory reappearance prevent stable startup cleanliness.
60. Lock created: no lock created in this continuation; existing artifacts not inspected.
61. Lock integrity: not assessed—startup blocked.
62. Unresolved lock requirements: unverified in this continuation; existing resolution status unknown.
63. Required selected state: AWAITING_PREREGISTERED_NIST_PULSE; no selection made; existing artifact not inspected.
64. Decision: D — CAPTURE SAFETY STILL NOT PROVEN; preserves prior decision without new capture evidence.
65. State: PREREGISTERED — BLOCKED, retained from user assignment.
66. Exact blocker: GRAFT AUTO-RESTART BLOCKER; replacement repo-associated MCP and recreated untracked `graft/`, with no proven narrow live disable.
67. Model inference: zero in this continuation.
68. Model endpoint dispatch: zero in this continuation.
69. Target Beacon queries: zero in this continuation.
70. Successor cases: zero generated in this continuation.
71. Prelabels: zero generated in this continuation.
72. RAW: zero generated in this continuation.
73. V15/A/B/C/D execution, blind review and scoring: zero in this continuation.
74. Candidate changes: zero in this continuation.
75. V16 execution/changes: zero in this continuation.
76. Production changes and protocol amendments: zero in this continuation.
77. Experimental paid-model spend: zero in this continuation; orchestration cost not assessed.
78. Validation: offline history/status/metadata checks and exact .gitignore byte comparison; substantive scientific suite not run. Staged documentation whitespace check is required before commit.
79. Report: `docs/successor-pre-draw-graft-autorestart-blocker-2026-10-06.md`.
80. Commit: commit containing this report (see `git log -- docs/successor-pre-draw-graft-autorestart-blocker-2026-10-06.md`).
81. Push: none in this continuation.
82. Deploy: none in this continuation.
83. Exact next permitted task: narrowly disable this session's Graft MCP through a supported Codex supervisor runtime facility, without affecting unrelated sessions; verify the repository-associated process is gone and stays gone; quarantine the recreated directory once after its cause is disabled; perform three empty status checks separated by waiting and ordinary read-only repository activity, validate baseline ancestry and documentation-only authorized descendants, then continue the entire successor pre-draw capture/lock mission from the beginning under every experimental prohibition.
