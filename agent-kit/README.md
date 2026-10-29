# YAML Blueprint Agent Kit

本文件包供人類與 agent 離線閱讀、建立及修改 YAML 藍圖。可以直接複製整個資料夾分享；閱讀不依賴專案原始碼、MCP 或 Node.js。

## 閱讀順序

1. [一頁式工具介紹](docs/INTRODUCTION.md)（[English](docs/INTRODUCTION.en.md)）：先掌握工具目的與由周序列到任務的整體結構。
2. [系統能力總覽](docs/SYSTEM_SEMANTICS.md)：將需求對應到系統構件。
3. [Engine 執行語意](docs/ENGINE_SEMANTICS.md)：確認條件、候選、事件排序、變數更新及中斷規則。
4. [命名規則](docs/NAMING.md)、[Blueprint 格式](docs/BLUEPRINT.md) 與 [JSON Schema](schemas/blueprint.schema.json)：確認命名、引用、宣告與文字運算式寫法。
5. [Recipes](docs/RECIPES.md) 與 [完整 YAML 範例](examples/life-simulation.yaml)：參考具體組合。
6. [圖示格式](ICONS.md) 與 [離線圖示清單](icons.json)：指定前景圖示、背景色及參數／選項圖示。

## 編輯與驗證

- YAML 使用 mapping key 作為 name；不需要 UUID。display_name、description 與 icon 可選填。
- 匯入會從零建立專案，不會合併或更新既有專案。修改前保留原專案備份。
- 先將 YAML 解析為 JSON，再用隨附 Schema 驗證結構。Schema 不能檢查文字運算式語法、引用目標、型別或循環，也不能代替執行語意文件。
- 完整驗證需回到編輯器匯入藍圖，或透過專案提供的 YAML 預覽／匯入 API。確認無錯後，可用行程模擬與連續模擬檢查結果；本包不包含 parser 或驗證執行器。
- 文件中的專案路徑說明指向未收錄的實作或技術文件，屬於補充資料。本包內的相對連結均指向已收錄檔案。MCP URI 需另行連接專案服務才能使用。

## 更新文件包

此資料夾由來源專案的 `npm run build:agent-kit` 產生。請修改原始文件後重新產生，不要直接維護本包中的副本。產生腳本會先更新 Schema 與圖示清單，再檢查來源檔案及文件連結；不完整的內容會使產生失敗。
