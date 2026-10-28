# Runtime data v1

name 為必填持久化符號，display_name 為選填顯示文字；完整命名規則見 [NAMING.md](./NAMING.md)，執行規則見 [ENGINE_SEMANTICS.md](./ENGINE_SEMANTICS.md)。

共用列舉以頂層 enum_definitions 保存；參數可用 enum_id 引用，也可繼續以 options 自訂選項。Runtime catalog 不含群組或圖示。詳見 [ENUM_DEFINITIONS.md](./ENUM_DEFINITIONS.md)。

任務與巨集的參數支援 `type: "enum"`，需附帶非空 `options: [{display_name, value}]`。呼叫可使用合法字串常數或相容的 enum 參數引用。內建調整機率事件的 property、operation 現在也能是參數引用，須先在巨集作用域解析後執行。完整契約見 [ENUM_PARAMETERS.md](./ENUM_PARAMETERS.md)。

事件組以 count_filter 正向選擇全部日期、指定日行程或指定標籤。先套用 Day Override 取得主要來源，再判斷計數資格；不符合的日期不計數也不執行。從事件起點起，在第 1、1+N、1+2N… 個符合日期執行，序列邊界只裁切執行，不重設相位。Runtime 日行程與內嵌匿名日皆包含 tags。單次事件只比對起點。詳見 [SEQUENCE_EVENTS.md](./SEQUENCE_EVENTS.md)。

sequences 可包含 event_groups，保存事件組 UUID、名稱、共用日行程 UUID、固定周次／星期及整數 priority。以 kind 區分 once（單次，只有 start）、periodic（起訖、interval_days ≥ 1、count_filter）、probability（起訖、probability_percent、cooldown_days、count_filter）。Engine 於每日任務開始前決定事件，再在每個日內位置，以高優先權到 0、主要日行程、負優先權的順序合併；相同值依陣列建立順序，不去重。序列執行範圍只裁切執行，不改變週期相位。事件 icon 只保存在專案，runtime 不輸出。格式及完整契約見 [PROBABILITY_EVENTS.md](./PROBABILITY_EVENTS.md) 及 [SEQUENCE_EVENTS.md](./SEQUENCE_EVENTS.md)。

日行程及匿名內嵌日可含 day_start_slot_id、day_end_slot_id 及 slot_events，各值引用同一份 slots。事件不增加每日時段數，執行位置順序與空值規則見 [DAY_EVENTS.md](./DAY_EVENTS.md)。未指定主時段時仍可執行該時段事件；不存在日行程時沒有對應事件。

每個 sequences 項目含 `start_weekday`／`end_weekday`（mon～sun），分別套用第一筆／最後一筆 entries，預設 mon／sun。有效日期包含兩端，engine 從開始日第一個時段執行至結束日最後一個時段；schedule_current_day 從開始日 1 起算，同一天不因時段推進而增加。entries 與 day_overrides 完整保留，不裁切範圍外資料。空序列沒有可執行日期；單筆 entries 的開始日必須早於或等於結束日。

時段行程允許 `branches: []`，代表僅以 `display_name` 表示的活動，不包含任務動作。Runtime 可顯示活動名稱並完成；如需穩定連接程式功能，使用 `name` 契約。非空分支仍須完整任務與唯一最後 ELSE。

expression_macros.definition 也支援 `{kind: "branch", branches: [{condition, result}, ...]}`，result 是原本的 number／boolean 單一定義，所有分支結果須符合巨集 value_type。第一個條件符合者回傳其結果，唯一最後 ELSE 保證有回傳值；只有選中結果求值。條件及結果內的環境引用皆轉成 name，詳見 [COMPUTED_BRANCHES.md](./COMPUTED_BRANCHES.md)。

任務巨集可為空：`mode: "sequence", steps: []` 或 `mode: "branch", branches: []`。呼叫仍保留 task_macro_id 及依介面傳入的引數，巨集仍輸出 display_name、參數和必填 name；不展開或加入假動作。Runtime 可於呼叫巨集時印出「正在執行：display_name」，空內容隨即完成並繼續後續執行。記錄名稱是 engine 的執行追蹤策略，編輯器只輸出資料。空巨集不增加環境任務依賴，宣告參數的型別及必填檢查仍有效。非空分支巨集仍須恰好有一個最後的 ELSE。

使用者模式的「匯出執行資料／Export runtime data」產生 `character-schedule-runtime.json`，供 engine 載入執行。這不是可重新編輯的專案檔；可編輯資料請另外使用左側專案選單的「匯出專案」。

