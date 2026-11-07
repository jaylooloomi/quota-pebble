# Native completion notifications — v1.25.0

Claude Code and Antigravity now route qualified local completion evidence to the
existing green notification card. Blue idle notices remain a separate fallback.
The shared completion/idle setting, 12-second hover-paused timer, close/view
actions, header-adjacent positioning and four locales are retained.

## Evidence gates

- Both sources require an observed running task, continuous fresh observations,
  then two idle observations at least 5 seconds apart with the same terminal
  evidence. Initial idle/history, missing/unknown sources and reconnect baselines
  cannot replay completions. Duplicate evidence is suppressed.
- Claude uses the process-verified registry and exact session's local transcript
  tail. Only a latest non-sidechain, non-error assistant `end_turn` with a valid
  UUID/session/timestamp qualifies. Later input, tool continuation or errors
  invalidate it. System/Hook records are not used. Reads are capped at 128KiB,
  at most 8 eligible sessions per poll, round-robin; no message content persists.
  Missing evidence is retried for at most two minutes after becoming idle.
- Antigravity uses the existing `GetAllCascadeTrajectories` summary only, with
  `EXECUTOR_TERMINATION_REASON_NO_TOOL_CALL`, matching input timestamp/index,
  valid increasing step count and fresh modification time. Unknown termination,
  cancellation and errors do not qualify. No extra detail RPC, CLI or Hook is
  required. Unsupported versions continue to provide blue idle notifications.

"Completed" means the observed agent response/turn finished normally, not that
its output or every requested business outcome was independently verified.

## Verification and limits

Read-only live inspection on 2026-11-04 found 5 verified idle Claude registrations,
2 readable normal end-turn records, and one Antigravity task with normal terminal
metadata. These existing idle tasks deliberately did **not** generate alerts.
No naturally running-to-completed transition was triggered for this verification.
Deterministic monitor-to-bubble tests cover new transitions for both providers.

Sources: [Claude session storage](https://code.claude.com/docs/en/sessions),
[normal API stop reasons](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons),
[Antigravity native trajectory reference](https://github.com/jijiamoer/antigravity-trajectory-extractor).
Native schemas can change; unsupported/missing evidence is not guessed.
