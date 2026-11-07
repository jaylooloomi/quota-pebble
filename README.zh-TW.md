<h1 align="center">Quota Pebble <img src="src/ui/icons/quota-pebble.png" width="36" height="36" alt="Lavender-spotted hatching egg logo"></h1>
<p align="center"><b>三家 AI 訂閱，一顆桌面小島。</b><br>隨時知道 Claude、Codex 和 Antigravity 還能用多少、何時重置。用配速把額度留到需要的時候，也能查看已授權遠端裝置上的 AI 任務。</p>
<!-- project-badges -->
<p align="center">
  <a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-3b82f6?style=flat"></a>
  <a href="https://github.com/jaylooloomi/quota-pebble/releases/latest"><img alt="Latest GitHub release" src="https://img.shields.io/github/v/release/jaylooloomi/quota-pebble?style=flat&color=8b87de"></a>
  <a href="#三步開始"><img alt="Windows and macOS downloads" src="https://img.shields.io/badge/platform-Windows%20%2B%20macOS-64748b?style=flat"></a>
  <a href="#從原始碼執行"><img alt="Built with Electron and TypeScript" src="https://img.shields.io/badge/built%20with-Electron%20%2B%20TypeScript-487fa8?style=flat"></a>
  <a href="#能做什麼"><img alt="Interface languages: Traditional Chinese, English, Japanese, Korean" src="https://img.shields.io/badge/UI-%E7%B9%81%E4%B8%AD%20%2F%20EN%20%2F%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%2F%20%ED%95%9C%EA%B5%AD%EC%96%B4-637e64?style=flat"></a>
  <a href="https://github.com/jaylooloomi/quota-pebble/actions/workflows/build.yml"><img alt="View actual GitHub Actions results" src="https://img.shields.io/badge/CI-view%20runs-64748b?style=flat"></a>
</p>
<!-- /project-badges -->

<p align="center"><a href="https://github.com/jaylooloomi/quota-pebble/releases/latest">下載 Windows x64</a> · <a href="README.md">English</a></p>

<p align="center"><a href="#遠端任務"><img src="docs/remote/remote-badge.svg" width="202" height="38" alt="Windows 支援 Claude Code、Codex、Antigravity 遠端任務監控"></a></p>

<p align="center"><img src="docs/readme-v1.16.10/stage-zh-TW.png" alt="Quota Pebble 顯示各家配額與桌面小夥伴" width="464"><br><sub>Windows 實際截圖 · 展示資料</sub></p>

## 能做什麼

- **查看配額**。在桌面小島查看 Claude、Codex、Antigravity／Gemini Code Assist 的剩餘量、已用量、重置時間與可取得的模型細分。Claude 多帳號分開顯示。
- **安排用量**。配速可調整保留比例，預設為總配額的 10%。使用趨勢支援近 8 小時、1 天、7 天、30 天，可切換相對變化與絕對比例。紀錄在本機保存，最多 90 天／50 MiB。[趨勢計算方式](https://github.com/jaylooloomi/quota-pebble/blob/v1.32.3/docs/relative-usage-trends.md)
- **追蹤任務**。在「任務」分頁查看本機與已授權遠端裝置的狀態和來源，支援的完成及閒置事件會顯示提醒。
- **調整桌面小島**。可排序、隱藏服務、貼齊螢幕邊緣、保持最上層及選擇桌面寵物。支援繁中、英文、日文和韓文。按 `Ctrl／Command + Alt + Q` 顯示或隱藏。

<details>
<summary>觀看介紹動畫</summary>

<img src="docs/videos/intro-01-zh-TW.gif" alt="中文介紹動畫" width="640">

</details>

## 三步開始

1. 下載並執行[最新版 Windows x64 免安裝 EXE](https://github.com/jaylooloomi/quota-pebble/releases/latest)。macOS 可從 [v1.16.10 發布頁](https://github.com/jaylooloomi/quota-pebble/releases/tag/v1.16.10)下載 Apple 晶片或 Intel 對應的 ZIP。
2. 在「帳號」連接需要的服務。Windows v1.32.3 會用 Google Chrome 專用視窗登入 Claude。Pebble 辨識到登入完成後會關閉視窗，再確認帳號與組織並同步配額。若視窗仍開著，手動關閉即可接續同步。
3. 到「配額」查看用量和重置時間，切到「配速」規劃用量，或到「任務」看執行狀態。

## 資料來源

| 服務 | 配額／使用量 | 任務狀態 |
| --- | --- | --- |
| Claude | 使用 Chrome 登入工作階段查詢 Claude 非公開網頁配額端點，每帳號通常每 15 分鐘更新。 | Claude Code 本機任務登錄與已授權的 Remote Control 工作階段。 |
| Codex | 官方 app-server 的配額 RPC，使用 ChatGPT 訂閱登入。請安裝並登入 [Codex CLI](https://developers.openai.com/codex/cli)。 | 本機事件紀錄與官方中繼的任務 RPC。 |
| Antigravity／Gemini | Antigravity 本機配額服務需保持執行並登入。也可選擇企業 Gemini Code Assist 來源。 | Antigravity 本機任務 RPC 與 Google 官方 Remote Control 中繼。 |

畫面數字代表配額比例。Codex 與 Gemini 通常約每兩分鐘更新。手動更新也遵守冷卻時間，HTTP 429 的重試時間會跨重啟保留。

### 遠端任務

遠端任務監控已在 Windows 驗證。來源電腦須保持連線，並完成各服務的遠端授權。本機推定狀態會有標記，過期或無法確認的狀態顯示「未知」。Claude 遠端監控涵蓋 Code 工作階段。

[本機監控範圍](docs/design/task-monitor/LOCAL-SESSIONS.zh-TW.md) · [Claude Remote Control](docs/claude-remote-tasks.md) · [Codex 遠端中繼](docs/windows-remote-controller-research.md) · [Antigravity 遠端中繼](docs/antigravity-remote-research.md)

<details>
<summary>功能截圖與展示動畫</summary>

Windows 截圖使用展示資料。GIF 為 AI 生成的介紹動畫。

| 配額 | 配速 |
| --- | --- |
| <img src="docs/readme-v1.16.10/quota-zh-TW.png" width="400" alt="配額畫面"> | <img src="docs/readme-v1.16.10/pacing-zh-TW.png" width="400" alt="配速畫面"> |

[帳號管理](docs/readme-v1.16.10/accounts-zh-TW.png) · [寵物設定](docs/readme-v1.16.10/settings-pets-zh-TW.png) · [遠端任務示意](docs/remote/remote-overview-zh-TW.svg) · [更多介紹動畫](docs/videos/README.md) · [圖片來源](docs/readme-v1.16.10/PROVENANCE.md)

<img src="docs/videos/intro-02-zh-TW.gif" alt="額度、配速與桌面小夥伴介紹動畫" width="640">

</details>

## 從原始碼執行

建議使用 Node.js 24。Claude 真實登入和配額同步已在 Windows 驗證。macOS 打包及展示模式檢查透過 CI 執行。

```sh
npm ci
npm start
npm test
npm run test:coverage
```

[GitHub Actions](https://github.com/jaylooloomi/quota-pebble/actions/workflows/build.yml)

## 授權與作者

作者 Arthur Wang（[@jaylooloomi](https://github.com/jaylooloomi)）。歡迎透過 [Issues](https://github.com/jaylooloomi/quota-pebble/issues) 或 Pull Request 分享回饋與貢獻。

本專案採用 [MIT 授權](LICENSE)。再散布時須保留原著作權及 MIT 授權聲明。[第三方聲明](THIRD_PARTY_NOTICES.md)
