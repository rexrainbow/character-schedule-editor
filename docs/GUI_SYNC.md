# 同一套 GUI：純網頁與本機同步

GitHub Pages 固定是純網頁模式。`npm run dev`／`npm run preview` 也使用瀏覽器本地專案，不會探測 localhost、不接受 query string 切換服務。只有 Node 網頁入口在回傳 HTML 時注入連線設定；JavaScript、CSS、React 編輯器使用相同的 `dist` 成品。

## 建議啟動方式

先於專案根目錄建置一次：

```powershell
npm run build
```

### 先啟動本機 GUI，再連接 MCP

```powershell
npm run serve -- --root C:/mywork/electron-app/character-schedule-editor
```

開啟終端顯示的網址，預設為 `http://127.0.0.1:5175`。服務以空白專案開始，亦可加上 `--project project.json`。修改原始碼後需重新 build 並重啟本機服務；這個入口提供已建置的成品，不是 Vite 開發伺服器。

MCP client 以 stdio bridge 連到已執行的服務：

```json
{
  "mcpServers": {
    "character-schedule-editor": {
      "command": "node",
      "args": [
        "C:/mywork/electron-app/character-schedule-editor/src/node/main.js",
        "--connect", "http://127.0.0.1:5175"
      ]
    }
  }
}
```

bridge 只轉送操作，不建立另一份專案。`--connect` 不是 MCP Streamable HTTP 端點；對 MCP client 仍是 stdio，與本機專案服務之間使用內部 HTTP 介面。

本機服務重啟後，既有 MCP bridge 需由 client 重新啟動；它不會自動把舊修改重新送給新的服務實例。GUI 則可使用畫面上的重新連線／載入伺服器版本。

### 由 MCP client 同時啟動 GUI

亦可讓 MCP client 使用原有 `node src/node/main.js`，加上 `--web --port 5175`。同一程序提供 MCP stdio 與 GUI，共用一個 `projectService`。`project_status.webUrl` 可取得網址。MCP client 關閉該程序時，GUI 也會斷線。單獨使用 `npm run mcp` 則維持僅 stdio、沒有 GUI 的方式。

`--port 0` 由系統選可用連接埠，實際網址顯示於 stderr；固定埠已佔用時啟動失敗，不自動連到其他服務。資料目錄 `--root` 與程式的 `dist` 目錄分開，服務不會把資料目錄當成靜態網站公開。

## GUI 操作

- 本機網址自動顯示服務中的專案，底部顯示連線、提交、未儲存狀態與檔案路徑。
- 系統選單新增「開啟伺服器專案」「儲存伺服器專案」。輸入 `--root` 內的 `.json` 路徑，沿用版本、外部檔案變更與覆寫檢查。
- 原有 Import Project 仍可上傳檔案，但連線模式會把內容載入服務，成為尚未儲存的新專案。
- Export Project 仍下載目前 GUI 顯示的專案。在連線模式，下載不代表服務已存檔，不清除伺服器 dirty 狀態。
- 外部直接改寫 JSON 檔不會自動載入 GUI；應透過服務操作，或明確重新開檔。存檔時仍會檢查原檔是否被外部修改。
- runtime、環境及報告匯出仍使用共用核心。若有衝突，匯出的是 GUI 當前保留的本機內容，供檢查或備份；不是悄悄讀取新版覆蓋輸入。
- GUI 與其他瀏覽器視窗、MCP 共用資料。搜尋、選取、捲動及展開狀態留在各個 GUI；被選取物件遠端刪除時顯示提示並切到可用項目。專案更新會清除過期的模擬結果。

GUI 的使用者／環境／模擬頁面是各視窗的編輯情境，提交時仍檢查對應核心模式限制。MCP 的 `project_set_mode` 控制 MCP 操作模式，不強迫所有瀏覽器切換頁面。

## 草稿、版本與斷線

一般欄位沿用即時編輯：GUI 先更新工作副本，再依序提交；介面顯示「提交中」。上傳的是變動物件、順序及專案中繼資料的 changeset，不是無條件取代整份專案。服務在佇列中檢查 expectedRevision；GUI 與 Agent 同時修改而版本過期時，拒絕套用。

運算式、事件管理等對話框開啟時，遠端更新暫存，表單內容與使用中的引用仍維持原版本。對話框顯示新版等待提示：

- **取消表單**：沒有待提交編輯時，關閉後載入最新服務版本。
- **套用舊表單**：保留為 GUI 本機編輯並標示衝突，不覆寫服務。可繼續檢查／編輯及「匯出本機專案」。原表單可關閉，但套用的內容保留於本機工作副本。
- **載入伺服器版本**：若有未提交編輯，先確認是否捨棄；確認後載入最新狀態並重設對話框。取消確認則繼續保留本機內容。

目前不自動合併衝突，也不自動重試失敗修改。需要保留的本機編輯可先匯出，載入新版後再重新編輯。

連線中斷或請求逾時時不切換為純網頁版，也不把本機編輯當作已存檔。原輸入留在工作副本；未知提交結果不會自動重送。重新載入服務版本需明確操作，並重新取得連線設定，以識別重啟後的新服務實例；較早的快照回應會失效，避免蓋回舊內容。

## 驗證與邊界

服務保留 GUI 所需的未完成欄位，例如暫時空白的名稱或 NaN 數值。wire codec 保留非有限數，避免一般 JSON 將 NaN 轉成 null。MCP 修改則使用完整驗證的交易；若 GUI 尚有不完整欄位，Agent 修改、存檔、匯出可能被驗證阻擋，應先完成欄位。GUI 已提交的草稿仍受模式與引用保護，存檔 Schema 未放寬。

HTTP 僅監聽 `127.0.0.1`，檢查 Host、Origin、每次啟動的 token 及服務 instanceId；不提供跨來源連線。SSE 通知只提示版本與狀態，GUI 另外取得一致的專案快照。純 GitHub Pages 不連本機服務。

程式分工：

```text
GUI → browser/remoteProjectClient.js → node/web/server.js
                                            ↓
Agent → MCP stdio／stdio bridge → node/projectService.js
                                            ↓
                                  core/projectApi.js

GitHub Pages GUI → 瀏覽器內的 core/projectApi.js session
```

`core/draftChanges.js` 共用變更計算與 wire codec；`node/web/client.js` 是 MCP stdio bridge 的 HTTP 轉接器；`gui/hooks/useProject.js` 依 Node 注入的設定選擇遠端工作副本或純本地 session。
