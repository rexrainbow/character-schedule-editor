# 獨立 Runtime 示範

以單獨 HTML 作為宿主，直接使用 `src/runtime`，不載入 React 編輯器、MCP 或伺服器專案狀態。

1. 在編輯器選「匯出 → 執行資料（JSON）」。
2. 此頁選「載入執行資料」，再選周序列與亂數種子。
3. 點「執行第一天」，之後每次「執行下一天」只跑一天，保留同一 Runtime 的變數、冷卻、候選與預約狀態。
4. Log 只列 task.completed，不開 diagnostics、不顯示條件／算式 trace。一般外部任務以 record 模式記錄，不呼叫真正 engine handler；內建任務照常更新狀態。

「重設執行」清除紀錄並恢復初始狀態，再次開放周序列／種子設定。有限序列到結束日停用執行；空序列不可執行。執行失敗保留已完成紀錄，需重設或載入修正資料；不自動跳到下一天。讀檔錯誤保留原本有效專案與進度。資料只在記憶體，重新整理不保留。

預設依系統語系顯示繁體中文或英文，可手動切換。舊日紀錄收合，最新一天展開；展開時才建立任務列，每次最多顯示 200 筆，可按鈕載入其餘紀錄，不丟棄任務。

## 開發與發布

- `npm run dev` → `http://127.0.0.1:5173/runtime-demo/`（埠號以實際啟動輸出為準）。
- `npm run build` 同時建置編輯器與示範頁，產物為 `dist/runtime-demo/index.html`。可用 `npm run preview` 的 `/runtime-demo/` 路徑檢視，GitHub Pages 同樣可使用。
- `npm run build:runtime-demo` 僅建置示範，產物為 `dist-runtime-demo/index.html`；`npm run preview:runtime-demo` 檢視。此資料夾可獨立放上靜態網站服務，沒有編輯器頁面。

兩種產物均已打包相對資源，不需執行時連線下載套件；透過 HTTP 靜態服務開啟，並自行選取本機 JSON。可使用 name 或 uuid 版本的 `schedule-runtime-program`；專案存檔／Blueprint 不是本頁輸入。
