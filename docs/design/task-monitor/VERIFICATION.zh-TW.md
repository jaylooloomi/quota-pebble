## v1.30.0：篩選互動優先

- 切換直接更新選取按鈕與清單，保留標題、統計、來源及篩選列 DOM，不呼叫整頁 render／視窗調整。
- 固定三列 308px 高度；同步建立三張可見卡片，下一個畫面週期後再補緩衝，最多八張。快速連點取消舊批次，最後一次選擇優先。
- 每份快照快取各篩選結果；僅 observedAt、checkedAt 等檢查時間更新，不重建面板或收合摘要、不重設捲動。
- 延續背景摘要監控供統計與通知，點擊篩選不增加來源查詢，也不載入對話內容。
- `scripts/task-filter-fast-test.cjs`：保留真實 layout 事件處理，100 筆隔離展示資料、四語系、36 次切換、快速連點、20 次檢查時間更新、DOM 身分與捲動位置檢查。Windows CI 以 CPU 降速四倍執行。
- 打包版四倍 CPU 降速實測：點擊處理 p95 約 14ms，點擊至兩個繪製週期 p95 約 74ms。這是本機隔離測試，不代表所有硬體、遠端服務或系統負載下的保證值。
- 231 項單元測試、打包版任務 UI、Claude／Antigravity 遠端來源四語系檢查通過。測試已配合分批渲染等待畫面週期，沒有關閉真實 layout 事件來美化成績。

# Codex 任務監控：實作與能力驗證

版本：Quota Pebble 1.18.0。日期：2026-11-02。

**目前產品路徑已在 1.19.0 改為純本機事件讀取，不啟動 CLI、也不使用 Hook。**
請以 [1.19.0 設計與驗證](LOCAL-SESSIONS.zh-TW.md)為準；以下保留先前版本的實驗紀錄。

### 1.18.2 修正（2026-11-03）

後續檢查確認桌面工具有 2 個 active 聊天，但接收器沒有收到這兩個聊天的事件。此時官方 daemon 已可連線，先前的 proxy client 卻把原始 socket 當成 JSONL，漏掉 WebSocket HTTP Upgrade，造成反覆逾時。已修正 transport 並以真正 HTTP Upgrade／WebSocket frame 的獨立 fixture 測試。

修正後，正式 daemon 的 `initialize`、`thread/list`、`thread/loaded/list` 均成功回覆，但 loaded 清單仍是空的，目前桌面聊天在此來源仍為 notLoaded。這證明傳輸錯誤與跨實例能見度是兩個不同問題；修正握手**不代表已完成桌面聊天監控**。

UI 在沒有近期有效 Hook 或 loaded Runtime 時，改顯示「— 執行中／— 等待確認」和「即時來源未接上」，不再用 0 暗示目前沒有工作。仍保留歷史清單，不以歷史更新時間、程序存在或其他猜測冒充 active。官方文件亦說明雲端協調模式不支援本機 command hooks；本機工具可用並不足以證明本機 hooks 會執行。

## 採用方案

新增「配額／帳號／任務」分頁。任務監控與配額 Poller 分離，不增加訂閱配額查詢，不替使用者開始、繼續、批准或中止既有任務。

優先以官方 `app-server proxy` 查詢來源的 loaded threads 與狀態；無可用控制 socket 時，獨立 app-server 只提供最近 100 筆歷史名稱與專案。歷史資料一律是未知，不能計為執行中。

即時狀態補充使用 Codex 官方生命週期 Hooks。接收器只保存 session ID、turn ID、事件名稱、專案路徑與接收時間；不保存提示詞、工具參數、輸出、逐字稿、Cookie 或 Token。事件最多 4,000 筆、讀取最近一天，保存在 `~/.quota-pebble/task-events`。這不是可信執行證明或安全稽核服務；同一作業系統帳號仍可修改本機檔案。

## 實測結果與限制

