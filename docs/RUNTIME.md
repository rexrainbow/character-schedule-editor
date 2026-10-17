# Runtime data v1

expression_macros.definition 也支援 `{kind: "branch", branches: [{condition, result}, ...]}`，result 是原本的 number／boolean 單一定義，所有分支結果須符合巨集 value_type。第一個條件符合者回傳其結果，唯一最後 ELSE 保證有回傳值；只有選中結果求值。條件及結果內的環境引用皆轉成 engine_key，詳見 [COMPUTED_BRANCHES.md](./COMPUTED_BRANCHES.md)。

任務巨集可為空：`mode: "sequence", steps: []` 或 `mode: "branch", branches: []`。呼叫仍保留 task_macro_id 及依介面傳入的引數，巨集仍輸出 display_name、參數和選填 engine_key；不展開或加入假動作。Runtime 可於呼叫巨集時印出「正在執行：display_name」，空內容隨即完成並繼續後續執行。記錄名稱是 engine 的執行追蹤策略，編輯器只輸出資料。空巨集不增加環境任務依賴，宣告參數的型別及必填檢查仍有效。非空分支巨集仍須恰好有一個最後的 ELSE。

使用者模式的「匯出執行資料／Export runtime data」產生 `character-schedule-runtime.json`，供 engine 載入執行。這不是可重新編輯的專案檔；可編輯資料請另外使用左側專案選單的「匯出專案」。

獨立 JSON Schema 位於 [src/runtime.schema.json](../src/runtime.schema.json)，編譯器為 [src/runtimeModel.js](../src/runtimeModel.js)。Schema 可用 `npm.cmd run schema:runtime` 重新產生；產生器沿用專案的運算式與條件式定義，僅保留 runtime 用到的定義，不依賴外部 Schema 檔案。

## 根結構

| 欄位 | 語意 |
|---|---|
| `format_version` | 固定為整數 `1`，獨立於編輯器的 `schema_version` |
| `display_name` | 專案顯示名稱，僅供除錯 |
| `settings.slots_per_day` | 每日日行程的時段數 |
| `environment_requirements` | 實際引用的環境變數及單一任務契約 |
| `environment_variables` | 完整環境層變數樹，包含初始值 |
| `application_variables` | 應用層變數樹，根節點陣列 |
| `expression_macros` | UUID → 環境層及應用層計算式巨集定義 |
| `task_macros` | UUID → 序列或分支任務巨集定義 |
| `slots` | UUID → 時段行程的分支定義 |
| `days` | UUID → 具名日行程 |
| `weeks` | UUID → 七天安排 |
| `sequences` | UUID → 周序列 |
| `exports` | 非空應用物件 engine_key → `{kind, id}` |

應用層各集合完整輸出，不限於某個選取的周序列，也不刪除暫時未引用的巨集或行程。環境依賴則只收集這些輸出定義內實際使用的變數與任務。

環境計算式巨集同樣完整輸出至 expression_macros，環境變數引用改為 engine_key，巨集引用保留 UUID，不輸出 scope／icon。預設行程進度變數及三個環境布林巨集的定義與 engine 更新契約見 [ENVIRONMENT_EXPRESSIONS.md](./ENVIRONMENT_EXPRESSIONS.md)。

所有有名稱的輸出物件保留 `display_name`，不輸出 icon。`display_name` 不唯一，也不參與解析參照。`engine_key` 輸出時去除前後空白；空字串不輸出，應用物件仍可透過 UUID 引用。

## 變數與運算式

應用變數群組為 `{id, display_name, engine_key?, kind: "group", children: [...]}`。葉節點為 `{id, display_name, engine_key?, kind: "value", value_type, read_only, initial_value}`。環境變數使用相同樹結構，但葉節點必須有 engine_key。陣列順序保留編輯器排序，不再輸出 `parent_id`、`order`、`scope`。這是包含初始值的資料結構定義，不包含執行中狀態。

應用變數引用保持 `{type: "reference", reference_id: UUID}`。環境變數引用改為 `{type: "environment_reference", engine_key: "..."}`，engine 應在載入時透過 key 解析到環境提供的實體。

每個環境變數依賴包含 `{engine_key, display_name, value_type, read_only, access}`；`access` 為 `read`、`write` 或 `read_write`。完整環境變數空間另存於 `environment_variables`，包含群組和未引用葉節點。兩層變數樹的葉節點均明確輸出符合型別的 `initial_value`，詳見 [INITIAL_VALUES.md](./INITIAL_VALUES.md)。Runtime 自行決定是否採用環境層初始值。

Expression、Comparison、ALL／ANY 保留遞迴 AST。計算式巨集引用保持 UUID，不展開巨集、不求值。巨集參數引用保持所屬巨集內的參數 UUID。

## 任務與巨集

環境單一任務呼叫為 `{task_key: "...", arguments: [Operand, ...]}`。參數依該任務定義的參數陣列順序傳遞，空參數任務使用空陣列。環境依賴中附上 `{engine_key, display_name, parameters: [{display_name, type}, ...]}`。參數名稱僅供除錯，位置與型別是 v1 契約；engine 應核對順序與型別。環境任務 UUID、參數 UUID 及實作不輸出。

