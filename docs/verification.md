# 驗證紀錄

目前驗證：參閱 [2026-11-04 平台結果](platform-verification-2026-11-04.md)、[本機與遠端來源限制](provider-monitoring-follow-up.md) 及 [成長／RSS](companion-growth-and-messages.md)。下方為歷史紀錄，其中當時的未驗證項目不代表目前所有狀態。

日期：2026-10-30（Asia/Taipei）。平台：Windows 10 x64。

## 0.2.0 設計稿落地

依使用者提供的設計圖重做真實互動介面，不使用整張圖片替代操作。使用隨包附上的 Inter 字型、SVG 服務圖示及功能元件。展開面板 584×744、收合浮窗 624×92（含透明邊距）；正常展示狀態下三張卡片不產生捲軸。預設顯示剩餘，所有進度條與顯示數字一致；Codex 使用絕對重設日期。只有相同模型基底、相同比例、相同重設時間的 High/Medium/Low 版本合併顯示，其餘配額保留。

四階段連接元件、登入後自動同步與返回配額、明確未連接／更新失敗／服務限流、拖拉排序、鍵盤排序與偏好遷移均有對應自動化測試。`test:design` 會驗證字型、圖示、版面高度、長條比例、連接完成狀態、舊資料標示並保存各狀態截圖。

實測 Claude 官方 CLI 回報已登入，但 Claude 配額端點回 HTTP 429 並要求 Retry-After 3600 秒。已停止額外查詢並將觀察到的冷卻期限存入應用設定目錄；這個回應不等同已確認授權有效，也不是配額數字為零。新版不再以憑證內的到期時間直接取代服務回應；會依 401/403、429 等實際結果分別顯示未連接或限流。冷卻保留到重啟後，期滿自動重試。不能把此時 Claude 的真實讀取描述為已通過。

32 項核心測試通過；桌面功能、登入同步、排序與設計狀態測試通過。真實 Gemini／Antigravity、Codex 配額讀取與連續背景同步另存 `test-results/soak-live.json`；成品驗證結果以實際產出的報告為準。macOS/Linux 仍未實機驗證，圖片示範數字也不能作為三平台、三家帳號全部驗證的證明。

最終 Windows 成品已通過打包版設計驗證（`design.json` 的 packaged 為 true）、桌面操作、排序與重啟保留、真實配額讀取，以及單一便攜 EXE 自解壓、啟動 0.2.0 新介面與正常結束（`portable.json`）。連續真實同步記錄：Gemini 首次 20:19:31 UTC、手動 20:19:41 UTC、自動 20:21:46 UTC；Codex 首次 20:19:29 UTC、手動 20:19:38 UTC、自動 20:21:43 UTC，均在 2026-10-29 UTC（台北時間 2026-10-30）。這些記錄證明實際端點有重新讀取，不只是切換 UI 的展示數字。Claude 429 冷卻仍保留，未繞過服務要求。

歷史紀錄如下。

0.1.4 Antigravity 來源：在本機正在執行的 Antigravity 成功查得 Gemini 4 Argon 剩餘 24.94%、Gemini 3.8 Flash 剩餘 100%（單次取樣，數字可能隨使用改變）。正式 adapter 與 `check:accounts` 均已實際讀取成功。個人 Google 來源預設改用 Antigravity；企業版 Code Assist 可明確切換。新增測試驗證 Gemini-only 範圍、比例精度、最受限窗口優先、伺服器模型順序改變時的穩定 ID、錯誤埠回退、CSRF 不進入輸出以及未知數值處理。原本「Google 尚未可讀配額」的紀錄屬舊 Code Assist 來源；本機 Antigravity 的真實讀取現在已通過。

0.1.3 拖拉排序：收合列服務按鈕與展開卡片標題可拖拉排序、共用順序，並儲存至偏好設定。另支援 Alt + 左右鍵。`npm run test:order` 已用 Electron 實際滑鼠拖拉驗證：收合／展開排序同步、拖拉不觸發展開、鍵盤排序、拒絕不合法順序、寫入偏好與重新啟動後恢復。

0.1.2 登入同步修正：已辨識實機 Claude CLI 使用平台授權碼回傳的路徑，新增 App 內輸入與 stdin 回傳；不再丟棄登入進度。Google 授權完成通知與瀏覽器回應 flush 解耦。新增完整連接狀態、自動展開／刷新與外部授權檔變更偵測。核心測試共 23 項通過；新增 `npm run test:auth`，以真實 Electron IPC、Claude 測試子程序、Google loopback HTTP callback、Windows 加密存放與配額卡片驗證無需按重新整理的完整路徑。第三方 Google token exchange 與配額回應使用 fixture，因此不等同使用者真實帳號已完成授權。

0.1.1 圖示修正：Codex 的收合列與展開卡片均改用官方擴充套件中的 SVG 圖形，移除錯誤的 Command 鍵符號。已重新執行桌面測試與檢查截圖。

## 已通過

- TypeScript 建置。
- 18 個 Node 測試：各家配額解析、null/未知值、Codex 多種窗口、Gemini 模型桶、HTTP 401/403/429/500、Retry-After 秒數／日期、斷線舊資料、登入失效清除資料、輪詢去重與停用、登入後立即讀取、Codex stdio handshake 與請求配對。
- Google OAuth 測試：真實 loopback HTTP callback + 假 Google token exchange；拒絕錯誤 state、使用 PKCE、逾時關閉、加密 vault 與拒絕 plaintext fallback。這不等同真實 Google 帳號登入驗證。
- Electron 桌面自動化：展開／收合、三家卡片與六個窗口、百分比切換、來源開關、置頂、展示模式禁止登入、Escape、隱藏／還原、renderer 隔離、沒有 renderer 例外。另已在打包版測試實際 Windows safeStorage 原生加密／解密與密文不含測試 token。
- `npm audit`：包含開發套件與正式相依套件均 0 個已知弱點（此次安裝的資料庫結果）。
- Windows portable 建置；另以打包的執行檔重跑桌面測試，已通過，結果保存於 `test-results/desktop-packaged.json`。
- 打包版在兩次 Playwright 自動化展示測試中，4 個 Electron 程序的合計 working set 取樣約 353／469 MiB。這不是長時間閒置基準，包含開發自動化連線；不能宣稱本版本是極低記憶體工具。需要更低佔用時，Tauri 仍是後續可評估的方向。

## 真實帳號讀取

| 來源 | 結果 | 說明 |
| --- | --- | --- |
| Codex | 已成功 | 官方 app-server 回傳實際 7 天窗口、百分比與重設時間；未硬編碼成 5 小時。即時結果保存在不含憑證的 `test-results/live.json` |
| Claude | 尚待重新登入 | 本機 Claude Code 授權已過期；應用顯示原因與登入按鈕，不顯示假用量 |
| Gemini CLI / Code Assist | 尚待使用者登入 | 本機沒有可用的舊版 OAuth 檔案；應用提供瀏覽器登入。尚未完成真實 Google 帳號 consent 與 quota 回傳的端對端驗證 |
| Gemini 網頁版 | 不在此版本範圍 | 未使用 CLI 配額冒充網頁版配額 |

## 仍需驗證

- 使用者在應用完成 Claude、Google 登入後，確認各家實際配額與官方顯示相符。
- 真實帳號授權自動更新、長時間背景運作、休眠／喚醒後的長期行為。
- macOS/Linux 的建置與桌面實機測試。CI matrix 已提供，但尚未在遠端執行。

目前可確認 Windows 桌面殼與 Codex 真實讀取已運作。不能宣稱「三家真實帳號、三平台全部已驗證沒有問題」。
