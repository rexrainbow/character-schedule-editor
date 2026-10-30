# Blueprint 精簡指南

Blueprint 是用 YAML 宣告整個行程系統的格式，供人類與 agent 交換、閱讀及從零建立專案。匯入會產生新 UUID 並重接引用，**整份取代而非合併**；匯出保留未引用物件與共用定義，不展開成重複副本。不含執行中的變數值、冷卻、預約佇列或 checkpoint。

主要閱讀本指南與 [完整範例](example.yaml) 即可開始；完整欄位按需查 [Schema](blueprint.schema.json)，圖示按需查 [icons.json](icons.json)。本指南摘要現行語法與執行契約，不需要先閱讀其他技術文件。

## 1. 由上至下的構件

**周序列 → 周行程 → 日行程 → 時段行程 → 任務巨集／任務 → 變數與計算式。**

| YAML 項目 | 用途與主要欄位 |
| --- | --- |
| project | 專案顯示名稱 name、slots_per_day（預設 3） |
| environment | 選填環境資訊 name、version、icon |
| sequences | 有序 weeks、開始／結束星期、overrides、事件 events |
| weeks | days：mon／tue／wed／thu／fri／sat／sun → 日行程名稱或 null |
| days | slots、日開始 start／結束 end、各時段 hooks／releases、tags／purposes |
| slots | branches，或 mode: priority 與 candidates；省略邏輯表示空活動 |
| task_macros | parameters、eligibility、mode 及 steps／branches／candidates／fallback |
| tasks | 環境提供的任務介面與 parameters，實際行為由 engine handler 提供 |
| variables | 變數／群組：scope、kind、parent、order、type、initial、min／max、integer、read_only |
| expressions | 計算式巨集：scope、type、parameters，及 value／branches／builtin 三擇一 |
| enums | 列舉／群組：scope、kind、parent、order、options |
| builtins | 內建任務的名稱、圖示及固定參數顯示設定，不改動操作種類或型別 |

集合使用 `名稱: 定義` mapping；省略的集合為空，不自動加入行程進度變數。scope 預設 application，環境定義明填 environment；tasks 本身就是環境介面。使用者定義可引用環境定義，環境定義不得依賴使用者層內容。

### 名稱與說明

- mapping key 是 name，符合 `^[A-Za-z_][A-Za-z0-9_]*$`，區分大小寫。引用必須使用它，不使用 display_name 或 UUID。
- 同類型名稱唯一，變數群組與葉節點共用命名空間；同類型跨環境／應用層也不能重名。不同類型可同名。
- 一般與內建任務共用任務命名空間；參數只在各自任務／巨集內唯一；事件名稱在整個專案唯一，但宣告於所屬序列。
- 具名定義可填 display_name、description、icon；display_name 留白通常顯示 name，內建預設名稱跟隨介面語系。分支、步驟及候選也可填 description。
- 用 description 保存設計意圖；YAML `#` 註解在匯入／再匯出後不保留。排版與運算式括號可能標準化。

## 2. 最小完整範例

以下可直接匯入：工作先扣體力並加錢，體力不足改休息；同一周無限重複。

```yaml
project: { name: 工作與休息, slots_per_day: 3 }
variables:
  stamina: { display_name: 體力, initial: 60, min: 0, max: 100 }
  money: { display_name: 金錢, initial: 0, min: 0 }
task_macros:
  work:
    eligibility: vars.stamina >= 10
    steps:
      - { builtin: increment_variable, target: stamina, value: "-10" }
      - { builtin: increment_variable, target: money, value: "10" }
  rest:
    steps:
      - { builtin: increment_variable, target: stamina, value: "15" }
slots:
  activity:
    mode: priority
    candidates:
      - { macro: work }
      - { macro: rest }
days:
  normal: { slots: [activity, activity, activity], tags: [workday], purposes: [main] }
weeks:
  normal:
    days: { mon: normal, tue: normal, wed: normal, thu: normal, fri: normal, sat: normal, sun: normal }
sequences:
  life:
    weeks: [{ week: normal, repeat: null }]
```

## 3. 變數、計算式與參數

變數 type 為 number（預設）、string 或 boolean；initial 是原生 YAML 常數，省略時分別為 0、空字串、false。kind: group 只分組，不可求值或指定初值／上下限；parent 指向群組名稱，不改變葉節點的引用名稱：即使 stamina 在群組內，仍用 vars.stamina。

