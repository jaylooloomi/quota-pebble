<h1 align="center">Quota Pebble <img src="src/ui/icons/quota-pebble.png" width="36" height="36" alt="Lavender-spotted hatching egg logo"></h1>
<p align="center"><b>Three AI subscriptions. One tiny island.</b><br>See how much quota is left in Claude, Codex, and Antigravity and when it resets. Pace your usage and follow tasks on authorized remote devices.</p>
<!-- project-badges -->
<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat"></a>
  <a href="https://github.com/jaylooloomi/quota-pebble/releases/latest"><img alt="Latest GitHub release" src="https://img.shields.io/github/v/release/jaylooloomi/quota-pebble?style=flat&color=8b87de"></a>
  <a href="#get-started"><img alt="Windows and macOS downloads" src="https://img.shields.io/badge/platform-Windows%20%2B%20macOS-64748b?style=flat"></a>
  <a href="#run-from-source"><img alt="Built with Electron and TypeScript" src="https://img.shields.io/badge/built%20with-Electron%20%2B%20TypeScript-487fa8?style=flat"></a>
  <a href="#what-you-can-do"><img alt="Interface languages: Traditional Chinese, English, Japanese, Korean" src="https://img.shields.io/badge/UI-%E7%B9%81%E4%B8%AD%20%2F%20EN%20%2F%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%2F%20%ED%95%9C%EA%B5%AD%EC%96%B4-637e64?style=flat"></a>
  <a href="https://github.com/jaylooloomi/quota-pebble/actions/workflows/build.yml"><img alt="View actual GitHub Actions results" src="https://img.shields.io/badge/CI-view%20runs-64748b?style=flat"></a>
</p>
<!-- /project-badges -->

<p align="center"><a href="https://github.com/jaylooloomi/quota-pebble/releases/latest">Download for Windows x64</a> · <a href="README.zh-TW.md">繁體中文</a></p>

<p align="center"><a href="#remote-tasks"><img src="docs/remote/remote-badge.svg" width="202" height="38" alt="Windows remote task monitoring for Claude Code, Codex, and Antigravity"></a></p>

<p align="center"><img src="docs/readme-v1.16.10/stage-en.png" alt="Quota Pebble showing provider quotas and a desktop companion" width="464"><br><sub>Windows app screenshot · demo data</sub></p>

## What you can do

- **Track quotas** for Claude, Codex, and Antigravity / Gemini Code Assist in a compact desktop panel. View remaining or used quota, reset times, and model limits when available. Claude accounts are tracked separately.
- **Plan usage** with an adjustable reserve (10% by default). Usage trends offer 8 hours, 1 day, 7 days, and 30 days, with relative change or absolute quota percentage. History stays on your device for up to 90 days / 50 MiB. [Trend details](https://github.com/jaylooloomi/quota-pebble/blob/v1.32.3/docs/relative-usage-trends.md)
- **Follow tasks** on this device or an authorized remote device. The Tasks tab shows status and source, with reminders for supported completion or idle transitions.
- **Customize the island** with provider order, visibility, screen-edge snapping, always-on-top, and optional desktop companions. The interface supports Traditional Chinese, English, Japanese, and Korean. Press `Ctrl / Command + Alt + Q` to show or hide it.

<details>
<summary>Watch the introduction</summary>

<img src="docs/videos/intro-01-en.gif" alt="English promotional animation" width="640">

</details>

## Get started

1. Download the [latest Windows x64 portable EXE](https://github.com/jaylooloomi/quota-pebble/releases/latest) and run it. For macOS, the [v1.16.10 release](https://github.com/jaylooloomi/quota-pebble/releases/tag/v1.16.10) provides ZIPs for Apple silicon and Intel Macs.
2. Open **Accounts** and connect the services you use. In Windows v1.32.3, Claude sign-in uses a dedicated Google Chrome window. Pebble closes it after detecting sign-in and then verifies your account and organization and syncs quota. If the window stays open, close it manually to continue.
3. Open **Quota** for usage and reset times, **Pacing** for a suggested budget, or **Tasks** for activity.

## Data sources

| Service | Quota | Task status |
| --- | --- | --- |
| Claude | The signed-in Chrome session queries Claude’s internal web quota endpoint. Each account normally refreshes every 15 minutes. | Local Claude Code task registration and authorized Remote Control sessions. |
| Codex | The official app-server quota RPC uses your ChatGPT subscription sign-in. Install and sign in with the [Codex CLI](https://developers.openai.com/codex/cli). | Local event records and the official relay’s task RPC for authorized devices. |
| Antigravity / Gemini | Antigravity’s local quota service requires it to be running and signed in. Enterprise Gemini Code Assist is an alternative quota source. | Antigravity’s local task RPC and Google’s official Remote Control relay. |

The numbers represent quota percentages. Codex and Gemini normally refresh about every two minutes. Manual refresh follows the same cooldown, and HTTP 429 retry times persist across restarts.

### Remote tasks

Remote task monitoring has been verified on Windows. The source computer must be online with the provider’s remote access authorized. Pebble labels inferred local states and reports stale or unconfirmed status as **Unknown**. Claude remote coverage is for Code sessions.

[Local monitoring](docs/design/task-monitor/LOCAL-SESSIONS.zh-TW.md) · [Claude Remote Control](docs/claude-remote-tasks.md) · [Codex remote relay](docs/windows-remote-controller-research.md) · [Antigravity remote relay](docs/antigravity-remote-research.md)

<details>
<summary>Screenshots and demo animations</summary>

Windows screenshots show demo data. The GIFs are AI-generated promotional animations.

| Quota | Pacing |
| --- | --- |
| <img src="docs/readme-v1.16.10/quota-en.png" width="400" alt="Quota panel"> | <img src="docs/readme-v1.16.10/pacing-en.png" width="400" alt="Pacing view"> |

[Accounts](docs/readme-v1.16.10/accounts-en.png) · [Companions](docs/readme-v1.16.10/settings-pets-en.png) · [Remote task illustration](docs/remote/remote-overview-en.svg) · [More demos](docs/videos/README.md) · [Visual provenance](docs/readme-v1.16.10/PROVENANCE.md)

<img src="docs/videos/intro-02-zh-TW.gif" alt="Pacing and desktop companions promotional animation with Traditional Chinese captions" width="640">

</details>

## Run from source

Use Node.js 24. Live Claude login and quota sync were verified on Windows. macOS packaging and demo checks run through CI.

```sh
npm ci
npm start
npm test
npm run test:coverage
```

[GitHub Actions](https://github.com/jaylooloomi/quota-pebble/actions/workflows/build.yml)

## License and author

Created by Arthur Wang ([@jaylooloomi](https://github.com/jaylooloomi)). Feedback and contributions are welcome through [Issues](https://github.com/jaylooloomi/quota-pebble/issues) or pull requests.

Licensed under [MIT](LICENSE). Redistribution requires retaining the original copyright and MIT permission notices. [Third-party notices](THIRD_PARTY_NOTICES.md)