獨立 JSON Schema 位於 [src/schemas/runtime.schema.json](../src/schemas/runtime.schema.json)，編譯器為 [src/core/runtimeModel.js](../src/core/runtimeModel.js)。Schema 可用 `npm.cmd run schema:runtime` 重新產生；產生器沿用專案的運算式與條件式定義，僅保留 runtime 用到的定義，不依賴外部 Schema 檔案。

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
| `exports` | 類型前綴與 name（例如 slots.work）→ `{kind, id}` |

應用層各集合完整輸出，不限於某個選取的周序列，也不刪除暫時未引用的巨集或行程。環境依賴則只收集這些輸出定義內實際使用的變數與任務。

環境計算式巨集同樣完整輸出至 expression_macros，環境變數引用改為 name，巨集引用保留 UUID，不輸出 scope／icon。預設行程進度變數及三個環境布林巨集的定義與 engine 更新契約見 [ENVIRONMENT_EXPRESSIONS.md](./ENVIRONMENT_EXPRESSIONS.md)。

所有具名輸出物件保留必填 name 與選填 display_name，不輸出 icon。display_name 不唯一，也不參與解析參照；留白時顯示 name。內部引用仍可使用 UUID。

## 變數與運算式

應用變數群組為 `{id, name, display_name, kind: "group", children: [...]}`。葉節點為 `{id, name, display_name, kind: "value", value_type, read_only, initial_value}`，數字葉節點可另含 min_value、max_value、integer_only。環境變數使用相同樹結構。陣列順序保留編輯器排序，不輸出 parent_id、order、scope。這是包含初始值的資料結構定義，不包含執行中狀態。

應用變數引用保持 `{type: "reference", reference_id: UUID}`。環境變數引用使用 `{type: "environment_reference", name: "..."}`，engine 應在載入時透過 name 解析到環境提供的實體。

每個環境變數依賴包含 `{name, display_name, value_type, read_only, access}`；`access` 為 `read`、`write` 或 `read_write`。完整環境變數空間另存於 `environment_variables`，包含群組和未引用葉節點。兩層變數樹的葉節點均明確輸出符合型別的 `initial_value`，詳見 [INITIAL_VALUES.md](./INITIAL_VALUES.md)。Runtime 自行決定是否採用環境層初始值。

Expression、Comparison、ALL／ANY 保留遞迴 AST。計算式巨集引用保持 UUID，不展開巨集、不求值。巨集參數引用保持所屬巨集內的參數 UUID。

## 任務與巨集

環境單一任務呼叫為 `{task_key: "...", arguments: [Operand, ...]}`。參數依該任務定義的參數陣列順序傳遞，空參數任務使用空陣列。環境依賴中附上 `{name, display_name, parameters: [{display_name, type}, ...]}`。參數名稱僅供除錯，位置與型別是 v1 契約；engine 應核對順序與型別。環境任務 UUID、參數 UUID 及實作不輸出。

任務巨集保留 `{display_name, name, parameters, mode, steps | branches}`。巨集參數保留 `{id, display_name, type}`，呼叫保持 `{task_macro_id: UUID, arguments: {參數UUID: Operand}}`。這些 UUID 是檔案內局部契約，不要求環境知道巨集參數 ID。

一般任務與巨集可宣告 `type: "variable_reference"`，另附 `value_type: "number" | "string" | "boolean" | "any"` 及 `access: "read" | "write" | "read_write"`。環境任務的參數契約也保留這兩個限制。

引用引數不是求值用 Operand。應用引用為 `{type: "variable_reference", reference_id: UUID}`；環境引用為 `{type: "variable_reference", name: "..."}`。engine 必須傳遞位置／控制代碼，不得先讀取變數內容。巨集內轉傳時保持 `{type: "parameter_reference", parameter_id: UUID}`，依該參數宣告解讀成引用。

引用參數不支援在算術或條件式中直接求值；需要取得值時仍使用既有的變數讀值運算式。傳遞給巨集的引用保持身分，數值參數才於進入巨集時求值。環境變數依賴會合併讀取與寫入用途，engine 應核對實際寫入權限。

序列巨集的 `steps` 直接為任務／巨集呼叫陣列，省略步驟 ID。分支巨集與時段行程保留 `{condition, task}`，ELSE 為最後一個 `condition: null`。巨集可呼叫任意模式巨集，禁止循環；各巨集的共通資格條件與分支 condition 分開處理。

設定變數模板呼叫為 `{task_key: "使用者設定的 name", target: VariableReference, value: Operand}`。Runtime 不輸出固定的 `builtin` 識別，engine 必須依 task_key 連接提供此介面的任務。`target` 可為應用 UUID 引用或環境 name 引用，傳遞寫入位置，不是先求值成變數內容；它取代編輯器的 `target_variable_id`。寫入權限與型別在匯出前檢查。

