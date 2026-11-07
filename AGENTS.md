# Quota Pebble — project instructions

## Explicit user requirement: task/session monitoring

- Do not launch Codex CLI, `codex exec`, app-server or proxy for task monitoring.
- Do not install, read or depend on lifecycle Hooks for task monitoring.
- Read Codex's existing local session records in read-only mode. Use bounded,
  incremental reads; never scan an entire large transcript every refresh.
- Store only task metadata and event evidence, not prompts, tool arguments,
  outputs, credentials or raw conversation bodies.
- Mark derived status as inferred. Missing, stale, incomplete or unsupported
  evidence must not be represented as confirmed running or idle.
- Preserve the three-row task list and its scrollbar, fixed compact geometry,
  four languages and scroll position during updates.
- Verify against naturally running Desktop chats without starting test inference.
- Do not use computer-use tools. Command-line inspection and programmatic tests
  are allowed.

These restrictions apply to task monitoring. Subscription quota fetching is a
separate existing feature and must not be used as evidence of task execution.

## Explicitly authorized remote monitoring

- The user subsequently requested integration of already authorized remote Codex
  devices through the official relay. This extends the local-only source scope.
- Use only existing current-user enrollment and matching public-key evidence.
  Windows CNG may sign validated official challenges; never export private keys,
  modify official App binaries, reset pairing or impersonate an assistant chat.
- Remote task RPCs are limited to initialization, `thread/list`, `thread/read`
  without turns, and `thread/turns/list` limited to the latest turn with
  `itemsView: notLoaded` (completion metadata only; no turn items). Do not resume threads, start tasks or send approvals.
- Remote snapshots retain task metadata only. Disconnect, expired observations,
  unsupported runtime states and failed reads must be represented as unknown.
