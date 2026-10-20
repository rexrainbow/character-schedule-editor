# Node.js 專案服務與 MCP

目前提供 MCP stdio 入口、Node 專案檔案服務及 Web／Node 共用命令層。服務每個程序持有一份專案，沿用既有 Project API 的驗證、模式限制、引用保護、批次交易與匯出功能。

已支援本機 GUI 即時同步，啟動方式見 [GUI_SYNC.md](./GUI_SYNC.md)。`npm run dev` 與 GitHub Pages 維持獨立的純網頁模式。需要同步時，MCP 與 GUI 必須連到同一個服務；不同的獨立程序不共享記憶體。

## 安裝與啟動

使用 Node.js 22.12 以上版本，於專案根目錄執行 `npm install`。已安裝者使用 `npm ci` 可依 lockfile 重建依賴。

```powershell
npm run mcp -- --root C:/mywork/electron-app/character-schedule-editor
```

這是等待 MCP client 連線的 stdio 程序，不會開啟網站。MCP client 設定應直接執行 Node，讓標準輸出只包含 MCP 訊息：

```json
{
  "mcpServers": {
    "character-schedule-editor": {
      "command": "node",
      "args": [
        "C:/mywork/electron-app/character-schedule-editor/src/node/main.js",
        "--root",
        "C:/mywork/electron-app/character-schedule-editor"
      ]
    }
  }
}
```

`mcpServers` 為常見設定格式，實際外層欄位依 MCP client 而定。若 client 找不到 `node`，將 command 改成 Node 執行檔的絕對路徑。

可選參數：

- `--project FILE.json`：啟動時開啟專案，失敗時退出，不提供半載入狀態。
- `--mode user|environment|simulation|all`：預設 user；environment 編輯環境，all 完整維護，simulation 禁止修改。
- `--language en|zh-TW`：預設 en，影響報告與內建顯示名稱。
- `--help`：顯示使用方式後退出。
- `--web --port 5175`：同時提供本機同步 GUI。
- `--web --no-stdio`：僅啟動本機服務，供 GUI 與 MCP bridge 連線；對應 `npm run serve`。
- `--connect http://127.0.0.1:5175`：以 MCP stdio bridge 連到既有服務，不建立另一份專案。

`--root` 預設目前工作目錄，必須是已存在的目錄。檔案路徑可為此目錄內的相對或絕對路徑，不能跨出目錄；也檢查 symlink／junction 的實際位置。目的地的父目錄須已存在。專案、環境、runtime 使用 `.json`，報告使用 `.md`。

## MCP 工具

| 工具 | 功能 |
| --- | --- |
| `project_status` | 取得 revision、mode、file、dirty、root |
| `project_commands` | 列出可用對象／動作；指定 object 時回傳該類操作的 JSON Schema，可再指定 action |
| `project_query` | 唯讀查詢；拒絕修改命令 |
| `project_execute` | 執行單一命令，修改時必須附 expectedRevision |
| `project_batch` | 原子批次，1–1000 個修改命令；失敗整批還原 |
| `project_new` | 新空白專案，預設每日三個時段 |
| `project_open` | 驗證後開啟專案 JSON |
| `project_save` | 驗證後儲存專案 JSON |
| `project_export` | 回傳或寫出 project／environment／runtime／report |
| `project_set_mode` | 明確切換編輯模式，並更新 revision |

Schema resources：`schedule://schema/project`、`schedule://schema/environment`、`schedule://schema/runtime`。

工具回傳同時包含文字 JSON 與 `structuredContent`。一般結果為 `{ ok, revision, mode, file, dirty, value, errors, warnings }`，檔案服務另附 root。邏輯失敗設定 MCP `isError:true`；錯誤包含 code、path 與可用的引用資訊。修改成功不等於已儲存，必須另外呼叫 `project_save`。

## 共用命令格式

命令使用明確白名單，沒有任意 JS、eval 或動態物件路徑呼叫。

```json
{
  "command": {
    "object": "days",
    "action": "update",
    "id": "實際日行程 UUID",
    "values": { "name": "工作日", "purposes": ["main"] }
  },
  "expectedRevision": 3
}
```

命令欄位使用 [Project API](./PROJECT_API.md) 的工作資料形狀：行程為 `name`、`slotIds`、`rows`，事件為 `dayId`、`kind`、`start`、`end`、`interval`、`executionMode`。開檔、存檔與 Schema resources 使用專案存檔形狀，例如 `display_name`、`slot_ids`、`event_groups`；兩者不能直接混用。

