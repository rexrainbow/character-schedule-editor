# YAML Blueprint Agent Kit

供人類與 agent 建立或修改行程藍圖的離線文件包。整個資料夾可直接複製分享；閱讀不需要原始碼、Node.js 或 MCP。

## 從這裡開始

1. 讀 [BLUEPRINT_GUIDE.md](BLUEPRINT_GUIDE.md)：掌握物件結構、YAML 寫法及執行規則。
2. 參考 [example.yaml](recipes/examples/life-simulation.yaml)：以完整生活／薪資範例為基礎修改。
3. 不確定欄位或型別時，才查 [blueprint.schema.json](../src/schemas/blueprint.schema.json) 的相關定義。
4. 需要圖示時，才查 [icons.json](../src/icons/manifest.json)；不填 icon 也能使用。

一般編寫只需指南與範例，不必先讀完 Schema 或圖示清單。本包共五個檔案，沒有子資料夾。

## 編輯與驗證

- 用 mapping key 作為 name，不需要 UUID。display_name、description、icon 可選填。
- 匯入 YAML 會重建整個專案，不會合併目前內容。修改既有專案時，先匯出目前藍圖並保留原專案存檔。
- YAML 解析為 JSON 後，可用隨附 Schema 驗證欄位結構；運算式、引用、型別、權限及循環仍需編輯器或專案服務驗證。
- 在 App 的「匯入專案」選取 .yaml／.yml，再用行程模擬或連續模擬檢查結果。本包不含 parser 或執行器。
- 已連接 MCP 時，先取得 project_status，再呼叫 project_import_yaml 的 preview；正式匯入需使用目前 expectedRevision。未儲存內容的取代需明確授權，匯入後另行儲存。

## 維護來源

由來源專案執行 `npm run build:agent-kit` 重新產生，不直接修改副本。主要文字來源為 `docs/AGENT_KIT.md` 與 `docs/BLUEPRINT_GUIDE.md`；其餘詳細技術文件與獨立 recipes 仍保留於原專案的 `docs/`，不必隨本包攜帶。
