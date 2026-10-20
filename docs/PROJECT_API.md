# 共用專案操作 API

檔案位置已依 [原始碼目錄](./SOURCE_LAYOUT.md) 整理，純 JS 核心集中於 `src/core/`，React 整合位於 `src/gui/`。

`src/core/projectApi.js` 是 Web 與 Node.js 共用的記憶體專案操作入口。這次重構包含 Project API、GUI 中的資料操作整併，以及 React 訂閱介面；未新增 CLI、MCP 或 Node.js 檔案讀寫。

```text
React GUI / 未來 CLI 或 MCP
             ↓
      createProjectSession
             ↓
  現有 model、引用規則、Schema 與匯出
```

核心不依賴 React、DOM、瀏覽器儲存或檔案系統。原本內建任務檔案中的純資料邏輯已拆至 `builtinTaskModel.js`，`builtinTasks.js` 保留給 React 使用的 hooks 並重新匯出純函式。其他 model 仍各自維護，不將所有演算法搬入單一類別。

## 建立工作階段與讀取資料

```js
import { createProjectSession } from './src/core/projectApi.js';

const project = createProjectSession();
const loaded = project.loadDocument(jsonData);
if (!loaded.ok) console.log(loaded.errors);

const days = project.days.list({ name: '工作', tag: '平日' });
const day = project.days.get(dayId); // 找不到時為 null。
```

`loadDocument()` 接收現有專案存檔 JSON，驗證通過後才取代整份專案並清除操作紀錄；失敗保留原專案。`reset()` 用於建立或取代整份工作階段。兩者是明確的專案生命週期操作，不等同編輯目前模式中的某個物件。

一般查詢回傳獨立副本。`getSnapshot()` 回傳供訂閱使用的深度凍結快照，無變更時保持同一個物件；不能透過它直接修改專案。

API 使用現有 JavaScript model 的欄位：行程為 `name`、`slotIds`、`rows` 等，變數與定義為 `display_name`。行程及任務集合的 `create`／`update`／`replace` 也接受另一種名稱拼法作為輸入別名。存檔中的 `slot_ids`、`week_schedule_ids` 等轉換由核心處理，JSON 格式保持不變。

中斷控制使用 `sequences.events(sequenceId).update(eventId, { executionMode: 'interrupt_main' })`，模式另有 `overlay` 與 `interrupt_lower`。日行程透過 `days.update(dayId, { slotReleases: [...] })` 設定每時段放行，元素為 null 或 `{ builtin: 'release_slot', condition: null | Condition }`，陣列長度與 `slotIds` 相同。存檔欄位分別為 `execution_mode`、`slot_releases`；用途篩選識別字為 `interrupt`。詳見 [SLOT_RELEASE.md](./SLOT_RELEASE.md)。

## 對象與動作

| 對象 | 主要操作 |
| --- | --- |
| `settings` | `get`、`update`，每日時段數的鎖定規則仍適用 |
| `slots` | `list`、`get`、`create`、`update`、`replace`、`duplicate`、`references`、`remove` |
| `days` | 同上，另有 `assignSlot`、手動用途查詢 `uses(id?)`，`list({ use })` 可依用途篩選 |
| `weeks` | 同上，另有 `assignDay`、`assignSlot` |
| `sequences` | 同上，另有 `appendWeek`、`replaceWeek`、`moveWeek`、`duplicateWeek`、`removeWeek`、`setOverride`、`setBoundary` |
| `sequences.events(sequenceId)` | `list`、`get`、`create`、`update`、`replace`、`duplicate`、`remove`、`references`、`moveStart` |
| `variables` | `list`、`get`、`create`、`update`、`unset`、`duplicate`、`remove`、`references`、`move`、`addProgress` |
| `expressions` | `list`、`get`、`create`、`update`、`duplicate`、`remove`、`references`、`setDefinition` |
| `tasks` | 一般集合操作，以及 `parameters(taskId)`；`builtins.list`／`builtins.update` 只開放固定定義的顯示資訊 |
| `taskMacros` | 一般集合操作，以及 `parameters(macroId)`、`setMode`、`moveEntry`、`addStep`、`duplicateStep` |
| `enums` | `list`、`get`、`create`、`update`、`duplicate`、`remove`、`references`、`move` |
| `environment` | `previewImport`、`import`、`update` |

集合中的 `update(id, patch)` 僅更新提供的欄位；`replace(id, value)` 取代整個物件並保留原 UUID。時段行程退出優先候選模式時需要移除 `mode`、`candidates`，因此使用 `replace`。變數的選填數值限制以 `unset(id, ['min_value'])` 移除，空白不轉成 null 或 0。

