# 可恢復 Runtime

精確的選擇、求值、事件排序、變數寫入、中斷／放行、重置與恢復規則，統一見 [ENGINE_SEMANTICS.md](../../docs/ENGINE_SEMANTICS.md)。本 README 著重 API 與程式組織。

這個資料夾是獨立、可在瀏覽器與 Node.js 使用的執行核心。模擬 GUI 已透過 `src/simulation/` 使用 UUID 版本；右上角既有執行資料匯出格式尚未改接。以 `index.js` 作為公開入口。

## 組織

| 模組 | 職責 |
| --- | --- |
| `Program` | 編譯唯讀定義、UUID／name 引用、索引、初始值與引用驗證 |
| `DayExecution` | 決定當日事件、選擇候選日行程、依階段協調所有來源 |
| `EventOccurrence` | 當天某個事件的執行身分，與共用日行程的身分分開 |
| `ExecutionMachine` | 使用普通資料 frame 推進分支、序列、優先候選與巢狀巨集 |
| `Evaluator` | 條件、算式、參數、變數讀寫及限制 |
| `Runtime` | 非同步任務 handler、逐任務提交、暫停、恢復與事件通知 |
| `MemoryCheckpointStore` | 預設記憶體保存介面；磁碟／IndexedDB 等持久化由呼叫端實作 |

不保存 JS 呼叫堆疊、Promise、handler 或 listener。checkpoint 使用純 JSON 資料，包含階段／來源位置、巨集 frame、已選分支、待重試任務與引數、變數、初始值基準、亂數、事件冷卻、候選輪替索引、放行／中斷與預約事件。

## 建立與執行

```js
import { Program, Runtime, MemoryCheckpointStore } from './src/runtime/index.js';

// 接受目前 editor draft 或完整 project JSON；先通過專案驗證。
const program = Program.fromProject(project, { referenceMode: 'name' });
// 編輯器預覽可選 referenceMode: 'uuid'，執行的是同一套核心。
const checkpointStore = new MemoryCheckpointStore();
const runtime = new Runtime({ program, checkpointStore, seed: 'test-1' });

runtime.registerTask('repair', async (args, context) => {
  await engine.repair(args, {
    signal: context.signal,
    invocationId: context.invocationId,
  });
  // 都寫入本次任務的暫存狀態；成功完成才提交。
  context.setVariable('money', context.getVariable('money') - 10);
});

runtime.on('task.completed', event => console.log(event.name));
await runtime.runDay({ sequence: 'life', dayIndex: 0 });
await runtime.nextDay();
```

一般任務使用定義的 `name` 註冊，`args` 也以參數的 `name` 為 key。巨集內部參數則依所選引用格式保存。任務的 `invocationId` 表示「某次呼叫」，重試時不變；`attempt` 從 1 開始累加。

變數引用參數的值為 `{ type: 'variable_reference', reference_id, access }`，可直接傳入 `context.getVariable()`／`setVariable()`。寫入遵守型別、唯讀、整數截斷與上下限；使用引用物件時也檢查 read／write 存取。handler 是可信任的 engine 程式，這不是安全隔離機制。

## 執行 API

- `startDay({ sequence, dayIndex })`：準備一天並保存，不立即執行任務。dayIndex 是相對序列開始日的零起算索引；也可改傳 `position`，表示由第一周周一起算的位置。
- `runDay(options)`：`startDay()` 後執行 `resume()`，完成當天就停止，不自動跑下一天。
- `nextDay()`：目前一天完成後，保留狀態執行下一天。超過序列結束會拒絕。同一序列已開始連續執行後不允許跳日或倒退，避免冷卻／輪替歷史不一致。
- `startSlot({ slot })`／`runSlot({ slot })`：沒有全天上下文的單一時段行程。預約事件、事件屬性等需要日期的操作會拒絕。
- `step()`：推進到一個最小任務完成後停止。若剩餘內容沒有任務，則直接完成。
- `resume()`：從目前位置繼續，直到當天／時段行程完成、暫停或失敗。
- `await pause()`：要求中止目前 handler，等待 runtime 進入暫停。不要在 handler 內 `await runtime.pause()`，那會等待自己；handler 可透過 signal 接收外部暫停。
- `snapshot()`：取得 JSON checkpoint 副本；`saveCheckpoint()` 明確保存；`getState()` 取得執行狀態副本。
- `getVariable(ref)`／`await setVariable(ref, value)`：空閒時讀寫提交的變數。系統注入唯讀變數需明確傳 `{ system: true }`；任務 context 不提供此繞過。