**運算式欄位一律是字串**，數字／布林常數也要寫成 `"10"`／`"true"`。initial、事件機率與日行程來源權重則是原生數值，不是運算式。字串常數寫成 `value: '"hello"'`。

| 文字語法 | 用途 |
| --- | --- |
| vars.stamina | 讀取變數葉節點 |
| expr.reward、expr.reward(10) | 計算式巨集及帶參數呼叫 |
| params.amount | 目前巨集自己的局部參數 |
| +、-、*、/、括號 | 數字四則運算；乘除先於加減 |
| ==、!=、<、<=、>、>= | 同型別比較；只有數字支援大小比較 |
| and／or、&&／\|\|、ALL(a, b)、ANY(a, b) | 邏輯條件，and 優先於 or；群組可巢狀 |
| event("cold", "probability_percent") | 指定事件的數值屬性 |
| event("@current", "cooldown_remaining") | 目前事件屬性，需事件上下文 |
| event("@param:target", "cooldown_days") | 巨集事件參數指向的事件屬性 |

沒有 JavaScript eval、任意函數、陣列索引或隱式轉型。一般 scalar 引數不直接接受比較／ALL／ANY；需要布林值時，先定義 type: boolean 計算式，再用 expr.name 引用。when、eligibility 及布林計算式定義可直接使用條件。

計算式巨集必填 type，使用 value 或 branches。例如 `branches: [{when: "vars.stamina >= 10", value: "20"}, {when: null, value: "0"}]`；依序取第一個成立結果，最後唯一 ELSE，結果型別一致。ALL／ANY 依序短路；未選中結果不求值。除零、非有限值、型別／引用錯誤會停止執行，不當作 false。計算式每次引用重新求值，不快取、不寫變數。

計算式的 parameters 可為 number／string／boolean；呼叫 `expr.reward(10)` 依宣告順序傳入。任務巨集以 `arguments: {amount: "10"}` 依參數名稱傳入。引數在呼叫入口各求值一次，局部參數不繼承；需明確轉傳給內層。

任務／任務巨集參數另支援 variable_reference、event_reference、enum：

- 變數引用：type: variable_reference，另填 value_type（number／string／boolean／any）、access（read／write／read_write）。引數用 `{variable: stamina}` 或 `{parameter: target}`，傳位置而非目前值；寫入不得指向唯讀變數。
- 事件引用：type: event_reference，另填 event_kind（any／probability）。引數用 `{event: cold}`、`{current_event: true}` 或 `{parameter: target}`。
- 列舉：type: enum，使用 `enum: 列舉名稱` 或 `options: [{value: morning, display_name: 早上}]`；一般列舉引數仍是文字運算式，例如 `'"morning"'`。

內建環境計算式 `expr.randomRange(min, max)` 為 `[min,max)`；兩端相等直接回傳且不抽樣，反向範圍為錯誤。`expr.randomItem("a", "b")` 至少一個同型別候選，先求值全部候選，再等機率選一個。未宣告的預設函數在被引用時可自動補入；明確宣告格式查 Schema 的 computed／expressionParameter。一般自訂巨集不宣告 any／variadic。

## 4. 動作與選擇規則

一般動作為 `{task: 任務名稱, arguments: {...}}` 或 `{macro: 巨集名稱, arguments: {...}}`。外部任務需宣告 tasks 介面並由 engine 實作；模擬器只記錄外部呼叫，不執行真正外部行為。空巨集／空時段行程合法。

| 任務巨集 mode | 內容與執行 |
| --- | --- |
| sequence（預設） | steps 動作陣列，依序完成；前一步修改立即對下一步可見 |
| branch | branches: [{when: 條件字串或 null, run: 動作}]；第一個成立者勝出，非空時唯一 ELSE 必須最後 |
| priority | candidates: [{macro: 名稱, arguments: {...}}]；只可選巨集，依序求值引數並檢查資格，第一個合格者勝出 |
| random | candidates 為任務／內建動作／巨集，另填 weight 運算式（預設 "1"）；可加 fallback 動作 |

各模式均可有 eligibility；引數求值後才檢查自身資格，不成立則略過。資格只在入口檢查一次，不持續監控。