此契約也列在 environment_requirements.tasks，兩個參數種類固定為 variable_reference 與 expression，後者結果型別必須符合目標變數。範本的 name 為持久化契約，display_name 可自訂並用於顯示；兩者互不替代。

另外三個固定範本同樣以使用者設定的 task_key 連接 engine：「增加數值」輸出 `{task_key, target, value}`，value 為數字 expression，target 契約為 number/read_write；「切換布林」輸出 `{task_key, target}`，target 為 boolean/read_write；「重設初始值」輸出 `{task_key, target}`，target 為 any/write。重設基準是 runtime 實際採用的初始化值，不在呼叫內嵌入初始值。完整語意與原子更新契約見 [BUILTIN_VARIABLE_TASKS.md](./BUILTIN_VARIABLE_TASKS.md)。

## 行程

時段行程除了既有 branches，也可為 `{display_name, name, mode: "priority", candidates: [{task_macro_id, arguments}, ...]}`，兩者互斥。candidates 依序檢查所引用巨集的資格，選中第一個符合者，引數及資格不重複求值；空清單或全部不符合時沒有動作。詳見 [SLOT_PRIORITY.md](./SLOT_PRIORITY.md)。

[任務巨集](./TASK_MACROS.md) 的 sequence、branch、priority 均可附 `eligibility: Condition`，省略表示無限制。直接呼叫巨集時先求值引數及資格條件，再執行內容。優先候選的 candidates 可引用任一種巨集；第一個符合資格者直接執行內容，不重複求值資格與引數，不再檢查後續候選；全部不成立時沒有動作。允許巨集互相呼叫，但由來源編譯器拒絕循環。runtime 不再輸出 conditional 模式。

[中斷與放行](./SLOT_RELEASE.md)：事件容器輸出 `execution_mode`（overlay／interrupt_main／interrupt_lower）。日行程的 `slot_releases` 陣列元素為 null 或 `{task_key, flow_control: "release_slot", condition}`；condition 為 null 表示無條件放行。每個來源先執行時段開始任務，再判斷放行；成立時解除自身阻擋、略過自身主體與結束。下一時段重新建立阻擋；同優先權互不排除。舊 `schedule_takeover`、scope、target 及事件組 takeovers 已移除。

日行程保留 `{display_name, name, slot_ids: [UUID | null, ...]}`；UUID 引用 `slots`。

周行程的 `days` 固定包含 `mon` 至 `sun`。值為具名日行程 UUID、`null`，或直接嵌入的匿名日行程定義。匿名日行程不再輸出獨立 UUID、`scope` 或 `owner`，也不放入 `days` 或 `exports`。

周序列為 `{display_name, name, entries: [{week_id: UUID, day_overrides: {...}}, ...]}`。覆蓋直接附在該列，不輸出 `week_number` 或編輯器列 UID；星期欄位不存在表示沿用原周，`null` 表示清空，具名日行程 UUID 表示覆蓋。空周序列合法。

## 對外入口與檢查

exports 的 kind 為 operands、expressions、taskMacros、slots、days、weeks、sequences、enums 或 eventGroups。索引使用類型前綴加 name，例如 slots.work；對應值包含 kind、id，事件另附 sequence_id。operands 的 ID 對應 application_variables 中的節點。移動變數群組或修改 display_name 不影響 UUID 及 name；修改 name 時，重新匯出會同步更新契約與索引。

匯出前執行完整專案驗證，包含 name 的必填、格式與類型／作用域唯一性檢查；不合法時列出位置並拒絕匯出。完整規則見 [NAMING.md](./NAMING.md)。

Schema 驗證 JSON 結構。來源編譯器另檢查引用、型別、循環、ELSE 位置、巨集作用域、寫入權限及每日格數。engine 載入時仍須核對環境是否提供所需 name、型別、寫入能力及任務參數契約。

runtime 匯出不標示專案已儲存、不修改專案資料，也不能透過「匯入專案」載入。環境定義的獨立匯入／匯出見 [ENVIRONMENT.md](./ENVIRONMENT.md)。本格式不包含環境實作；專案已有環境識別資訊時，`environment_requirements.environment` 會附上其 `{id, display_name, version}`，沒有識別資訊的既有專案可省略此欄位。

[事件的多日行程來源與手動模擬選擇](./EVENT_DAY_SOURCES.md)

[流程控制：預約事件](./SCHEDULE_EVENT_TASK.md)