`sequence`、`slot` 與公開變數方法可接受目前 program 的引用值或名稱。不同物件類型可重名；參數只在其擁有者內解析。預設沒有 handler 的一般任務會失敗；模擬用途可指定 `unhandledTasks: 'record'`，記錄呼叫並假設沒有外部副作用，結果標記 `unmodeled`。

## Program 與現有匯出格式

`program.toJSON()` 可輸出新核心使用的 `schedule-runtime-program`，由 `Program.fromJSON(data)` 載入。UUID／name 版本具有相同結構；name 版本的定義引用、參數引用與巨集引數都不含編輯器 UUID。`Program` 會複製並凍結定義，執行中不接受更名或修改。

此格式尚未接到 GUI 的「執行資料」匯出。既有 `src/core/runtimeModel.js` 的混合引用輸出不是此載入器的輸入，這階段請使用 `Program.fromProject()` 或 `program.toJSON()`，不要將兩種檔案混用。此分界是刻意保留，讓下一階段再統一匯出器與模擬器。

## 暫停與恢復

```js
const running = runtime.runDay({ sequence: 'life' });
// 使用者之後按下中斷：
await runtime.pause();
await running;

const saved = JSON.parse(JSON.stringify(runtime.snapshot()));
const executable = JSON.parse(JSON.stringify(program.toJSON()));

const restored = Runtime.restore({
  program: Program.fromJSON(executable),
  checkpoint: saved,
  checkpointStore,
  taskHandlers: { repair: repairHandler },
});
await restored.resume();
```

恢復使用相同 program；指紋或引用格式不同會拒絕。指紋只做定義一致性檢查，不是安全簽章。handler、listener、手動決策函式與儲存服務須由呼叫端重新提供。

預設 `MemoryCheckpointStore` 不會跨程序持久化。持久化 adapter 須提供：

```js
const checkpointStore = {
  async save(runId, checkpoint) { /* 原子替換此 run 的完整 checkpoint */ },
  async load(runId) { /* 回傳 checkpoint 或 null */ },
};

const restored = await Runtime.load({ program, checkpointStore, runId, taskHandlers });
```

同一 run 只能由一個 runtime 寫入；目前不提供跨程序鎖或多 worker 協調。儲存失敗會停止推進。任務完成時，變數變更與下一個執行位置作為同一份 checkpoint 提交；提交失敗時仍保留原任務供重試。

## 任務交易與外部副作用

在任務開始前，先保存本次呼叫與已求值引數。失敗或中斷時捨棄該 handler 的暫存變更；恢復會從同一任務開頭重跑，不重選分支、不重抽亂數、不重跑已完成的階段或巨集步驟。

`pause()` 透過 AbortSignal 通知 handler；舊 handler 回傳值會被忽略，舊 context 後續寫入也會拒絕。但不能強迫終止任意外部 JS 工作。真正的 engine handler 必須配合 signal；發放物品等外部副作用應以 invocationId 做冪等處理。完成通知尚未持久化前程序中斷，任務可能再執行，不能承諾外部 exactly-once。

## 事件與排程

### 診斷紀錄

預設 `diagnostics: false`。啟用 `new Runtime({ program, diagnostics: true })` 後，以 `runtime.on('diagnostic', record => ...)` 接收當下的結構化紀錄。runtime 不保存歷史紀錄；需要展示或寫檔的訂閱端自行保存。診斷開關不寫入 checkpoint，恢復時由呼叫端重新指定。

