# 將 Runtime 移植到其他語言

給 agent 的入口：先閱讀本頁、[API 與組織](README.md)，再以 [Engine 執行契約](../../docs/ENGINE_SEMANTICS.md)及 JS 原始碼處理細節。目標是**相同輸入與操作產生相同行為**，不要求逐行翻譯或維持相同 class 設計。目前沒有 C# 實作；下列對應是建議，不是已提供的 SDK。

## 1. 先限定輸入與範圍

第一階段只實作 `Program.fromJSON()` 與 runtime，接受 JS `Program.toJSON()` 產生的 `format: "schedule-runtime-program", referenceMode: "name"` JSON。名稱已唯一且執行中不改動，適合 C# 字典索引。

GUI「匯出執行資料」、API 與 MCP runtime 匯出已統一為此 Program JSON，可直接作為移植輸入。專案存檔與 YAML Blueprint 不是 Program JSON；也可先由 JS 完成驗證與編譯：

```js
import { Program } from './src/runtime/index.js';
const program = Program.fromProject(project, { referenceMode: 'name' });
const inputForOtherLanguage = JSON.stringify(program.toJSON());
```

此階段不用移植 GUI、YAML parser、專案 API 或 `Program.fromProject()` 的編輯器編譯鏈。之後才擴充 UUID 模式；引用模式不同，選擇與執行語意仍須相同。[runtime.schema.json](../schemas/runtime.schema.json) 已統一為 Program JSON 的獨立 Schema；執行細節對照 Program.js、語意契約與測試資料。

## 2. 閱讀及移植順序

| 順序 | JS 檔案／能力 | C# 可採用的方式 |
| --- | --- | --- |
| 1 | Program.js 的 fromJSON、索引、引用驗證、初始值 | 唯讀 DTO／Dictionary；名稱使用 Ordinal 比較 |
| 2 | Evaluator.js 的條件、算式、參數作用域、變數限制 | 有標記的 number／string／boolean 值，避免隱式轉型 |
| 3 | ExecutionMachine.js 的 frame、候選、巨集、pending | 可序列化 frame 與迭代狀態機，勿依賴語言呼叫堆疊恢復 |
| 4 | DayExecution.js 的日期、事件、來源與中斷 | 明確階段與來源索引；穩定排序 |
| 5 | Runtime.js 的提交、暫停、恢復與通知 | Task、CancellationToken、交易副本與 checkpoint adapter |
| 6 | Diagnostics.js、utils.js | 事件／callback；診斷不保存歷史、不改執行結果 |

runtime 不是只有此資料夾。執行邏輯還使用下列 `src/core/` 檔案中的函數，請追蹤實際呼叫與轉引依賴，不能整個漏掉：

- `sequenceExecution.js`、`sequenceEvents.js`、`sequenceRange.js`、`scheduleConstants.js`：模板／實際日期、重複、事件資格與計數。
- `dayEvents.js`、`eventDaySource.js`：時段位置與候選來源。
- `variableBounds.js`、`randomValues.js`：數值驗證、截斷／夾值與隨機偏移。
- `scheduledEvents.js`：預約日期；`slotRelease.js`、`eventReferences.js`：事件模式與共用判定。

其中部分模組同時含 GUI 編輯／驗證 helper；移植被執行核心使用的函數即可，不必把整條 JS import 圖與 React／編譯鏈全部搬過去。

## 3. 最容易移植錯的界線

- **數字**：JS number 對應 C# double，不能一律改為 decimal／int。寫入順序為型別與有限值檢查 → 朝零截斷 → min／max；安全整數上限為 2^53−1。禁止 NaN／Infinity，不靠夾值修正它們。
- **亂數**：照 utils.js 的 seedNumber／random 與 randomValues.js 的演算法、32-bit 溢位及抽樣消耗順序實作，不能換成 System.Random。C# 用明確 uint、unchecked 與邏輯右移；seed 的字串迭代採 Unicode code point，不是逐 UTF-16 char。
- **順序**：優先候選取首個合格者，加權候選先篩選再抽樣；事件同優先權維持原序。不要使用不穩定排序，或重排物件／陣列後改變抽樣順序。
- **任務交易**：handler 的變數修改先暫存，成功且 checkpoint 保存成功才提交。失敗／取消丟棄本次修改，先前完成的任務不回滾。
- **恢復**：保存資料 frame、已選分支、pending 引數／亂數、變數、初始值基準、冷卻、候選索引與預約。恢復只從未完成的最小任務開頭重試，invocationId 不變、attempt 增加；不重跑先前階段、不重新抽參數。
- **取消與通知**：CancellationToken 需由 handler 配合；觀察者不參與任務提交，例外不能使任務失敗。不要讓原本不等待的通知變成等待型流程。外部副作用仍須由宿主以 invocationId 去重，無法承諾 exactly-once。
- **序列化**：區分缺欄位與 null；不用 display_name 找引用，不受目前文化設定影響。跨 JS／C# checkpoint 互通若是目標，還須逐項相容狀態格式與 programId。

