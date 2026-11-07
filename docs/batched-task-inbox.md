# Batched task notification inbox — v1.28.0

Implements proposal 03. First arrivals collect for 2 seconds. A burst displays
up to 3 different tasks together in one 420px-wide neutral blue card. Completion
rows are green, idle rows blue; each row identifies provider, task and source host
and can open that exact task. One item uses the existing provider card instead.
The main island window is never resized by notifications.

- Multi-item batches display for 20 seconds; single cards retain 12 seconds.
  Hover pauses remaining time. Moving, resizing or changing language does not
  reset the timer. Header-adjacent screen-edge avoidance applies to both forms.
- Clicking View consumes only that row. Other active/pending items remain.
  Close acknowledges the current group and advances to the next eligible group.
  The +N pending badge also advances to the next group.
- Hide/show pauses and resumes the current card and retains pending items.
  New events while hidden enter the in-memory queue. Explicitly disabling alerts
  or exiting the app clears it; it is not a persisted notification history.
- Same task/turn duplicates are ignored. New status for the same task updates
  its existing slot, and completed replaces idle in place. Other tasks are kept.
- Pending metadata is capped at 200 tasks; overflow is counted and presented as
  a separate "view Tasks" summary rather than silently disappearing. No task
  output or conversation content is stored by this queue.
- Global 60-second idle suppression is replaced by batching. The same-task
  10-minute idle cooldown, 30-second stable idle gate, fresh observations,
  successful-completion priority, and silent reconnect baselines remain.

Tests: `npm test`, `node scripts/batched-notice-test.cjs`,
`node scripts/task-bubble-test.cjs`, `node scripts/task-idle-bubble-test.cjs`.
The batch UI test waits the actual 2-second window and more than 20 seconds with
hover on/off, verifies per-row actions, queue retention, provider colors, four
locales, and fixed parent geometry. Tests use isolated fixtures, not inference.