支援 slots、days、weeks、sequences、events、variables、expressions、tasks、taskMacros、enums、settings、environment，以及 tasks.parameters、taskMacros.parameters、tasks.builtins。事件命令以 `sequenceId` 指定容器，`id` 指定事件；參數命令以 `ownerId` 指定任務／巨集，`id` 指定參數。請用 `project_commands` 取得各動作的精確欄位。

先查詢既有物件以取得 UUID，不依 display_name 猜測引用。`project_query` 例如：

```json
{ "command": { "object": "sequences", "action": "list" } }
```

新增「感冒」機率事件的 `project_execute` 輸入範例：

```json
{
  "expectedRevision": 3,
  "command": {
    "object": "events",
    "action": "create",
    "sequenceId": "實際周序列 UUID",
    "values": {
      "display_name": "感冒",
      "dayId": "看醫生等內容所在日行程的 UUID",
      "kind": "probability",
      "start": { "week": 1, "weekday": "mon" },
      "end": { "week": 4, "weekday": "sun" },
      "probability_percent": 10,
      "cooldown_days": 7,
      "countFilter": { "kind": "all" },
      "executionMode": "interrupt_main",
      "priority": 1
    }
  }
}
```

周、星期、日行程及執行範圍需依實際專案填入。新增事件不會修改日行程的手動適用用途。

## 版本、批次與存檔

先呼叫 `project_status`；空白啟動 revision 為 0，使用 `--project` 成功開檔後為 1。資料實際變更、開檔、新建、模式變更會增加 revision；相同值的無效修改與存檔不增加。所有請求（包含非同步檔案 I/O）依序執行。

修改需附 `expectedRevision`，不相符時回傳 `revisionConflict` 並保留資料。此時應重新查詢並重新決定修改，不自動覆蓋。查詢可省略版本，也可附上版本要求一致的讀取。

批次使用 `{ expectedRevision, commands: [...] }`，只接受修改命令。每個中間步驟可暫時未完成，但最後必須通過完整驗證與編輯模式限制；只增加一次 revision、通知一次。批次中新建後要立即引用的行程／任務集合，可先由 client 產生 UUID，放進 `create.values.id`，再於後續命令引用。變數與列舉節點的 UUID 由核心產生，須取得結果後再進行下一批操作。

`project_save` 第一次需提供 path，之後可省略而存回原檔。採同目錄暫存檔、寫入完成後 rename，失敗會清理暫存檔。儲存到其他既有檔案需 `overwrite:true`。原專案檔若被外部修改或刪除，會回傳 `fileChanged`，需重新開啟或另存新檔；overwrite 不會略過這項檢查。這是內容雜湊檢查，不是跨程序檔案鎖。

新建／開檔遇到未儲存內容會拒絕，除非明確提供 `discardChanges:true`。失敗的匯入、驗證或存檔保留目前工作資料。匯出不會清除 dirty；匯出有 path 時需 expectedRevision，無 path 時直接回傳資料。不能用 runtime 等匯出覆蓋目前開啟的專案檔。

## 程式結構與 GUI 同步

```text
MCP client → node/mcp/tools.js → node/projectService.js
                                      ↓
                              core/commands.js
                                      ↓
                              core/projectApi.js
                                      ↓
                          原有模型、引用檢查、驗證與匯出
```

`core/commands.js` 不依賴 Node 或 React，可由瀏覽器直接使用：

```js
import { executeCommand, executeBatch } from './src/core/commands.js';
const result = executeCommand(projectSession, {
  object: 'days', action: 'create', values: { name: '工作日' },
});
```

`projectService.subscribe(listener)` 提供已提交的 changed／mode／new／opened／saved／imported 通知。`node/web/` 提供 HTTP、SSE 與 stdio bridge；`browser/remoteProjectClient.js` 將 GUI 工作副本的變動送入同一服務。服務不暴露可直接改寫的 session。

連線 GUI 保留未套用表單、顯示提交狀態，衝突與斷線時保留本機輸入。服務可保存 GUI 未完成欄位，MCP 修改仍以完整驗證交易執行；存檔／匯出也必須通過驗證。詳見 [GUI_SYNC.md](./GUI_SYNC.md)。

MCP 入口採用官方 SDK 的 [stdio server](https://ts.sdk.modelcontextprotocol.io/server#stdio)；SDK 及 Node 檔案模組只從 `src/node/` 引用，不加入純網頁建置。
