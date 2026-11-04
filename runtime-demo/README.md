# 獨立 Runtime 示範

以單獨 HTML 作為宿主，直接使用 `src/runtime`，不載入 React 編輯器、MCP 或伺服器專案狀態。

1. 在編輯器選「匯出 → 執行資料（JSON）」。
2. 此頁選「載入執行資料」，再選周序列與亂數種子。
3. 點「執行第一天」，之後每次「執行下一天」只跑一天，保留同一 Runtime 的變數、冷卻、候選與預約狀態。
4. Log 只列 task.completed，不開 diagnostics、不顯示條件／算式 trace。一般外部任務以 record 模式記錄，不呼叫真正 engine handler；內建任務照常更新狀態。

變數空間唯讀顯示環境層與應用層變數：初次載入及重設時顯示初始值，每次任務提交後更新目前值。保留群組名稱路徑與原始型別，每頁最多 10 筆；可收合整個區塊，窄螢幕改為上下排列。失敗的任務不會把未提交數值顯示成成功結果。

每筆任務紀錄直接呈現 `task.completed.arguments` 與 `result`。增加數值任務可看到目標、增量、隨機幅度、實際偏移、要求值及上下限限制後的結果；紀錄不重新計算參數或抽亂數。即使因上限而沒有改變變數，也保留該次任務的結果。

「重設執行」清除紀錄並恢復初始狀態，再次開放周序列／種子設定。有限序列到結束日停用執行；空序列不可執行。執行失敗保留已完成紀錄，需重設或載入修正資料；不自動跳到下一天。讀檔錯誤保留原本有效專案與進度。資料只在記憶體，重新整理不保留。

預設依系統語系顯示繁體中文或英文，可手動切換。舊日紀錄收合，最新一天展開；展開時才建立任務列，每次最多顯示 200 筆，可按鈕載入其餘紀錄，不丟棄任務。

載入方式、每日執行／重設及外部任務僅記錄等提示，集中在右上角「?」使用說明，不常駐占用紀錄空間。載入專案前也能開啟；可按關閉或 Escape 返回，焦點回到「?」。執行狀態與錯誤仍顯示在主頁。

## 開發與發布

- `npm run dev` → `http://127.0.0.1:5173/runtime-demo/`（埠號以實際啟動輸出為準）。
- `npm run build` 先建置編輯器，再將相同的獨立示範產物放入 `dist/runtime-demo/`。可直接雙擊其中的 index.html；也可用 `npm run preview` 的 `/runtime-demo/` 路徑或 GitHub Pages 開啟。
- `npm run build:runtime-demo` 僅建置示範至 `dist-runtime-demo/`，可直接雙擊 index.html，或使用 `npm run preview:runtime-demo` 檢視。

兩種示範產物均只有 index.html、app.js、app.css 三個檔案。JS 打包為 IIFE，HTML 使用一般 `<script defer src="./app.js">` 及不帶 crossorigin 的 CSS link，不使用 ES module 載入、程式碼分割或執行時下載套件。三個檔案放在同一資料夾即可搬移，支援 file:// 與 HTTP；不是將全部內容塞進單一 HTML。

本機 JSON 由檔案選取器讀取，不使用 fetch 讀取本機路徑。可使用 name 或 uuid 版本的 `schedule-runtime-program`；專案存檔／Blueprint 不是本頁輸入。開發來源仍以 Vite 的 module 模式提供，直接雙擊應使用建置後的 index.html；編輯器本身仍需 HTTP 服務。
