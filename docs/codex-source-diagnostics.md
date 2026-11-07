# Codex source diagnostics — 2026-11-04

## Reported issue

The work PC installed the latest published GitHub release, v1.28.2. Its remote task monitor is identical to the v1.29.1 monitor previously running on the home PC, so version age alone does not explain missing tasks.

The home PC reader and existing app both observed three running local Codex chats. This does not establish what the work PC can read. The work PC's own diagnostics have not yet been collected.

## Confirmed defects and changes in v1.29.2

- A usable controller socket previously marked the remote source available even if every host task query failed. Per-host errors were swallowed. A readable local source also made the aggregate Codex badge look connected.
- The local Codex badge now explicitly identifies the local source. A separate expandable remote source section displays each host and its query result.
- Online + RPC_TIMEOUT is explicitly described as an unresponsive task service, not zero running tasks. Unsupported/unloaded runtime states remain unknown.
- Recheck now awaits remote scanning when it starts a scan and can retry repaired local authorization. Existing in-progress scans are not duplicated. Server HTTP 429 cooldown cannot be bypassed; Retry-After is honored.
- Copy diagnostics exports only version, machine name, source health, bounded counts, timestamps and safe error codes. No task titles, project paths, environment IDs, tokens, raw responses or conversation content are copied.

## Verification

- 215 unit tests passed, including online-host query failure, recovered host status, unloaded runtime, cooldown preservation and diagnostic redaction.
- Real Electron UI regression: four locales × four source states; widths fit; copy diagnostics IPC exercised; clipboard text restored after the test.
- Existing task panel regression passed: fixed header, three-row task viewport, filters, metadata layout and no quota calls.
- These source-health failure/recovery tests are fixtures. They do not establish that the work PC's missing three tasks have recovered.

## Next evidence

Update the work PC, open Tasks → Remote sources → Copy diagnostics, and share the report. The actual work-PC failure may be authorization, task-service connection, timeout or unsupported runtime state; do not assume which without its report.

## Company evidence and diagnostic extension — v1.31.1

- The work PC v1.30.1 report shows a readable local source with 17 idle / 0 running / 0 unknown, plus a remote controller error ENROLLMENT_REQUIRED. These are separate source conditions; remote pairing does not by itself explain missing local activity.
- The home reader can read the already-authorized work host. A user-specified task was observed completed, then active on a later read. These are time-specific observations, not proof that the work PC reader is repaired.
- New local diagnostic metadata: default/custom root classification and one-way root fingerprint, indexed/candidate counts, subagent and missing-metadata exclusions, read failures, bytes read/backlog, and ten recent records selected by file modification time. Each record uses a one-way session fingerprint, event/state, timestamps and backlog only; no raw task ID, title, project, transcript or credential is exported.
- Reader-only diagnostic updates are excluded from the task panel render signature, preserving the fast filter and scroll behavior.
- Next evidence must come from the work PC while a natural Codex turn is active. No synthetic inference, CLI launch, Hook installation or pairing change was performed.
# Windows TPM enrollment compatibility (2026-11-05)

## Follow-up: company v1.31.4 initialization timeout (2026-11-06)

The company snapshot captured at 2026-11-05T17:19Z reports successful controller
authentication and an online home environment, but `RPC_INITIALIZE_TIMEOUT`.
The task-list RPC has not been reached. Re-pairing is not justified by this
evidence. Read-only backend checks show that the other enrolled desktop client's
visible-environment list includes the home environment; both hosts advertise
the same app-server version. This does not prove the host's task transport is
responsive.

Bounded home official-App connection logs also show remote stream sequence-gap
recovery events. Those events concern home-to-company connections and do not
prove the reverse direction has the same defect. They warrant transport review,
not a claim that increasing timeouts or changing pairing will repair it.

Primary source review: OpenAI's
[client tracker](https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/remote_control/client_tracker.rs)
starts a transport connection from `initialize` and tracks client/stream pairs;
the [protocol](https://github.com/openai/codex/blob/main/codex-rs/app-server-transport/src/transport/remote_control/protocol.rs)
separates acknowledgements, pings and RPC envelopes. Do not acknowledge arbitrary
frames or change global client sequence counters speculatively. The next control
comparison is whether the official company App can actually load current home
task metadata, rather than merely showing the home environment as connected.

Company v1.31.2 diagnostics subsequently confirmed `controllerConnected: true`
and the home environment online, but a host RPC timeout prevented task reads.
Thus the TPM authentication path has now passed on the actual company machine;
end-to-end task visibility has not.

A bounded independent probe found a separate transport error-handling defect:
when the home controller queried its own home environment, that environment
returned an `error` notification saying it was not paired for that client. The
controller ignored this notification and waited until `RPC_TIMEOUT`. The probe
is not evidence that the company's distinct controller has the same pairing
error. The receive handler now maps this exact error to `REMOTE_HOST_NOT_PAIRED`
immediately, only for matching client/environment/stream. Ordinary task errors
remain separate. No pairing changes are performed. A new company-side response
is needed to distinguish a true timeout from this explicit denial.

Company-side structural diagnostics confirmed an existing `ecdsa_p256_sha256`
enrollment with `protectionClass: hardware_tpm`; all required public fields were
present. The previous controller accepted only `os_protected_nonextractable`
and the `dk_osn_` namespace. This rejected the TPM enrollment before any network
request, incorrectly reporting `ENROLLMENT_REQUIRED`.

The fix supports the matching `hardware_tpm` / `dk_tpm_` namespace through
Microsoft Platform Crypto Provider. The provider's hardware implementation flag,
non-export policy, P-256 algorithm, enrolled public key and returned signatures
remain verified. There is no software downgrade or pairing mutation. Unsupported
algorithm, protection and key format now have distinct error codes.

The company also demonstrated that PowerShell `.ps1` execution is prohibited.
Codex signing therefore uses a compiled, packaged CNG helper instead of a script;
no PowerShell execution policy is changed. The helper opens existing user keys
silently and cannot create/delete keys or export private material.

Validation: unit tests cover both protection classes and reject cross-provider
namespaces, unsupported protections and mutation requests. The native helper
matched the existing home-PC software public key and completed a real official
relay handshake and read-only task scan. This validates the software regression
path, not company TPM hardware access. Company-side TPM signing and remote task
reading require the updated build to be tested on that machine. This fix is
separate from Claude local/remote duplicate task matching.

