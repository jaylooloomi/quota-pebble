# 任務摘要：三張待選設計

使用內建 imagegen 產生，僅為概念圖，尚未套用。示意資料：執行中 3、近 8 小時 4、今日 4、近三日 9；星號表示事件推定。

- 01 精簡雙行：最接近現有固定小尺寸，資訊分為執行與近期兩層。
- 02 四格對齊：四個指標獨立、固定欄位；實作需驗證原有窄區域的字級。
- 03 執行優先：放大執行數，其他統計降低視覺權重。

共用提示：Traditional Chinese UI mockup board, landscape 4:3. Match Quota Pebble black graphite dynamic island, restrained white typography, thin gray capsule border and small mint accent. Show full compact horizontal island above and an enlarged LEFT task-summary region below. Preserve original approximately 464×76 CSS pixel geometry. Keep orange Claude 85%, white Codex 69%, purple Antigravity 25%, thin progress bars, refresh and chevron. Redesign only left summary; no pets, illustrations or watermarks. Footer「示意資料 · 固定尺寸」and「* 依事件推定」.

01 提示：Title「01 精簡雙行」, subtitle「資訊完整，閱讀更直接」. Two lines「執行中 3* / 4」and「今日 4* · 三日 9*」. White main row, muted second row. Enlarged callout explains denominator「近 8 小時內任務」. Note「主行看執行，次行看近期」.

02 提示：Title「02 四格對齊」, subtitle「四個指標，各自清楚」. Compact 2×2 grid:「執行中 3*」「近8h 4」「今日 4*」「三日 9*」. Fixed columns, muted labels, bold numbers, mint running count, fine dividers. Callout「雙欄固定，數字不跳位」.

03 提示：Title「03 執行優先」, subtitle「先看現在，再看累積」. Large mint「3*」with「執行中」below; to its right quiet lines「8h 4 · 今日 4*」「三日 9*」. Preserve compact summary width. Callout「執行數最醒目，其餘資訊降噪」.