programId 的指紋不是安全簽章。要與 JS 指紋相同，需重現 utils.js 的 canonical／fingerprint：物件 key 按 JS UTF-16 排序、JSON.stringify 的字串與數字表示、字串 code point 迭代與 64-bit 溢位。不能直接拿 C# 預設 JSON 字串雜湊替代。若暫不做跨語言 checkpoint 互通，可採本地快照格式，但仍須檢查對應同一 Program。

## 4. 不讀 YAML 也能驗收

[conformance/cases.json](conformance/cases.json) 是可攜的測試資料，含四組 name Program JSON、種子／初值、操作、簡單 handler 指令與預期結果。外部語言只需 JSON parser；不需要 Node.js 或專案編譯器來執行案例。

| 案例 | 驗證內容 |
| --- | --- |
| selection-and-writes | ALL／ANY 短路、資格、優先候選、分支、截斷／上限與初始值重設 |
| seeded-weighted-selection | Unicode 種子、隨機函數、資格篩選、零權重後備與抽選 |
| days-events-and-release | 九日連跑、跨重複周、週期／冷卻、依序來源、優先權、中斷與放行 |
| pending-task-resume | 任務中途暫停、暫存寫入回滾、JSON 快照恢復、固定引數與重試身分 |

頂層 vectors 提供 RNG 的種子雜湊、每次回傳值與 uint32 狀態；identities 提供 canonical 指紋對照。先通過這些小向量，再跑四組案例，可較快定位數字／亂數／序列化差異。

每個 case 的執行協議：

1. 載入 program，以 options 建立 runtime，依 handlers 建立測試 handler。
2. handlers 的 `increment` 先讀指定變數，再加固定 value 或 args[action.argument]，透過任務 context 暫存寫入。這只是測試 adapter 指令，不是 runtime 的新任務種類。
3. 按 operations 呼叫 runSlot／startSlot／runDay／nextDay／step／resume。step 完成一個最小任務即停；可能尚未走到整段完成。
4. `resumeAndPause` 是宿主測試操作：讓指定 task handler 完成上述暫存修改後等待；由宿主要求 pause，並等待本次執行停止。不能在 handler 內等待 runtime.pause，否則會等待自己。
5. `restore` 將 snapshot 經 JSON 序列化／解析後建立新 runtime，重新註冊 handler 與 listener，尚不 resume。新 runtime 不是從頭初始化。
6. 每個操作後對照 expected 的 status、variables、events、sequential、reservations、randomState、invocations、date、pending 與該操作期間的 trace。error 為 null 表示成功；trace 只保留列出的公開事件欄位，不包含診斷 sessionId 或時間戳。

expected 的 trace 訂閱 phase.start、assignment.start／skipped、task.start／completed、variable.change；僅比較 expected 中列出的欄位（同名事件的其他欄位可忽略）。物件 key 順序不重要，陣列及事件順序必須一致；不存在的欄位不要補 null。pending 只比較投影欄位，內部 frame 形狀可不同。完整 JS checkpoint 互通是額外驗收，這四例只要求各語言自身能 JSON 往返恢復。

整數、字串、布林、狀態與順序精確比較；一般有限 double 可用 `abs(a-b) <= 1e-12 * max(1, abs(a), abs(b))` 比較。RNG 向量應逐值一致，分支門檻不可用誤差容忍改變判斷。

## 5. 維護與完成定義

- `npm run build:runtime-conformance` 從 `scripts/fixtures/runtime-conformance.mjs` 產生資料；`scripts/lib/runtime-conformance.mjs` 是協議的 JS 重播參考。
- `node --test tests/runtimeConformance.test.js` 驗證已簽入的資料，不會重寫 expected。規則改變後，重新產生的差異必須人工審查，不能只重產讓測試通過。
- 四例是起步驗收，不代表所有功能已移植。仍需對照 `tests/runtimeEngine.test.js`、`tests/runtimeDiagnostics.test.js`、`tests/engineSemantics.test.js`，補上預約／事件屬性、引用參數／列舉、錯誤、儲存失敗及完整診斷等案例。
- 最終交付需列出已支援能力、未實作部分、通過的跨語言案例及 checkpoint 是否能與 JS 互通；不能以「可編譯」作為移植完成標準。
