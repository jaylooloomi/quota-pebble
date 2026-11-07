# Task idle notifications (v1.24.0)

The blue idle card is a status update, not a successful-completion claim. The
existing green Codex completion card continues to require explicit success proof.

An eligible task must be observed running today (local calendar day), then idle
for at least 30 seconds with at least two distinct, fresh observations. Repeated
renders of the same cached snapshot cannot advance the gate. Each observed
activity cycle can notify once. Notifications have a 10-minute per-task cooldown
and (before v1.28.0) a 60-second global cooldown. As of v1.28.0, different-task
bursts are retained in the [batched notification inbox](batched-task-inbox.md)
instead of being suppressed globally. Same-task cooldown cycles are still dropped.

Initial idle records, missing rows, unknown/stale sources, interruptions in
observation, waiting states, pause/disabled notifications and reconnect baselines
do not generate old idle alerts. Since v1.28.0, hiding the window preserves
observation and queues reminders for when it is shown again. Running after a baseline establishes a new
eligible activity. Successful completion suppresses the corresponding idle
alert; if success proof arrives after a blue card, green replaces it immediately.

Sources are the existing local Codex records, authorized Codex remote metadata,
Claude process-verified registry and Antigravity local RPC. No new CLI, Hooks,
provider quota requests or private receivers are introduced. Since v1.25.0,
Claude/Antigravity can also produce green completion cards when the additional
[native completion evidence gates](native-completion-notifications.md) pass.

The shared **Completion / idle alerts** setting controls both types. Cards remain
visible for 12 seconds, pause dismissal on hover, can be closed, and open the
corresponding task on View task. The main window dimensions do not change. The
arrow anchors to the corresponding provider where visible. Chinese, English,
Japanese and Korean are supported.

As of v1.24.1, both card types use the monitor containing the header to choose
their work area. Placement priority is above the header, outside its right/left
edge, then immediately below the 60px header if neither side fits. Expanding a
trend or settings panel never moves a fallback notice to the panel bottom. The
arrow direction follows placement and the whole notice is clamped to the work
area. Positioning does not resize the main window or restart dismissal timing.

Tests: `npm test`, `node scripts/task-idle-bubble-test.cjs`,
`node scripts/task-bubble-test.cjs`. The idle UI test feeds isolated local fixture
events through the actual monitor and waits the full 30-second gate. Native
provider transition logic is covered with deterministic fixtures; this does not
claim a naturally running Claude or Antigravity task was observed completing.

## Runtime evidence (v1.26.2)

The bounded local diagnostic log (`%APPDATA%/quota-island/logs/diagnostics.jsonl`)
now records `task_monitor` summaries on decision/state changes and at least once
per minute while observations are published. These show the enabled/pause/window
flags, per-provider state counts, tracked/armed/pending counts and decision totals.
Decisions distinguish initial non-running baselines, observed running, pending
idle, observation loss, completion priority and per-task/global cooldown.

`task_notice` events distinguish eligible, queued and shown notifications, plus
hidden, closed, viewed, expired and cleared stages. `shown` means Electron has
made the notice window visible; it does not prove the user read it. No task title,
project path, session identifier, host name or credential is added to these logs.
Logging does not change notification gates or add provider calls. Older versions
did not record this evidence, so past notification display cannot be reconstructed.
