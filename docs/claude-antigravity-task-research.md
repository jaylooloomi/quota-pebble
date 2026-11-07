# Claude 與 Antigravity 任務狀態研究

日期：2026-11-03，台灣時間。此次僅研究與唯讀探測，未改動正式 App。

## 本機實測

| 來源 | 做法 | 實測結果 |
| --- | --- | --- |
| Claude Code | 有界讀取 `~/.claude/sessions/<pid>.json`；排除 `.key` 檔案 | 5 份登錄可讀，含 status、statusUpdatedAt、updatedAt、sessionId、pid、procStart；當時均回報 idle |
| Antigravity | 重用既有本機服務偵測，向程序擁有的 loopback port 發送 GetAllCascadeTrajectories | 成功回傳 trajectorySummaries，1 筆任務狀態為 CASCADE_RUN_STATUS_IDLE |

沒有啟動 CLI、推理、Hook、私人接收端或修改其他 App。沒有讀取 Claude messaging socket
或 `.key`，也沒有儲存聊天全文。Antigravity CSRF token 僅在記憶體使用，不輸出。
探測報告位於忽略的 `test-results/provider-task-research/antigravity.json`。

目前只驗證讀到閒置，沒有啟動假任務驗證 busy/running、等待與中斷。
PID 存在不等於正在執行；需對照程序身分與啟動時間避免 PID 重用誤判。

## 建議接入方式

### Claude Code

優先使用原生 session 登錄，不以 CPU、檔案 mtime 或訂閱用量推測任務狀態。
對照 pid、procStart、sessionId；執行中切換 session 時重新綁定。依實際版本驗證
busy、waiting、idle 的對應，未知值及無法確認程序身分時顯示未知。
statusUpdatedAt 是狀態轉換時間，不能不加區別地套用「五分鐘未變就離線」：
長工具執行可能維持同一狀態，必須另外建立存活／新鮮度證據。

歷史清單可讀本機 metadata／SDK session listing；歷史存在不代表目前載入或執行。
一般 claude.ai 聊天、Claude Code、Managed Agents 是不同來源，不混為同一清單。