任務巨集保留 `{display_name, engine_key?, parameters, mode, steps | branches}`。巨集參數保留 `{id, display_name, type}`，呼叫保持 `{task_macro_id: UUID, arguments: {參數UUID: Operand}}`。這些 UUID 是檔案內局部契約，不要求環境知道巨集參數 ID。

一般任務與巨集可宣告 `type: "variable_reference"`，另附 `value_type: "number" | "string" | "boolean" | "any"` 及 `access: "read" | "write" | "read_write"`。環境任務的參數契約也保留這兩個限制。

引用引數不是求值用 Operand。應用引用為 `{type: "variable_reference", reference_id: UUID}`；環境引用為 `{type: "variable_reference", engine_key: "..."}`。engine 必須傳遞位置／控制代碼，不得先讀取變數內容。巨集內轉傳時保持 `{type: "parameter_reference", parameter_id: UUID}`，依該參數宣告解讀成引用。

引用參數不支援在算術或條件式中直接求值；需要取得值時仍使用既有的變數讀值運算式。傳遞給巨集的引用保持身分，數值參數才於進入巨集時求值。環境變數依賴會合併讀取與寫入用途，engine 應核對實際寫入權限。

序列巨集的 `steps` 直接為任務呼叫陣列，省略步驟 ID。分支巨集與時段行程保留 `{condition, task}`，ELSE 為最後一個 `condition: null`。來源專案原有的巨集呼叫限制仍適用。

設定變數模板呼叫為 `{task_key: "使用者設定的 engine_key", target: VariableReference, value: Operand}`。Runtime 不輸出固定的 `builtin` 識別，engine 必須依 task_key 連接提供此介面的任務。`target` 可為應用 UUID 引用或環境 key 引用，傳遞寫入位置，不是先求值成變數內容；它取代編輯器的 `target_variable_id`。寫入權限與型別在匯出前檢查。

此契約也列在 `environment_requirements.tasks`，兩個參數種類固定為 `variable_reference` 與 `expression`，後者結果型別必須符合目標變數。名稱來自專案自訂設定，未自訂時取匯出當下的介面語系。模板本身不是 runtime 固定任務名稱；未設定 engine_key 且實際使用時會拒絕 runtime 匯出。

另外三個固定範本同樣以使用者設定的 task_key 連接 engine：「增加數值」輸出 `{task_key, target, value}`，value 為數字 expression，target 契約為 number/read_write；「切換布林」輸出 `{task_key, target}`，target 為 boolean/read_write；「重設初始值」輸出 `{task_key, target}`，target 為 any/write。重設基準是 runtime 實際採用的初始化值，不在呼叫內嵌入初始值。完整語意與原子更新契約見 [BUILTIN_VARIABLE_TASKS.md](./BUILTIN_VARIABLE_TASKS.md)。

## 行程

日行程保留 `{display_name, engine_key?, slot_ids: [UUID | null, ...]}`；UUID 引用 `slots`。

周行程的 `days` 固定包含 `mon` 至 `sun`。值為具名日行程 UUID、`null`，或直接嵌入的匿名日行程定義。匿名日行程不再輸出獨立 UUID、`scope` 或 `owner`，也不放入 `days` 或 `exports`。

周序列為 `{display_name, engine_key?, entries: [{week_id: UUID, day_overrides: {...}}, ...]}`。覆蓋直接附在該列，不輸出 `week_number` 或編輯器列 UID；星期欄位不存在表示沿用原周，`null` 表示清空，具名日行程 UUID 表示覆蓋。空周序列合法。

## 對外入口與檢查

`exports` 的 `kind` 為 `operands`、`expressions`、`taskMacros`、`slots`、`days`、`weeks` 或 `sequences`。engine 可透過此表找到外部指定的應用物件；其中 `operands` 的 ID 對應 `application_variables` 中任一節點。沒有 key 的物件不列入此表。移動變數群組或修改顯示名稱不影響 UUID 及 key。

匯出前先執行完整專案驗證，再檢查所有非空 key 的全域唯一性，以及實際引用的環境任務與全部環境層變數葉節點是否有 key。缺漏或重複會列出位置並拒絕 runtime 匯出；完整專案匯出仍允許 key 重複或留空。

Schema 驗證 JSON 結構。來源編譯器另檢查引用、型別、循環、ELSE 位置、巨集作用域、寫入權限及每日格數。engine 載入時仍須核對環境是否提供所需 key、型別、寫入能力及任務參數契約。

runtime 匯出不標示專案已儲存、不修改專案資料，也不能透過「匯入專案」載入。環境定義的獨立匯入／匯出見 [ENVIRONMENT.md](./ENVIRONMENT.md)。本格式不包含環境實作；專案已有環境識別資訊時，`environment_requirements.environment` 會附上其 `{id, display_name, version}`，沒有識別資訊的既有專案可省略此欄位。