- 分支選中後，即使呼叫的巨集不合格或為空，也不回頭執行 ELSE。
- 優先候選取第一個合格巨集；無資格限制者可作最後保底。合格空巨集仍勝出，全部不合格則無動作。
- 加權隨機先依序求值**全部候選引數與資格**，再求符合者的權重；權重須有限非負，0 排除。正權重池抽選一次，沿用已求值的引數／資格；僅空池執行選填 fallback，後備巨集仍須符合資格。選中空巨集不觸發後備。
- 求值錯誤會停止，不是略過、不重抽；沒有後備或後備不合格時，仍可能無動作。
- 時段行程 slots 支援 branches 或 mode: priority／candidates，沒有 random 模式；要加權隨機就呼叫相應任務巨集。

內建動作可直接使用，不必在 builtins 宣告；builtins 只自訂介面名稱與圖示。

| builtin | 動作欄位 |
| --- | --- |
| set_variable | target: 變數名稱、value: 運算式 |
| increment_variable | target、value、選填 random_amplitude 運算式（預設 "0"） |
| toggle_variable／reset_variable | target |
| adjust_probability_event | event: 事件位置引數、property: probability_percent／cooldown_days、operation: set／increase、value: 運算式；property／operation 也可用 `{parameter: 名稱}` |
| schedule_event | date、day 或 source 二擇一，選填 display_name／icon／execution／priority |

預約 date 為 `{mode: days, offset: "7"}` 或 `{mode: weeks_weekday, offset: "1", weekday: thu}`，日期必須晚於今天且在有效序列內。只預約單次，來源限固定／加權，候選到期才抽；不自動合併同名預約。沒有完整日上下文時不可執行。

### 變數修改與重設

每次成功寫入都先檢查權限／型別／有限數字，再依 integer 朝零截斷，最後夾在選填 min／max 之間；初始值必須已合法，不靠截斷修正。算式中間值不截斷。例如 max=10，從 8 先加 5 再減 5，得到 5。

增加數值為 `目前值 + value + 隨機偏移` 再套寫入限制。幅度須非負；0 無隨機成分。一般數值偏移為 `[-幅度,幅度)`；整數目標以 floor(幅度) 為界，抽包含兩端的整數。

reset_variable 重設指定變數至 runtime 的初始化基準（預設專案 initial），不是最近輸入值。**換日、換周與重複周都不自動清空業務累計**；薪資結算後要明確重設出勤班數。

## 5. 日、周與重複

日行程 slots 是時段行程名稱或 null 的陣列，長度等於 slots_per_day；省略時全空。start／end 是日開始／日結束的時段行程名稱。hooks 是同長度的 `{start: 名稱或null, end: 名稱或null}` 陣列；releases 是同長度的放行設定陣列。

tags 是可參與事件計數的自由標籤；purposes 為 main／overlay／interrupt 的手動用途分類，**不決定事件的實際中斷行為**。周私有日可用 scope: week_private、owner: {week: 名稱, weekday: tue}，不能作為共用事件候選。

周序列 weeks 可為 `[normal]` 或 `[{week: normal, repeat: 3}]`，repeat 是總次數；null 表示無限，只能放最後。overrides 用 `[{week: 1, weekday: mon, day: 名稱或null}]`，week 為一基模板周位置；沒有記錄是繼承，day: null 是清空。

start_weekday／end_weekday 預設 mon／sun，只裁切第一輪／最後一輪；無限重複不套結束日。Day 1 跟隨開始日，周界仍是星期一；周四開始後下一個周一屬實際第 2 周。重複不複製定義，Override 每輪生效。

## 6. 事件與週期

事件宣告於 sequences.名稱.events；必填 kind、start，並以 day 或 source 指定共用日行程：

| 來源 | 寫法 |
| --- | --- |
| 固定 | day: cold_day |
| 加權 | source: {mode: random, candidates: [{day: success, weight: 3}, {day: failure, weight: 1}]} |
| 依序 | source: {mode: sequential, candidates: [{day: success}, {day: failure}]} |

日行程來源權重是原生正數、預設 1，與任務巨集的 weight 運算式不同；不必加總為 100。來源每次事件發生才選一次，整天不變。未發生不推進依序索引；發生後被中斷仍算一次選取。不同容器選同一日行程不去重。

| kind | 其他日期欄位 |
| --- | --- |
| once | start: {week: 1, weekday: mon}，在指定模板位置首次有效到達時一次；重複周不令它每輪重來 |
| periodic | start、end、every（至少 1）、選填 count |
| probability | start、end、probability（0–100）、cooldown_days（非負整數）、選填 count |