record 使用 `type: enter / exit / record`、`kind`、`sequence`、`sessionId`、`runId`、`context`、`path`、`id / parentId` 與種類專屬欄位。任務相關紀錄附 `invocationId / attempt`。涵蓋條件、算式、短路略過、分支／候選選擇、巨集步驟、任務、暫存與已提交變數變更、阻擋與放行。恢復不補發已完成的紀錄；新的診斷 sessionId 區分各次觀察。

`variable.staged` 不代表已保存；`variable.committed` 在任務成功且 checkpoint 提交後才發送。失敗／中止有 `task.failed / task.aborted`，不產生該次任務的 committed 變更。record 是凍結副本，listener 錯誤不影響執行。關閉診斷時不呼叫診斷資料工廠、不建立或發送 record，生命週期事件照常。

`previewDay(options)` 在複製的狀態上準備一天，不消耗正式亂數、不改變冷卻／輪替、不保存 checkpoint、不發出診斷。模擬器傳入手動發生與日行程選取決策，預覽與實際執行採相同選擇。

`progressBindings` 可指定進度角色的變數引用，`null`／空字串停用該角色；省略則按既有 `schedule_*` 名稱自動綁定。`initialValues` 可明確指定重設初始值任務的基準，與 `initialState` 測試輸入分開。

```js
const unsubscribe = runtime.on('slot.start', ({ slotIndex }) => {
  if (slotIndex === 0) console.log('第一個時段開始');
});
runtime.once('day.end', () => console.log('一天完成'));
unsubscribe();
```

- `day.start`、`slot.start`、`slot.body`：進入對應階段、各來源執行前通知。
- `slot.end`、`day.end`：對應結束階段的所有來源完成後通知。
- `phase.start`／`phase.end`：每個階段的通用前後通知。
- `assignment.start`／`assignment.end`／`assignment.skipped`：某事件或主要日行程在某階段的執行。
- `macro.start`／`macro.end`、`condition.evaluated`、`task.start`／`task.completed`／`task.unhandled`、`variable.change`。
- `execution.resumed`／`execution.paused`／`execution.completed`／`execution.error`；預約超出有效範圍有 `reservation.rejected`。

context 包含 runId、sequenceRef、position、dayNumber、零起算 slotIndex、phase，以及可用時的 eventRef、occurrenceId、dayRef、slotRef、priority。內建行程進度變數則維持一日起算。通知資料是凍結的副本；listener 不參與任務執行、不等待完成，錯誤轉為 `observer.error`。通知與外部消費者不具跨程序 exactly-once 保證；需要可靠消費時以 invocationId 等身分去重。

中斷事件在自身開始任務與放行判斷完成後建立本時段的阻擋。放行跳過自己的主體與結束，並讓其他來源有機會執行；下一時段重建阻擋。同一個日行程被不同事件引用，仍以各自 occurrence 分別處理。

預設用可保存狀態的亂數處理機率與權重；冷卻只在符合計數的日期遞減，發生當天設定的 N 天會阻擋接下來 N 個符合日期。sequential 候選在每次發生後前進。預約事件保存在執行狀態，未來 `nextDay()` 到達日期時加入當日來源。

模擬可注入同步決策函式：

```js
const runtime = new Runtime({
  program,
  decisions: {
    occurs(event, date) { return event.name === 'cold'; },
    chooseDay(event, candidates, date) { return candidates[0].dayId; },
  },
  unhandledTasks: 'record',
});
```

決策仍受有效日期與冷卻限制；選擇必須來自該事件候選。已建立的一天會保存選取結果，恢復不再呼叫這些決策函式。若從序列中間首次啟動，之前歷史視為空白；需要真實歷史時應載入 checkpoint 或從前面連續執行。

## 驗證

`node --test tests/runtimeEngine.test.js` 驗證 UUID／name 等價、與現有模擬器的結果一致性、巢狀任務中斷恢復、變數交易、儲存失敗、事件優先權、放行、冷卻、輪替、預約與亂數。瀏覽器測試 `tests/browser/runtimeEngine.spec.js` 驗證核心可直接在 Web 執行並恢復 snapshot。