| 來源 | 本機實測 | 結論 |
|---|---|---|
| 獨立 Codex app-server 0.164.0 | 列到 80 筆歷史；本聊天在桌面工具顯示 active，但此來源顯示 notLoaded，loaded 為 0 | 不可用來推斷桌面聊天正在執行 |
| 官方 proxy | 已知控制 socket connection refused；桌面 App 0.166.0-alpha.5.1 使用另一個 stdio 實例 | 此機目前無共享 Runtime 可讀；不攔截 stdio、不探測私人連接埠 |
| 官方 CLI + 使用者信任的 Hooks | 真實、極短測試回合收到 SessionStart、UserPromptSubmit、Stop、SessionEnd；跨程序 TaskMonitor 以相同 session ID 觀察到 running，再變為 idle | 已驗證新的本機 CLI 回合，不是 fixture |
| 已經開啟的桌面聊天 | 尚未觀察到此聊天的新 Hook 事件 | **不能宣稱所有桌面聊天或其他裝置都已接上**；需要該來源載入並執行 Hooks |

橋接只觀察啟用之後實際送出的事件，不回填舊聊天為即時狀態。CLI / Desktop 版本、企業政策及雲端協調模式可能影響 Hooks 能否執行；安裝成功不代表每個來源已連接。

## 狀態規則

- 新近 UserPromptSubmit／PreToolUse／PostToolUse：執行中；PermissionRequest：等待確認。
- SessionStart／Interrupt／SessionEnd：當下閒置；不表示整個專案已完成。
- Stop：未知。其他 Stop Hook 可能要求繼續，不能當作回合完成的唯一證據。
- 45 秒未收到有效確認：未知；不靠程序存在、檔案修改時間或心跳維持舊 active。
- 以 session ID 去重，忽略 subagent 事件；舊 turn 的延遲結束不能覆蓋新的 turn。
- 共享 Runtime 若可讀，只信任 loaded 清單中且 status 有效的項目；失去來源立即降級未知。

本機 Hook 每約 2 秒反映到畫面；官方清單每 30 秒重新查詢。長時間思考或執行單一工具、沒有新事件時，45 秒後可能顯示未知，這是刻意保守的行為。

## 安裝與日常使用

1. 開啟「任務」分頁，按「安裝狀態橋接」。需要 Node.js 22+。
2. 既有 `~/.codex/hooks.json` 保留，寫入前建立具時間戳記的備份；不寫入信任紀錄。
3. 在 Codex CLI `/hooks` 審閱並信任八個 `Quota Pebble: local task status` 項目。只信任這些項目，不必信任其他外掛。官方要求對確切定義進行審閱；命令變更後需重新信任。
4. 從新回合確認有收到本機 Hook。來源仍顯示歷史時，不代表目前沒有任何任務在執行。

Windows 接收器使用 `cmd.exe /d /c call` 搭配 Node 絕對路徑，避免空白路徑／Shell 呼叫方式造成接收器沒有執行。安裝不會啟動可見命令視窗。

可選「收合時顯示任務摘要」：在原名稱區顯示執行／等待／未知數，固定島的大小與供應商位置。開啟期間暫停名稱區寵物，不改寫原寵物偏好；關閉即可恢復。原始配額、帳號與配速布局維持。

## 驗證指令

```sh
npm run test:coverage
npm run test:tasks
npm run test:desktop
npm run test:design
npm run test:i18n
npm run test:trends
npm run check:tasks
```

`check:tasks` 預設唯讀，不會送出推理。以下兩個指令是明確選擇的實機驗證，會各送出一輪極短 Codex 訊息，使用少量訂閱額度；不放入 CI：

```sh
node scripts/check-task-monitor.cjs --probe-turn
node scripts/task-monitor-live-ui.cjs --probe-turn
```

自動化重點：history/notLoaded 不誤報、載入範圍、等待狀態、過期、舊 turn 事件、重複啟動、斷線、隱私欄位、無效檔案、安裝保留原設定、四語系長路徑與 XSS、鍵盤、收合摘要與卡片位置固定。

實測也發現 proxy 提早結束時可能觸發 stdin EPIPE，已加錯誤處理與回歸測試，避免來源連不上時整個 App 結束。

官方參考：[App Server](https://developers.openai.com/codex/app-server/)、[Hooks](https://developers.openai.com/codex/hooks/)。