count 為 `{kind: all}`（預設）、`{kind: day, day: 名稱}` 或 `{kind: tag, tag: workday}`。以套用 Override 後的**主要日行程**判定，事件日行程／中斷／放行不改計數資格。空主要日只符合 all。

週期在第 1、1+N、1+2N 個符合日期發生；若要第 7 天首次付房租，start 就設那一天。單周無限重複且範圍只設周日～周日時，every: 1 是每周日；every: 7 是每七個周日。

start／end 含兩端，在重複周中是模板範圍篩選，計數持續跨輪累計。機率事件於符合日期先檢查剩餘冷卻：大於 0 就減一並不抽樣，否則判定機率。發生後 cooldown_days: 7 會跳過接下來七個符合日期，第八個才再抽；不符合日期不減冷卻。

event(...) 只能讀 probability_percent／cooldown_days／cooldown_remaining。調整任務只寫前兩者，修改冷卻設定不回寫剩餘冷卻。每日執行前已選定今日事件與來源，當天任務修改設定不回溯改今天的計畫。

## 7. 優先權、中斷與放行

事件 execution 預設 overlay，priority 預設 0。每個階段均依「非負事件由高至低 → 主要日行程 → 負事件由高至低」執行；同優先權依宣告順序，到期預約接在宣告事件之後。

階段順序是 `日開始 → 時段1開始 → 時段1主體 → 時段1結束 → 時段2開始 → … → 日結束`。每個階段先走遍全部來源，並非執行完一個來源整天再換下一個。

| execution | 阻擋對象 |
| --- | --- |
| overlay | 不阻擋其他來源；例如扣房租、薪資結算、日終心情消耗 |
| interrupt_main | 阻擋主要日行程；例如感冒、設備檢修 |
| interrupt_lower | 阻擋主要日行程與嚴格較低優先權事件；同優先權互不阻擋 |

兩種中斷事件的優先權不得為負。空白時段仍會中斷，不代表「照舊」。

日行程 releases 的元素：null 是沒加入；`{when: null}` 或 `{}` 是無條件放行；`{when: "vars.broken == false"}` 是條件放行。只能放在這個專用位置，不是一般 builtin 動作。

時段開始先檢查是否已被阻擋；未被阻擋才執行自己的開始任務，再判斷放行。中斷事件放行成立時，保留已完成的開始任務效果，跳過自己的主體／結束，並不建立自己的阻擋，讓其他來源依規則執行。放行不解除別人的阻擋；overlay 與主要日的 release 不生效。

**每個新時段清空阻擋與放行狀態**；下一時段重新判斷。日開始／日結束不受時段阻擋影響。

## 8. 驗證與執行邊界

1. YAML 解析後以 Schema 檢查結構，再交由編輯器／專案服務檢查運算式、名稱、引用、型別、權限及循環。Schema 通過不代表可執行；不能靠忽略錯誤修成不同需求。
2. 最小任務是提交邊界。前一步成功修改會保留；後一步失敗不回滾整天。恢復 checkpoint 從未完成的最小任務開頭重試，沿用已準備的引數與抽選，不重播已完成階段。
3. 隨機函數、機率事件、來源抽選與隨機增量共用 seeded RNG；相同定義、種子與操作順序可重現。改變抽樣順序會影響後續結果，預覽不抽樣。
4. 單日模擬可人工指定機率事件發生與候選，無法代表歷史冷卻；連續模擬才跨日保存變數、冷卻、候選進度與預約。新 runtime 從初始狀態開始，不是恢復舊實例。
5. YAML 大小限 4 MB，拒絕重複 key、自訂 tag 及 alias 展開；運算式限 16,000 字元、4,000 tokens、64 層。

## 9. 圖示（選填）

icon 可填 `tabler:briefcase`、`tabler:briefcase|blue`、`tabler:briefcase|#60A5FA`，或純色 `blue`／`#60A5FA`。分隔符固定為 `|`，`tabler:` 是前景名稱的一部分；六位色碼建議加引號。

離線 icons.json 的 foregrounds 提供精確 id、分類與中英標籤，backgrounds 提供八種背景色。具名定義、任務／巨集參數與列舉選項均可用 icon；內建任務參數圖示另用 builtins 的 parameter_icons／parameter_option_icons，完整欄位查 Schema。

省略時採預設圖示。未知字串保留並顯示警告／回退，不阻擋匯入、不影響引用；runtime 不輸出 icon。