開源參考：
- [cctop](https://github.com/tomstagl/cctop)：原生 session registry 與唯讀監控；Hooks 為選配。
- [claude-monitor](https://github.com/glabrego/claude-monitor)：使用 native registry，但完整工具也依賴 Hooks，不能整包安裝作為無 Hook 方案。
- [官方 session browser](https://platform.claude.com/cookbook/claude-agent-sdk-05-building-a-session-browser)：列表是純檔案讀取，不能當成 runtime status API。

### Antigravity

優先查詢已運作的 Language Server／App 本機服務，取得清單、任務識別、工作區、
最後活動時間及原生 status。限定 loopback、程序擁有的 port、回應大小與方法白名單。
先驗證目前版本的 running／waiting enum，未知值不猜測。

不需為此呼叫會載入或修改任務的方法，也不需匯出 GetCascadeTrajectorySteps 的完整聊天。
GetAllCascadeTrajectories 可能只有記憶體 resident 任務，空清單不能直接當成沒有任務；
可與本機索引交叉比對，但歷史項目仍不得當成正在執行。

開源參考：[antigravity-trajectory-extractor](https://github.com/jijiamoer/antigravity-trajectory-extractor)，
MIT，展示本機 RPC 發現與清單／cache 的限制。其完整聊天匯出功能不屬於 Pebble 的監控需求。
相關使用者回報：[重啟後清單只包含 resident trajectories](https://discuss.ai.google.dev/t/sessions-disappear-on-remote-access/190039)。

## 跨電腦

[Claude Code 官方 Remote Control](https://code.claude.com/docs/en/remote-control) 與
[Antigravity 官方 Remote Control](https://antigravity.google/docs/remote-control/) 都支援官方客戶端跨裝置。
Antigravity App 可從設定開啟，並以同一 Google 帳號在瀏覽器選主機。
但這不等於 Pebble 已有可用的第三方查詢合約：需另外驗證已授權裝置探索、權杖範圍、
傳輸、唯讀任務列表與斷線行為，不架私人接收端、不自動啟動 CLI。

Claude `GET /v1/sessions` 是 [Managed Agents API](https://platform.claude.com/docs/en/managed-agents/session-operations)，
不能假定它能列出同帳號所有 Claude Code／claude.ai 聊天。
Antigravity CLI [statusline](https://antigravity.google/docs/cli/statusline) 有 agent_state，
但需要既有 CLI 執行及設定接收，不能替代任意桌面任務的獨立清單。

## 實作順序與驗收

1. Claude 本機 registry：程序重用、session 切換、自然執行／等待／完成對照。
2. Antigravity 本機 RPC：多視窗／多服務、原生狀態、空清單／重啟、斷線／重連對照。
3. 使用現有任務列結構與對應 provider icon／主機標籤，各來源明確標示證據類型。
4. 本機兩種來源通過後，再獨立研究官方跨裝置控制端的唯讀介接。

不將「讀到閒置」或「官方網頁可連線」誇大成所有 runtime 轉換及 Pebble 跨電腦整合已通過。

## v1.22.0 接入結果

已新增獨立的本機 collector，合併進任務列表、篩選、統計與收合摘要，使用各來源的圖示及本機主機標籤。保留三筆捲動列表及四語系；來源未連接或清單不完整時明確提示。

- Claude 每 5 秒讀取最多 100 個、各 8 KiB 的數字 PID 登錄檔。Windows 以程序名稱及原生 FILETIME 比對 `procStart`，不以 `startedAt` 或 mtime 代替。Linux 使用 procfs field 22，macOS 使用 UTC `ps lstart`；後兩平台尚未在本次 Windows 環境實測，不匹配即未知。
- Claude `busy` → 執行中、`waiting` → 等待、`idle`／`shell` → 閒置；背景 shell 不代表模型回合仍執行。相同會話的不同程序保留獨立身分。程序死亡、PID 重用、session 選擇改變、解析失敗均不可沿用舊的活躍狀態。
- Antigravity 每 10 秒重新確認本機程序及其 listener，僅呼叫 `GetAllCascadeTrajectories`。限制四個服務、每個八個候選 port、單次回應 2 MiB、每輪時間預算。快取只保存仍屬於目前程序及 token 的有效 listener，沒有讀取完整 trajectory steps。
- 已在本機服務二進位中確認 enum 含 `IDLE`、`RUNNING`、`CANCELING`、`BUSY`、`UNSPECIFIED`。只映射明確的 `RUNNING`／`IDLE`；`BUSY`、取消中及未支援值維持未知，等待狀態不猜測。
- 來源失聯、缺漏及超過 25 秒未成功觀察的資料轉為未知；重新連線後用新快照恢復。空 RPC 清單可能只有 resident 範圍，不能宣稱帳號沒有任務。
- 本段記錄 v1.22.0 的歷史結果；v1.25.0 起已加入有完成證據的 Claude／Antigravity 完成訊息泡，詳見 [目前完成判定](native-completion-notifications.md)。單純 busy → idle 仍不等於成功。

本次真實唯讀實測：五個 Claude 程序均存活、原生啟動時間相符，五筆 idle；Antigravity 一筆 IDLE。沒有啟動 CLI、推理或 Hook，沒有讀取 `.key` 或對話內容。沒有自然發生的執行／等待轉換可供此次 live 驗證，這部分僅有獨立標記的單元及 UI fixture 測試，不冒稱自然任務實測。

驗證入口：`npm test`、`npm run test:tasks`、`npm run test:i18n`。真實來源及四語系畫面：`npm run check:native-tasks`（明確唯讀 live 檢查，報告放在忽略的 test-results）。既有 macOS/Linux 工作流程仍會建置；本次本機 GUI／程序驗證限 Windows。
