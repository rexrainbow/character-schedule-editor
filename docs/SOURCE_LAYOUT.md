# 原始碼目錄

```text
src/
├─ main.jsx                # Web 啟動入口
├─ core/                   # Project API、資料操作、引用檢查、驗證及模擬
│  ├─ projectApi.js         # 共用專案操作入口
│  ├─ commands.js           # 可傳輸的白名單命令、輸入驗證與原子批次
│  ├─ blueprint/            # YAML 宣告、文字運算式 parser、Schema 定義與專案重建
│  ├─ model.js              # 專案存檔與工作資料的轉換
│  ├─ builtinTaskModel.js   # 內建任務純資料定義
│  └─ ...Model.js           # 各類物件的資料規則
├─ runtime/                # UUID／name 共用執行核心、checkpoint 與 opt-in 診斷事件
├─ simulation/             # 模擬輸入、唯讀計畫、診斷紀錄收集與 GUI 結果轉接
├─ node/                    # Node 專用，不進入網頁建置
│  ├─ main.js               # MCP stdio 啟動入口
│  ├─ projectService.js     # 專案狀態、版本、請求佇列與通知
│  ├─ projectFiles.js       # 受根目錄限制的讀檔與原子寫檔
│  ├─ mcp/                 # MCP 工具與 Schema resources
│  └─ web/                 # 本機 GUI 靜態入口、HTTP/SSE、stdio bridge
├─ browser/                # 瀏覽器遠端工作副本與提交佇列
├─ gui/
│  ├─ App.jsx              # Web 應用程式、導覽與平台操作
│  ├─ editors/             # 行程、變數、巨集、任務與運算式編輯介面
│  ├─ dialogs/             # 設定、選取、匯入及草稿對話框
│  ├─ components/          # 共用按鈕、樹狀清單、預覽及其他顯示元件
│  ├─ hooks/               # React hooks，包括 useProject 與內建任務 hooks
│  └─ contexts/            # React contexts
├─ schemas/                # 專案、環境、runtime 與 blueprint JSON Schema
├─ examples/               # 可手動匯入的範例 JSON
├─ i18n/                   # 英文、繁體中文與語系選擇
├─ styles/                 # 共用、工作區及變數樹樣式
└─ icons/                  # 離線圖示清單與 SVG 資料
```

`core/` 不引用 `gui/`，也不使用 React、DOM 或檔案系統；其語系與驗證資源來自 `i18n/` 及 `schemas/`。Web GUI 與 Node.js 服務皆使用同一個入口：

```js
import { createProjectSession } from './src/core/projectApi.js';
```

`gui/hooks/builtinTasks.js` 保留 React 專用 hooks；純 JS 使用端應引用 `core/builtinTaskModel.js`。

測試仍位於根目錄的 `tests/`，瀏覽器測試位於 `tests/browser/`，生成工具位於 `scripts/`。Schema 產生器的輸入及輸出均使用 `src/schemas/`，圖示產生器使用 `src/icons/`；建置結果仍輸出至 `dist/`。

Node 服務與共用命令見 [MCP_SERVER.md](./MCP_SERVER.md)，GUI 即時同步與兩種啟動方式見 [GUI_SYNC.md](./GUI_SYNC.md)。GitHub Pages 固定使用純網頁模式。Project API 用法詳見 [PROJECT_API.md](./PROJECT_API.md)。
## 新增的 Runtime 核心

`src/runtime/` 為獨立執行核心，公開入口為 `index.js`，內含 Program、DayExecution、EventOccurrence、ExecutionMachine、Evaluator、Runtime 與 MemoryCheckpointStore。它不依賴 GUI、Node.js I/O 或 MCP；重用部分 `core/` 的純資料規則與專案驗證。模擬 GUI 已透過 `src/simulation/` 改接 runtime；`core/simulationModel.js` 與 `daySimulationModel.js` 為新介面的 facade。舊同步實作只保留在 `tests/reference/` 比對。既有 `core/runtimeModel.js` 匯出器尚未改接新 Program 格式。使用方式見 [runtime README](../src/runtime/README.md)。
