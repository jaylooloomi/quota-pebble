# 平台驗證：2026-11-04

## 已發布 v1.28.2

[GitHub Release](https://github.com/jaylooloomi/quota-pebble/releases/tag/v1.28.2)：
Windows x64 portable、macOS ARM64 ZIP、macOS Intel x64 ZIP，各附 SHA-256。

macOS 成品來自 [原生建置 41801501168](https://github.com/jaylooloomi/quota-pebble/actions/runs/41801501168)，
來源 d6fdbc1，程式與 Windows v1.28.2 相同（該提交僅增加工作規劃文件）。
兩個架構均完成 npm test、native ZIP 建置、codesign --verify、打包程式啟動、
寵物預覽／套用及背景選擇測試。下載後重新驗證 checksum，再上傳正式 Release。
macOS 採 ad-hoc 簽章，未經 Apple 公證。

## v1.29.0 開發分支

- Windows：211 項單元測試；最近完整覆蓋率檢查約行 88.0%、分支 84.7%、函式 86.7%（均通過門檻）。
  中英日韓設定／登入、900px 工作區與 75% 縮放、寵物預覽／套用、任務統計檢查通過。
- macOS：新功能通過 [ARM64 / Intel 原生建置 41807986539](https://github.com/jaylooloomi/quota-pebble/actions/runs/41807986539)。
  包含原生打包與真正 Electron 的成長設定、RSS 設定及訊息視窗測試。
- Linux x64：[原生驗證 41808169698](https://github.com/jaylooloomi/quota-pebble/actions/runs/41808169698)
  通過 coverage、production audit、AppImage 建置與 Xvfb 下的打包程式啟動／四語系／
  寵物與 RSS 訊息視窗檢查。CI 的 --no-sandbox 僅為測試環境啟動參數，不寫入產品設定。

這些開發分支成品沒有冒充成 v1.28.2 的下載檔案；平台 API／自然任務監控仍依各自的驗收紀錄。

## 尚需實機驗收

多個實體螢幕、不同 DPI、跨螢幕拖曳、休眠／喚醒長期行為，以及 macOS/Linux 上
真實已登入的 Claude／Antigravity 程序／狀態轉換。Xvfb、單螢幕 CI 與 fixtures 不等於上述驗收。
