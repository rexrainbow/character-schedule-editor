# 單次、週期與機率事件

此文件定義目前事件格式；開發階段不相容舊的 `interval_days: 0` 單次格式。專案及 runtime 的 Schema 都改成以下三種互斥物件。

| kind | 日期及規則 |
| --- | --- |
| `once` | 只有 `start`，不輸出 `end`、`count_filter` 或週期欄位 |
| `periodic` | `start`、`end`、`interval_days >= 1`、`count_filter` |
| `probability` | `start`、`end`、`probability_percent`（0–100）、`cooldown_days`（非負安全整數）、`count_filter` |

共同欄位為 UUID id、必填 name、選填 display_name、日行程來源及整數 priority。專案另外儲存事件本身的 icon，runtime 不輸出圖示。複製會產生新 UUID、配置不重複的 name，並複製圖示及規則。

事件管理使用事件類型選單。單次事件隱藏結束日及計數依據。切換類型時暫存各類型草稿，切回可取回尚未儲存的設定；存檔只輸出目前類型的欄位。事件名稱、圖示、name、來源日行程與優先權保留。

## 日期與冷卻契約

週期與機率事件共用正向計數依據：`{kind: "all"}`、`{kind: "day", day_schedule_id: UUID}`、`{kind: "tag", tag: 字串}`。依 Day Override 後的主要日行程辨識；疊加事件及流程控制不改變計數依據。範圍起訖都包含在內，且只在周序列有效開始／結束日期內執行。

機率事件在第一個符合日期即可判定。發生後跳過接下來 `cooldown_days` 個符合日期；例如冷卻 7，接下來 7 個符合日期都不擲機率，第 8 個才恢復判定。不符合計數的日期不消耗冷卻。冷卻為 0 時，下一個符合日期即可再次判定。

runtime 在每天開始執行任何行程前，先依當時的設定與冷卻狀態決定所有事件是否發生，再依既有優先權組成當日計畫。當天的任務修改不回溯改變這份計畫。機率 0 永不發生，100 必定發生，但仍受日期、計數及冷卻限制。

靜態匯出僅包含初始設定；每個 runtime 執行實例應另外保存事件狀態，以事件 UUID 區分機率、冷卻設定與剩餘冷卻。修改冷卻設定不回溯改變已經開始的剩餘冷卻，也不重置其他事件。

周序列上的機率事件圖示為虛線框候選標示，資訊列顯示機率與冷卻，不表示已確定發生；候選日期數也不是實際發生次數。

## 事件引用與參數

任務及任務巨集的參數可使用 `type: "event_reference"`，並宣告 `event_kind: "any"` 或 `"probability"`。選擇面板以事件圖示、名稱、所屬周序列列出，可搜尋及使用相容的巨集參數。

```json
{ "type": "event_reference", "event_group_id": "事件 UUID" }
```

也可使用 `{ "type": "current_event_reference" }`，指正在執行的疊加事件，或以 `parameter_reference` 轉傳巨集參數。主要日行程與單獨時段模擬沒有「目前事件」。明確引用必須屬於當下執行的周序列，跨周序列引用會報錯；共用的任務編輯器不預先綁定周序列。

刪除事件或會連帶移除它的來源日行程、周、周序列時，若仍有事件引用則拒絕提交並提示數量。已被「僅機率事件」參數、屬性讀取或調整任務引用的事件，改為其他類型時亦無法套用。匯入會回報缺失事件或不符類型的引用位置。

## 讀取與調整

數值運算元選單新增「事件屬性」，可與算術式、比較式及計算式巨集共用：

```json
{
  "type": "event_property",
  "event": { "type": "current_event_reference" },
  "property": "probability_percent"
}
```

可讀取 `probability_percent`、`cooldown_days`、`cooldown_remaining`，皆為數字。這些屬性僅接受機率事件。讀取參數可以使用所在任務巨集的事件參數；計算式巨集沒有參數介面，使用明確引用或目前事件。

內建「調整機率事件」位於流程控制分類，固定四個參數（事件、屬性、操作、數值），可自訂名稱、圖示、name 與參數顯示名稱。屬性可選機率或冷卻設定，操作可選設定或增加；屬性與操作共用選項參數元件，可引用相容的巨集 enum 參數，詳見 [ENUM_PARAMETERS.md](./ENUM_PARAMETERS.md)。數值使用 expression 編輯器。

```json
{
  "builtin": "adjust_probability_event",
  "event": { "type": "current_event_reference" },
  "property": "probability_percent",
  "operation": "increase",
  "value": { "type": "constant", "value": 5 }
}
```

機率增加 5 是增加 5 個百分點，結果限制於 0–100。冷卻設定必須得到安全整數，負數限制為 0，小數與非有限值報錯。剩餘冷卻只能讀取，不能由此任務直接寫入。當天之後的運算式可以讀到新設定，但它只影響之後日期的發生判定。

runtime 任務輸出使用 task_key、`event_operation: "adjust_probability"` 及相同的 event/property/operation/value；task_key 的內容為內建任務的 name。

## 單日模擬

模擬模式的「周序列某日」列出當日符合日期及計數依據的機率事件，每個提供「發生／不發生」選單，預設不發生。不符合日期的事件無法強制加入，沒有亂數或種子設定。

此處手動指定結果優先於機率數字，因為沒有前幾日歷史可判斷冷卻。剩餘冷卻明確假定為 0；指定發生者以設定冷卻天數作為當天開始後的剩餘冷卻。選擇僅存在模擬工作階段，以周序列及日期分開保存，不寫入專案或 runtime 靜態資料。

模擬紀錄包含手動決定、事件調整前後的數值，以及當天計畫不變的說明。每次執行都從專案初始事件設定開始；「使用結果數值」只沿用變數空間數值，不將事件狀態當成專案設定，也不代表連續日期模擬。

實作與驗證：`src/core/eventReferences.js`、`src/core/sequenceEvents.js`、`src/core/daySimulationModel.js`、`src/core/simulationModel.js`、三份 JSON Schema，以及 `tests/probabilityEvents.test.js`、`tests/browser/probabilityEvents.spec.js`。
