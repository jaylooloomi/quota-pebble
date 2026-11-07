# Claude 漏抓與跨裝置後續驗證

> 2026-11-05 更新：Claude 主要帳號已 HTTP 200，並讀到使用者指定公司任務的 running → idle；已接入 v1.29.3。以下 401 為先前測試快照，參閱 [最新驗證](claude-remote-tasks.md)。

2026-11-04（台灣時間），`codex/remaining-work-roadmap`。

## 本機問題

使用者確認「第二大腦」在這台電腦的 Claude Code。唯讀檢查發現：

- 目前五個官方 Claude Code 子程序對應五筆 `.claude/sessions/<pid>.json`，
  程序身分與原生啟動時間相符，五筆狀態皆 `idle`。
- Claude Desktop 另有 `claude-code-sessions` metadata。這些檔案包含 session 對應、
  專案與最後活動時間，但不是可直接當成 live busy 的狀態介面。
- 搜尋有界 metadata 僅發現一筆更早的第二大腦相關歷史，無法證明就是截圖中那筆執行。
- 約五分鐘以上的原生狀態觀察沒有遇到狀態轉換：五筆 Claude idle、一筆 Antigravity idle。
  沒有啟動推理、CLI 或 Hook，也沒有保存對話內容。

因此目前仍不能宣稱已修復該筆漏抓，也不能把歷史或 App 開著推斷為執行中。
已請使用者在原任務自然執行時提供時間點，再重新對照同一程序／session。
來源徽章提示補上已登錄／載入的數量，明確說明目前來源範圍。

## 新的 Claude Remote Control 查詢方向

參考開源 [claude-rc-api](https://github.com/ThatCrispyToast/claude-rc-api) 的
[介面研究](https://github.com/ThatCrispyToast/claude-rc-api/blob/main/API_REFERENCE.md)，
發現唯讀 `GET https://api.anthropic.com/v1/code/sessions` 可研究。
它不是 Managed Agents 的 `/v1/sessions`，也不是官方保證穩定的第三方 SDK。

只研究／測試清單中繼資料，不使用送訊息、mark-read、presence、事件歷史／串流、
resume、worker 註冊等介面。以 `connection_status` 與 `worker_status` 為候選依據；
`status_bucket` 可能延遲，不能獨立證明正在執行。

本機主要與個人帳號的現有憑證各做一次 GET，兩者皆 HTTP 401。
沒有重試轟炸、更新 refresh token、變更授權或裝置配對。
已請使用者在 Pebble 完成網頁重新授權；未取得 HTTP 200 前不接入正式監控或宣稱成功。

可重跑：`node scripts/claude-remote-metadata-check.cjs --live`。
輸出只包含 HTTP 狀態、筆數與狀態統計，報告位於忽略的 `test-results`；不輸出憑證、
原始回應、使用者名稱、任務內容。此版本腳本的 macOS Keychain 來源尚未接入。

## Antigravity 跨電腦

> 2026-11-05 更新：已實際經 Google 官方 ListInstances／ProxyCommand 讀到公司主機 22 筆摘要及指定任務（IDLE）。尚未整合正式 App，參閱 [最新研究與可重跑腳本](antigravity-remote-research.md)。以下為先前未驗證的歷史快照。

[官方 Remote Control](https://antigravity.google/docs/remote-control/) 確認官方網頁可連到
已啟用的主機，但本次尚未找到／驗證可由 Pebble 獨立使用的唯讀裝置與任務介面。
目前仍使用已有本機服務的 GetAllCascadeTrajectories，不能將它當成遠端所有裝置清單。

## 自然狀態驗收尚未完成

原生來源、完成證據與 UI 已有確定性程式測試，但尚缺同一自然任務的執行→等待、
執行→正常完成、取消與重新連線對照。這與「fixture 測試通過」分開記錄，
不得把未發生的自然事件列為已驗收。
