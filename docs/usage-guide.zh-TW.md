> 歷史完整操作筆記；目前介面尺寸、分支與快速開始請以根目錄 README.zh-TW.md 為準。

# Quota Island

Claude Code、Gemini CLI / Code Assist、Codex 的本機桌面動態島。使用 Electron + TypeScript。

## 使用

Windows 最新成品：`release/0.2.0/Quota Island 0.2.0.exe`（portable），或 `release/0.2.0/win-unpacked/Quota Island.exe`。

0.2.0 已依照設計稿重做收合列、展開面板、剩餘／已用切換、連線狀態與四階段連接畫面。首次升級切換成設計稿的「剩餘」模式，其後會保留你的選擇。原本的排序、登入與來源設定會保留。

1. 啟動後點任一配額或右側箭頭展開；拖曳左側雙點移動。

可直接拖曳上方服務圖示／百分比調整順序，或拖曳展開卡片的標題換位。兩個視圖使用同一順序，重新啟動也會保留。鍵盤可聚焦服務圖示後使用 `Alt + ←/→` 排序。
2. Claude：先安裝 [Claude Code](https://code.claude.com/docs/en/setup)，點「登入 Claude 並同步」。若官方 CLI 使用授權碼流程，將瀏覽器授權頁提供的授權碼貼進 App 出現的欄位，按「完成連接並同步」。授權完成後 App 自動取回配額，不需要自己查看官方用量頁，也不需要按重新整理。
3. Codex：先安裝 [Codex CLI](https://developers.openai.com/codex/cli)，點「登入 Codex」，使用 ChatGPT 訂閱帳號；已有本機登入可直接讀取。
4. Gemini（個人版）：預設讀取 **Antigravity 的 Gemini 模型配額**。開啟並登入 Antigravity 後即可自動讀取，不需要在本工具重做舊 Gemini CLI OAuth。也可點「連接 Antigravity 並同步」。收合列顯示最吃緊的 Gemini 模型，展開列出模型與重設時間。Antigravity 中的 Claude/GPT 額度不會混入獨立的 Claude Code 或 Codex 卡片。
5. 若使用企業 Code Assist，請在設定將「Google 配額來源」改為 Code Assist，再使用原本的 Google OAuth 登入。這是另一個明確區分的來源。

Google 已公告個人 Free/Pro/Ultra 的 Gemini CLI 在 2026-06-18 遷移至 Antigravity CLI。官方 CLI 指令為 `agy`；啟動後用 `/usage`（或 `/quota`）查看配額。本工具顯示的 Antigravity 配額也不是 Gemini 網頁版額度。

登入期間會顯示「等待授權／等待授權碼／同步中／已同步／失敗原因」。完成授權後自動展開 App 並同步配額。瀏覽器登入網站本身不會授權此 App；未連接前不再顯示易混淆的官方頁面箭頭。外部官方 CLI 的授權檔更新也會在 5 秒檢查週期自動偵測並重新讀取。

三家來源預設開啟，各自每 2 分鐘更新。未知顯示「—」，舊資料標記 `*`。手動重新整理仍尊重服務冷卻。設定可切換置頂、90% 用量提醒與監控來源；隱藏的來源停止查詢。切換百分比可看剩餘或已用。全域快捷鍵為 `Ctrl/⌘ + Alt + Q`。

右上角箭頭收合成膠囊；設定內可隱藏到系統匣或結束應用，右鍵系統匣也可暫停、還原或結束。點卡片右上角的連線狀態可管理連接、查看資料來源。成功連接會顯示完成進度，接著自動回到配額。無自動開機啟動設定。

更新按鈕可在短暫的 5 秒防連點時間後立即更新資料；正常背景同步為每 2 分鐘。上游回傳 429 時保留 Retry-After 到本機冷卻檔，重開應用或手動更新不會繞過服務要求。畫面會顯示限流與自動重試倒數。

## 開發與驗證

需要 Node.js 22.16+（建議 Node 24 LTS）與 npm。

```sh
npm ci
npm start
npm test
npm run test:desktop
npm run test:auth
npm run test:order
npm run test:design
npm run test:live
npm run check:live
npm run check:accounts
npm run dist:win
```

`npm run test:desktop` 使用明確標示的展示資料，不會發送 provider 用量請求或啟動登入。`npm run check:live` 在隔離設定目錄讀取本機官方 CLI 授權，不會自動登入、不會輸出 token；報告在 `test-results/live.json`。登入本工具的 Google 帳號需在正常啟動的應用內驗證，隔離測試不會讀取正常應用的加密帳號檔。

完成正常應用內登入後，使用 `npm run check:accounts` 讀取正常應用的加密 Google 授權與兩家官方 CLI 授權，再驗證真實配額。報告在 `test-results/accounts.json`，不含 token。

啟動展示：`npx electron . --demo`。畫面中的數字是展示資料，不能作為帳號驗證。

其他系統在各自平台執行 `npm run dist:mac`／`npm run dist:linux`。macOS ARM64／Intel 的 v1.28.2 原生成品已通過 CI 並加入 Release，採 ad-hoc 簽章，未經 Apple 公證。v1.29.0 開發分支另有 Linux AppImage 與打包版 UI 驗證；Windows portable 尚未簽章。完整證據見 [平台驗證](platform-verification-2026-11-04.md)。

## 授權資料

Claude 與 Codex 由官方 CLI 管理；本工具不自行輪替它們的 refresh token。Claude token 過期時會要求重新登入；也可先在官方 CLI 更新登入再回到本工具。Google 授權以系統加密儲存於應用 userData 的 `gemini-session.bin`。不在 renderer、偏好檔或測試報告存 token。

- Windows userData：`%APPDATA%/quota-island`。
- macOS：`~/Library/Application Support/quota-island`。
- Linux：`~/.config/quota-island`（或系統設定的 XDG 路徑）。需可用的 Secret Service；不支援 plaintext fallback。

要取消 Google 授權，可在 Google 帳號安全頁撤銷 Gemini CLI 的存取權；這可能同時影響使用相同 OAuth client 的 CLI。要只移除本工具的本機副本，先結束應用再刪除其 `gemini-session.bin`。來源開關只停止監控，不會登出官方 CLI。

目前讀取的是訂閱配額與重設窗口，不是網路頻寬、API 帳單或本地 token 統計。Antigravity 本機 RPC、Claude 與 Google 配額端點不是穩定公開 API，可能隨上游變更而需要更新。Antigravity 必須保持執行；工具會隨讀取重新發現本機服務的動態連接埠。macOS/Linux 的發現器使用 `ps` 與 `lsof`，尚待實機驗證。

研究與選型：[docs/research.md](research.md)。驗證結果：[docs/verification.md](verification.md)。第三方聲明：[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md)。

## 寵物成長與訊息（v1.29.0 開發分支）

設定可查看各角色成長進度；每個角色以實際觀察的週配額增量取得經驗，每日最多 20 XP，不代表實際 token 數。
外部訊息區可新增 HTTPS RSS／Atom、暫停來源、全域靜音與預覽文字泡。首次讀取只建立基準；後續每 15 分鐘檢查。
詳見 [功能與限制](companion-growth-and-messages.md)。
