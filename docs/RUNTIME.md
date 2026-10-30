# 執行資料：Runtime Program JSON

GUI「匯出執行資料」、Project API 的 exportRuntime 與 MCP 的 project_export(format: runtime)，統一輸出 `Program.toJSON()` 格式。預設 referenceMode 為 name，可直接載入 JS runtime，也是其他語言移植的輸入。

```js
import { Program, Runtime } from '../src/runtime/index.js';
const program = Program.fromJSON(downloadedJson);
const runtime = new Runtime({ program, unhandledTasks: 'record' });
runtime.on('task.completed', record => console.log(record.name));
await runtime.runDay({ sequence: 'life' });
await runtime.nextDay(); // 保留狀態，只執行下一天
```

record 模式只記錄沒有 handler 的一般任務，不執行外部副作用。正式宿主依 tasks 中的 name 註冊 handler。任務完成事件不需啟用 diagnostics；診斷預設關閉。

## 統一欄位

| 欄位 | 內容 |
| --- | --- |
| format | 固定 schedule-runtime-program |
| referenceMode | GUI／API／MCP 匯出為 name；核心亦支援 uuid |
| display_name | 專案顯示名稱，僅供除錯 |
| settings | slots_per_day |
| builtins | 固定操作種類的顯示／契約設定；symbol 為可自訂契約名稱，未設定時使用操作種類 |
| variables | 名稱 → 環境／應用變數與群組，含 scope、parent_id、order、初始值與限制 |
| expressions | 名稱 → 計算式巨集，含參數、定義與 scope |
| enums | 名稱 → 列舉與群組；參數也附解析後的 options |
| tasks | 名稱 → 全部外部任務介面，不包含 handler |
| macros | 名稱 → 任務巨集、資格、步驟／分支／候選／後備 |
| slots | 名稱 → 時段行程邏輯 |
| days | 名稱 → 日行程（含私有日）：slotIds、dayStartId、dayEndId、slotEvents、slotReleases、tags |
| weeks | 名稱 → 七天引用 |
| sequences | 名稱 → rows、startWeekday／endWeekday、eventGroups |

name 模式下，即使欄位叫 reference_id、task_id、task_macro_id、parameter_id，其值也是名稱；參數名稱只在擁有者內解析。步驟／候選的局部 id 為 steps_0／candidates_0 等穩定識別。名稱在同類型內唯一，不使用 display_name 解析引用。

不再輸出另一套 format_version、environment_requirements、變數樹、exports 或 task_key 結構，不提供舊格式轉換。直接從集合 key 或 Program.resolve(kind, name) 找入口。

每次匯出保留全部定義與共用引用，不只選取中的周序列。變數以 scope 區分兩層，葉節點均有 initial_value。圖示、說明、展開狀態、手動用途與編輯 uid 不輸出；群組階層、scope、列舉、日行程 tags 與私有日保留。

## 動作與排程

一般任務呼叫為 `{task_id: 名稱, arguments: {參數名稱: Operand}}`；巨集使用 task_macro_id。變數引用使用 reference_id，參數引用使用 parameter_id。不是位置型引數陣列，環境變數也不轉成另一種 environment_reference。

內建操作保留 builtin 固定種類，由 runtime 實作；target_variable_id 是目標變數名稱。自訂契約名稱放於 builtins 設定，不改變操作語意。放行保持 `{builtin: release_slot, condition}`，只存在日行程 slotReleases。

rows 為 `{weekId, repeatCount, overrides}`。repeatCount 是總次數，null 是末筆無限重複。Override 的星期 key 不存在表示繼承，null 表示清空。私有日保留在 days 集合，不嵌入周欄位。

eventGroups 保留 id／name、kind、start／end（week、weekday）、interval、countFilter、executionMode、priority，以及 dayId 或 sourceMode／dayCandidates。countFilter 指定日行程時使用 day_schedule_id，其值也是名稱。精確語意見 [ENGINE_SEMANTICS.md](ENGINE_SEMANTICS.md)。

## 驗證與使用

- [runtime.schema.json](../src/schemas/runtime.schema.json) 是 Program JSON 的獨立 Schema，來源為 [programSchema.js](../src/runtime/programSchema.js)；`npm run schema:runtime` 重新產生。name／uuid 模式共用此 Schema。
- compileRuntime(draft) 先驗證專案，再委派 Program.fromProject，沒有平行 AST 編譯器。核心測試可明確選擇 `{referenceMode: 'uuid'}`。
- validateRuntimeDocument(data) 先檢查結構，再以 Program 與 Runtime 初始化檢查名稱、引用、初始值等限制。Schema 不取代來源專案完整的型別、權限及循環驗證，外部 engine 仍須驗證接收的輸入。
- GUI 檔名仍為 character-schedule-runtime.json；MCP／本機服務沿用 runtime 匯出選項及 revision／檔案保護機制。
- 匯出不修改專案、不標示已儲存。此檔是執行定義，不是專案存檔或執行中的 checkpoint；保留編輯內容使用專案存檔／Blueprint，恢復執行進度使用 checkpoint。

API、暫停與恢復見 [runtime README](../src/runtime/README.md)；跨語言移植與驗收資料見 [PORTING.md](../src/runtime/PORTING.md)。
