# 原始碼目錄

```text
src/
├─ main.jsx                # Web 啟動入口
├─ core/                   # Project API、資料操作、引用檢查、驗證及模擬
│  ├─ projectApi.js         # 共用專案操作入口
│  ├─ model.js              # 專案存檔與工作資料的轉換
│  ├─ builtinTaskModel.js   # 內建任務純資料定義
│  └─ ...Model.js           # 各類物件的資料規則
├─ gui/
│  ├─ App.jsx              # Web 應用程式、導覽與平台操作
│  ├─ editors/             # 行程、變數、巨集、任務與運算式編輯介面
│  ├─ dialogs/             # 設定、選取、匯入及草稿對話框
│  ├─ components/          # 共用按鈕、樹狀清單、預覽及其他顯示元件
│  ├─ hooks/               # React hooks，包括 useProject 與內建任務 hooks
│  └─ contexts/            # React contexts
├─ schemas/                # 專案、環境與 runtime JSON Schema
├─ examples/               # 可手動匯入的範例 JSON
├─ i18n/                   # 英文、繁體中文與語系選擇
├─ styles/                 # 共用、工作區及變數樹樣式
└─ icons/                  # 離線圖示清單與 SVG 資料
```

`core/` 不引用 `gui/`，也不使用 React、DOM 或檔案系統；其語系與驗證資源來自 `i18n/` 及 `schemas/`。Web GUI 與未來 Node.js 介面皆使用同一個入口：

```js
import { createProjectSession } from './src/core/projectApi.js';
```

`gui/hooks/builtinTasks.js` 保留 React 專用 hooks；純 JS 使用端應引用 `core/builtinTaskModel.js`。

測試仍位於根目錄的 `tests/`，瀏覽器測試位於 `tests/browser/`，生成工具位於 `scripts/`。Schema 產生器的輸入及輸出均使用 `src/schemas/`，圖示產生器使用 `src/icons/`；建置結果仍輸出至 `dist/`。

這次調整僅改變原始碼位置及引用路徑，不改變專案 JSON 格式、GUI 互動或 Web App 連結。Project API 用法詳見 [PROJECT_API.md](./PROJECT_API.md)。