`parameters(ownerId)` 提供 `add(name)`、`update(parameterId, patch)`、`remove(parameterId)`、`move(index, offset)` 及 `references(parameterId)`。更新參數契約會沿用型別清理與引用相容性檢查；移除參數同步清除呼叫端引數。固定內建任務不能藉此新增或刪除參數，`builtins.update` 也會拒絕改變固定參數結構。

複製、刪除、周私有日行程、Day Override、變數子樹及事件引用等，沿用原有 model 規則。`references()` 回傳各對象既有的引用資訊，格式依對象而異；`slots.references`、`weeks.references` 為引用數量，`days.references` 包含周引用數、覆蓋數、計數篩選及事件引用。

## 動作結果與驗證

資料修改回傳結果，不以 GUI 視窗回報錯誤：

```js
const result = project.days.update(dayId, { name: '工作日' });
// { ok, value, id, draft, errors, blocked, warnings, nodes }
```

- `ok`：是否成功；失敗時快照維持原狀。
- `value`／`id`：新增或受影響的物件資訊。指派操作可能不回傳物件；周序列結構操作及事件 `replace` 回傳周序列。
- `errors`：包含 `code`、`key`、`path`，必要時附引用資訊。
- `warnings`：包含重複 `engine_key` 等不阻擋操作的資訊。
- `draft`／`nodes`／`blocked`：提供現有 GUI 的相容介面；`draft` 是工作階段快照，`nodes` 是變數／計算式集合。

預設 `validation: 'strict'`，每次動作完成後檢查整份專案；`validate()` 可取得目前錯誤及警告。對空巨集、空序列等既有合法資料的規則保持不變。

GUI 使用 `validation: 'draft'`：容許名稱暫時空白、數值輸入未完成或任務尚未選取，以保留欄位錯誤提示的互動。引用移除、型別變更、列舉契約與模式限制仍由核心處理；完整驗證保留於 Apply／匯出流程。`editProject(draft, t)` 是供 GUI 建立隔離工作副本的便利函式，使用 `mode: 'all'`；候選資料提交到主工作階段時，仍檢查實際模式。

## 批次交易

```js
const result = project.transaction(tx => {
  const slot = tx.slots.create({ name: '檢查設備' }).value;
  const day = tx.days.create({ name: '設備巡視' }).value;
  tx.days.assignSlot(day.id, 'dayStart', slot.id);
  return { slotId: slot.id, dayId: day.id };
});
```

交易內的成功修改累積在工作副本，直到結束才驗證及通知訂閱者。任何動作失敗、例外或最終驗證失敗，都回復原快照及操作紀錄，不通知 GUI。交易必須同步，不支援巢狀交易；新增後再指派仍須遵循個別操作的前置條件。

預設交易結束時完整驗證；GUI 需要保留未完成欄位時，可明確使用 `{ validate: false }`，但模式與引用保護仍保留。`changes()` 回傳成功動作摘要，`getRevision()` 回傳資料更新次數；沒有實際變更時不增加版本、不通知訂閱者。

## 編輯模式

`setMode('user' | 'environment' | 'simulation' | 'all')` 控制可修改的範圍：

- `user` 可修改應用層內容，環境變數、列舉、計算式、任務及環境資訊受保護。
- `environment` 可修改環境定義，不開放一般行程與應用層內容。移除任務參數時，允許核心推導出的引數清理。
- `simulation` 不允許修改專案；模擬測試值仍由模擬工作階段持有。
- `all` 供完整維護與隔離工作副本使用。

環境匯入使用專用 `environment.import()`，沿用預覽中的相容性檢查與引用重連，限環境或完整維護模式。

## React 與表單草稿

`useProject.js` 透過 `useSyncExternalStore(project.subscribe, project.getSnapshot)` 接入 React。`App` 持有唯一的主工作階段，各編輯器使用共用動作建立候選，再由主工作階段提交。訂閱通知只發布完整的新快照。

搜尋、選取、確認對話框、顯示語系、導覽位置及模擬測試值維持 GUI 狀態。按 Apply 前的運算式、分支及事件表單亦維持隔離草稿，Cancel／Back 不會提交。核心提供 `newDraft`、`duplicateDraft`、`changeKindDraft` 等輔助方法處理這些表單的物件建立與預設值，不直接控制視窗。

## 序列化與平台邊界

`toDocument()`、`exportEnvironment()`、`exportRuntime()` 回傳既有 `{ data, errors }`。`exportReport({ includeUnreferenced })` 使用相同結果格式，`data` 為 Markdown 行程報告字串，詳見 [REPORT.md](./REPORT.md)。呼叫端確認無錯誤後，Web 產生下載、Node.js 寫入檔案。核心不負責檔案路徑、下載、localStorage、確認視窗或 toast；尚未加入 Node.js 檔案介面。

[事件的多日行程來源與手動模擬選擇](./EVENT_DAY_SOURCES.md)

[流程控制：預約事件](./SCHEDULE_EVENT_TASK.md)
