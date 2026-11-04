# Blueprint 精簡指南

Blueprint 是用 YAML 宣告整個行程系統的格式，供人類與 agent 交換、閱讀及從零建立專案。匯入會**重建並取代目前工作區的整份專案內容**，重新產生 UUID 並重接引用，不會合併，也不會自動另存一份舊專案。修改前須另存需要保留的內容，匯入後另行儲存。匯出保留未引用物件與共用定義，不展開成重複副本。不含執行中的變數值、冷卻、預約佇列或 checkpoint。

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

### 層級與定義依賴

| 物件 | 層級與引用規則 |
| --- | --- |
| variables、expressions、enums | 可填 scope: environment／application；省略為 application，群組也適用 |
| tasks、builtins | 環境提供的任務介面，沒有上述 scope 欄位；tasks 的 enum 參數只能引用環境列舉 |
| task_macros、slots、days、weeks、sequences、events | 應用內容；task_macros 一律屬於應用層 |

應用計算式可引用環境及應用變數／計算式；環境計算式只能依賴環境定義。任務巨集的列舉參數可引用兩層列舉。這是**定義依賴**的限制，不禁止應用程式在呼叫環境任務時傳入應用變數引用或值。

`days.scope: shared／week_private` 表示共用／周私有日，是另一種分類，與 environment／application 無關。

### 省略欄位的意思

| 欄位／內容 | 省略的結果 |
| --- | --- |
| project.name／slots_per_day | Character Schedule／3 |
| variables.kind／type／read_only／integer | value／number／false／false |
| 變數 initial | number 為 0、string 為空字串、boolean 為 false；群組不可設定 |
| min／max | 沒有該側界限 |
| variables／enums 的 parent／order | 根節點／宣告位置；parent 必須指向同 scope 的群組 |
| 任務、巨集及計算式的 parameters | 沒有參數；有宣告的參數仍須依契約提供引數 |
| variable_reference 的 value_type／access；event_reference 的 event_kind | Blueprint 必須明填，沒有省略預設；GUI 新增參數時填入的初值不代表 YAML 可省略 |
| task_macros.mode／steps | sequence／空序列；branch、priority、random 省略對應陣列亦為空 |
| 巨集 eligibility | 無資格限制；null 也是無限制 |
| slots.mode／branches | branch／空行程 |
| days.slots／start／end／hooks／releases | 全部時段為 null／沒有日開始與日結束任務／沒有時段開始結束任務／沒有放行設定 |
| weeks.days 的某個星期 | 該日沒有主要日行程 |
| sequences.weeks／overrides／events | 空周序列／繼承周行程／沒有宣告事件 |
| start_weekday／end_weekday | mon／sun；無限重複不套結束日 |
| 事件及 schedule_event 的 execution／priority | overlay／0 |
| 週期／機率事件的 count | 所有日期；單次事件不使用 count |
| random 候選 weight／fallback | 運算式 "1"／空池時無動作 |
| 日行程隨機來源候選 weight | 原生數值 1 |
| increment_variable.random_amplitude | 運算式 "0"，不抽亂數 |

省略 task_macros.mode 一律套用 sequence 限制，不會從 branches／candidates 猜測模式；使用 branches 時必須明填 mode: branch。

以下沒有隱含內容，必須明填：計算式 type 與 value／branches／builtin 恰好一種；列舉葉節點的非空 options；事件 kind、start 與 day／source 恰好一種。periodic 另填 end、every；probability 另填 end、probability、cooldown_days。schedule_event 必填 date 與 day／source，weeks_weekday 日期還必填 weekday。

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

| 節點 | 合法欄位組合 |
| --- | --- |
| 變數 kind: group | 顯示資訊、scope、kind、parent、order；不得有 type、initial、min、max、integer、read_only |
| 變數 kind: value（預設） | 上述組織資訊及值屬性；min／max／integer 只適用 number，初始值須符合型別與限制 |
| 列舉 kind: group | 顯示資訊、scope、kind、parent、order；不得有 options |
| 列舉 kind: enum（預設） | 組織資訊及非空 options；各 value 為非空、去除前後空白且不重複的字串 |

兩種樹的 parent 都只能指向**同一集合、同 scope 的群組**，不能指向葉節點、自己或形成循環。群組沒有執行時的值；變數葉節點與列舉葉節點不能互相作為 parent。

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

| 運算式位置 | 可直接使用比較式、and／or、ALL／ANY？ |
| --- | --- |
| branches.when、巨集 eligibility、days.releases.when | 可以；null 表示無條件 |
| type: boolean 計算式的 value／分支回傳 value | 可以；回傳值仍須為 boolean，不可用 null 代替 |
| number／string 計算式回傳值、一般 scalar arguments | 不可以；布林引數改寫為 expr.ready 等布林計算式引用 |
| set_variable.value（即使目標是 boolean） | 不可以；改用布林常數、變數或布林計算式引用 |
| increment_variable 的 value／random_amplitude、候選 weight、schedule_event 的 offset、調整機率事件的 value | 不可以，且回傳值必須符合各欄位的數字限制 |

Schema 的 scalarExpression／conditionExpression 描述這兩種上下文，但不解析字串。不要把 `arguments: {enabled: "vars.stamina >= 10"}` 當成合法捷徑；應先定義 `ready: {type: boolean, value: "vars.stamina >= 10"}`，再傳 `enabled: "expr.ready"`。

自訂計算式巨集必填 type: number／string／boolean，使用 value 或 branches。例如 `branches: [{when: "vars.stamina >= 10", value: "20"}, {when: null, value: "0"}]`；依序取第一個成立結果，結果型別一致。**計算式 branches 不得為空，必須恰好有一個 when: null 的 ELSE，並放最後，確保有回傳值；缺少 ELSE 是配置錯誤。** ALL／ANY 依序短路；未選中結果不求值。除零、非有限值、型別／引用錯誤會停止執行，不當作 false。計算式每次引用重新求值，不快取、不寫變數。

計算式的 parameters 可為 number／string／boolean；呼叫 `expr.reward(10)` 依宣告順序傳入。Task／任務巨集以 `arguments: {amount: "10"}` 依參數名稱配對，但**求值順序仍依被呼叫者的 parameters 宣告順序**，不是呼叫端 arguments 的排列。例如宣告 first、second，即使 arguments 先寫 second，也先求值 first。引數在呼叫入口各求值一次，局部參數不繼承；需明確轉傳給內層。

任務／任務巨集參數另支援 variable_reference、event_reference、enum：

- 變數引用：type: variable_reference，**必填** value_type（number／string／boolean／any）、access（read／write／read_write），沒有省略預設。引數用 `{variable: stamina}` 或 `{parameter: target}`，傳位置而非目前值；寫入不得指向唯讀變數。
- 事件引用：type: event_reference，**必填** event_kind（any／probability），沒有省略預設。引數用 `{event: cold}`、`{current_event: true}` 或 `{parameter: target}`。
- 列舉：type: enum，**恰好選一種** `enum: 列舉名稱` 或非空 `options: [{value: morning, display_name: 早上}]`；一般列舉引數仍是文字運算式，例如 `'"morning"'`。

Reference 參數轉傳按宣告契約檢查：提供方 access 必須涵蓋接收方要求，因此 read_write 可傳給 read／write／read_write，read 或 write 只能傳給同權限，不可擴權。接收方 value_type: any 接受任一型別契約，否則須相同，不能把提供方 any 當成特定型別。事件 probability 可傳給 probability／any，提供方 any 不能傳給要求 probability 的參數；不因這次實際指向的值而放寬契約。

各 type 只能填對應的契約欄位：number／string／boolean 沒有其他型別專屬欄位；variable_reference 只加 value_type／access；event_reference 只加 event_kind；enum 只加 enum／options。所有類型皆可加 display_name／description／icon。不要在 number 參數填 access、event_kind 或 enum。

內建環境計算式 `expr.randomRange(min, max)` 為 `[min,max)`；兩端相等直接回傳且不抽樣，反向範圍為錯誤。`expr.randomItem("a", "b")` 至少一個同型別候選，先求值全部候選，再等機率選一個；即使只有一個候選，完成候選求值後仍額外消耗一次 RNG。未宣告的預設函數在被引用時可自動補入；明確宣告格式查 Schema 的 computed 內建簽名條件：randomRange 為 environment／number，恰有兩個 number 參數；randomItem 為 environment／any，恰有一個 type: any、variadic: true 參數。

內建計算式也依 **parameters mapping 的宣告順序** 傳值，不靠參數名稱識別位置。randomRange 的第一個參數是下界、第二個是上界；key 可改成 foo／bar，min／max 只是含義說明而非固定名稱。重新排序 mapping 會改變參數意義，處理工具不得自行排序。

any 的範圍是：計算式回傳 type: any 與計算式參數的 any／variadic 只供 builtin: randomItem 使用，自訂計算式不接受；variable_reference.value_type: any 則表示允許引用任一基本型別變數，與計算式 any 不同。randomItem 的呼叫型別由候選推導，候選必須同為 number、string 或 boolean，不是跳過型別檢查。例如 `expr.randomItem(1, 2) + 10` 可作數字子式；字串候選不能加入數字。

## 4. 動作與選擇規則

一般動作為 `{task: 任務名稱, arguments: {...}}` 或 `{macro: 巨集名稱, arguments: {...}}`。外部任務需宣告 tasks 介面並由 engine 實作；模擬器只記錄外部呼叫，不執行真正外部行為。空巨集／空時段行程合法。

宣告 tasks 介面不等於實作功能。未確認環境有對應 handler 時，優先用內建動作及任務巨集完成能表達的邏輯，例如增加經驗值使用 increment_variable；不要僅宣告 gain_experience 就當成已實作增值。匯入成功或模擬器記錄外部呼叫，都不能證明該 handler 存在。

| 任務巨集 mode | 內容與執行 |
| --- | --- |
| sequence（預設） | steps 動作陣列，依序完成；前一步修改立即對下一步可見 |
| branch | branches: [{when: 條件字串或 null, run: 動作}]；第一個成立者勝出；非空時必須恰好一個 ELSE，且放最後 |
| priority | candidates: [{macro: 名稱, arguments: {...}}]；只可選巨集，依序求值引數並檢查資格，第一個合格者勝出 |
| random | candidates 為任務／內建動作／巨集，另填 weight 運算式（預設 "1"）；可加 fallback 動作 |

各模式均可有 eligibility；引數求值後才檢查自身資格，不成立則略過。資格只在入口檢查一次，不持續監控。

任務巨集與時段行程的 branches 可為空（無動作）；**只要有分支，就必須有一個 when: null 的 ELSE 並放最後**。只有 IF／ELSE IF 而無 ELSE 會拒絕匯入，不是條件全不成立時的合法無動作模式。若需要條件不成立時無動作，可讓 ELSE 呼叫空巨集。Schema 檢查 ELSE 數量，最後位置仍由語意驗證確認。

- 分支選中後，即使呼叫的巨集不合格或為空，也不回頭執行 ELSE。
- 優先候選取第一個合格巨集；無資格限制者可作最後保底。合格空巨集仍勝出，全部不合格則無動作。
- 加權隨機對每個候選依序完成「引數 → 資格」，再處理下一候選；全部完成後，依候選順序求合格者的權重。兩候選時為 `A 引數 → A 資格 → B 引數 → B 資格 → 合格 A 的權重 → 合格 B 的權重 → 抽選 → 勝出者內容`。不合格者的引數仍已求值（含亂數），但不求其權重；資格內的短路仍適用。權重須有限非負，0 排除。正權重池抽選一次，沿用已求值的引數／資格；僅空池執行選填 fallback，後備巨集仍須符合資格。選中空巨集不觸發後備。
- 直接 builtin 候選的 value、random_amplitude、date.offset，以及參數化的 property／operation，也算候選輸入：抽選前依候選順序求值並凍結，未選中也已消耗其中的亂數；只有勝出後才執行副作用，increment_variable 的實際隨機偏移也到此時才抽樣。
- 求值錯誤會停止，不是略過、不重抽；沒有後備或後備不合格時，仍可能無動作。
- 時段行程 slots 支援 branches 或 mode: priority／candidates，沒有 random 模式；要加權隨機就呼叫相應任務巨集。

內建動作可直接使用，不必在 builtins 宣告；builtins 只自訂介面名稱與圖示。

`builtins` 是介面設定目錄，並非可呼叫動作清單。set_variable、increment_variable、toggle_variable、reset_variable、adjust_probability_event、schedule_event 可放在一般動作位置；**release_slot 只由 days.releases 設定**，不能出現在 steps、branches.run 或 candidates。`builtins.release_slot` 保留其名稱、圖示與條件參數的顯示設定，並不使它成為一般動作。

| builtin | 動作欄位 |
| --- | --- |
| set_variable | target: 變數名稱、value: 運算式 |
| increment_variable | target、value、選填 random_amplitude 運算式（預設 "0"） |
| toggle_variable／reset_variable | target |
| adjust_probability_event | event: 事件位置引數、property: probability_percent／cooldown_days、operation: set／increase、value: 運算式；property／operation 也可用 `{parameter: 名稱}` |
| schedule_event | date、day 或 source 二擇一，選填 display_name／icon／execution／priority |

四種變數內建任務的 target **只接受固定變數葉節點名稱**，不接受 `{parameter: target}` 或運算式。variable_reference 參數可轉傳給一般 Task／Macro，由 handler 使用 context.setVariable() 寫入；目前不能用它替換內建任務的 target。巨集可用固定 target 配合 `value: "params.amount"` 重用數值參數。random_amplitude 僅屬於 increment_variable，set_variable 不接受。

預約 date 為 `{mode: days, offset: "7"}` 或 `{mode: weeks_weekday, offset: "1", weekday: thu}`，日期必須晚於今天且在有效序列內。只預約單次，來源限固定／加權，候選到期才抽；不自動合併同名預約。沒有完整日上下文時不可執行。

schedule_event 的 execution／priority 省略時為 overlay／0。固定來源填 day；多候選填 source.mode: random，**不接受 sequential**，因此沒有預約依序索引的問題。到期後使用與宣告事件相同的排序、中斷及放行機制。

weeks_weekday 從**本周周一**加上 offset 周，再取 weekday，不是尋找下一個同名星期。今天星期三時，offset "0"＋thu 是本周四，offset "1"＋thu 是下周四；offset "0"＋mon 已在過去，會拒絕。days 的 offset 至少 1；weeks_weekday 的 offset 可為 0，但結果仍必須晚於今天。offset 是數字運算式，日期模式 days 不填 weekday。

offset 的求值結果必須是有限、安全整數（絕對值不超過 9007199254740991），**不截斷、不四捨五入**，且須符合上述最小值。可直接判定的非法常數（如 "2.5"）在匯入時拒絕；動態運算式求值後若為小數、負數或不安全整數，runtime 會拒絕該次預約（reservation.rejected，完成結果 accepted: false），不加入事件並繼續後續任務。結果日期不在有效序列內或不是未來日期，也同樣拒絕預約；若求值本身除零、型別錯誤或產生非有限值，則停止執行，與單純預約被拒絕不同。

預約拒絕是最小任務**正常完成的結果，不是任務失敗**：成功保存 checkpoint 後發出 task.completed，後續步驟繼續，不重查巨集資格、不重選候選或改走 ELSE／fallback；巨集可正常完成。恢復已提交的 checkpoint 不重跑該次預約。保存失敗仍依一般提交失敗規則處理。

預約存於 Runtime 狀態，但綁定建立它的 sequence 與實際 position；切到另一序列不取消、不移轉，也不推進原序列日期。完成目前一天後才可切換，切回用 runDay 指定原序列，會接續它的下一天；nextDay 跟隨目前選定序列。到期只精確匹配所屬序列／position，不補跑過去預約；正常 API 禁止已啟動序列跳日，因此切換不會自行錯過原序列的到期日。Checkpoint 保留預約與各序列進度；Blueprint／專案存檔不攜帶執行中的預約。

### 變數修改與重設

每次成功寫入都先檢查權限／型別／有限數字，再依 integer 朝零截斷，最後夾在選填 min／max 之間；初始值必須已合法，不靠截斷修正。算式中間值不截斷。例如 max=10，從 8 先加 5 再減 5，得到 5。

integer: true 時，initial 與已提供的 min／max **全部必須是整數**，小數邊界直接拒絕，不另做取整；因此最後夾限不會把整數變回小數。min／max 仍為選填，且 min 不得大於 max。

增加數值為 `目前值 + value + 隨機偏移` 再套寫入限制。幅度須非負；0 無隨機成分。一般數值偏移為 `[-幅度,幅度)`；整數目標以 floor(幅度) 為界，抽包含兩端的整數。

reset_variable 重設指定變數至 runtime 的初始化基準（預設專案 initial），不是最近輸入值。**換日、換周與重複周都不自動清空業務累計**；薪資結算後要明確重設出勤班數。

## 5. 日、周與重複

日行程 slots 是時段行程名稱或 null 的陣列，長度等於 slots_per_day；省略時全空。start／end 是日開始／日結束的時段行程名稱。hooks 是同長度的 `{start: 名稱或null, end: 名稱或null}` 陣列；releases 是同長度的放行設定陣列。

tags 是可參與事件計數的自由標籤；purposes 為 main／overlay／interrupt 的手動用途分類，**不決定事件的實際中斷行為**。scope: week_private **必填** owner: {week: 名稱, weekday: tue}，只能由指定周／星期引用，不能作為共用事件候選或 Override；scope: shared（省略預設）不得填 owner。owner 對應的實際引用位置由語意驗證檢查。

周序列 weeks 可為 `[normal]` 或 `[{week: normal, repeat: 3}]`，repeat 是總次數；null 表示無限，只能放最後。overrides 用 `[{week: 1, weekday: mon, day: 名稱或null}]`，week 為一基模板周位置；沒有記錄是繼承，day: null 是清空。

同一序列的 overrides 必須以 (week, weekday) 唯一；即使兩筆 day 相同也拒絕，不採第一筆／最後一筆覆蓋。這是跨項目語意驗證，Schema 通過仍不表示位置唯一。

無限列最多一個，且必須最後；Schema 可檢查數量，**最後位置由匯入語意驗證檢查**，不能只因 Schema 通過就把其他周放在它之後。

start_weekday／end_weekday 預設 mon／sun，只裁切第一輪／最後一輪；無限重複不套結束日。Day 1 跟隨開始日，周界仍是星期一；周四開始後下一個周一屬實際第 2 周。重複不複製定義，Override 每輪生效。

Blueprint 可包含多個 sequences；執行入口由 UI／模擬器選擇，或由宿主呼叫 runtime.runDay({sequence: 名稱}) 指定。格式沒有預設啟動序列，不會自動合併或依序接著跑。各序列可共用定義；同一 Runtime 切換序列會保留變數與其他執行狀態，因此不代表完全隔離。需要獨立初始狀態時建立不同 Runtime。

同一 Runtime 只有一份共用 RNG，不按 Sequence 隔離；交錯執行其他序列會消耗它，可能改變回到原序列後的隨機結果。Checkpoint 恢復這份 RNG 的保存位置，不從種子重新開始；只有新建 Runtime 才重新初始化。

事件名稱全專案唯一只用來辨識定義，**不是跨序列存取權**。event_reference（含經參數轉傳）、event(...)、adjust_probability_event 都只能在目前執行序列的日上下文存取該序列事件；後兩者另限機率事件。在 holiday 引用 life 宣告的 cold 會於 runtime 失敗，不讀寫它的狀態。匯入目前檢查事件是否存在及種類，不保證每個共用巨集的使用位置都有正確上下文；切換序列保留舊狀態也不會放寬此限制。單一時段執行沒有日上下文，@current 則另需目前來源是事件。

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

kind: all 不得帶 day／tag；kind: day 必填 day 且不得帶 tag；kind: tag 必填非空 tag 且不得帶 day。

週期在第 1、1+N、1+2N 個符合日期發生；若要第 7 天首次付房租，start 就設那一天。單周無限重複且範圍只設周日～周日時，every: 1 是每周日；every: 7 是每七個周日。

start／end 含兩端，在重複周中是模板範圍篩選，計數持續跨輪累計。機率事件於符合日期先檢查剩餘冷卻：大於 0 就減一並不抽樣，否則判定機率。發生後 cooldown_days: 7 會跳過接下來七個符合日期，第八個才再抽；不符合日期不減冷卻。

一般執行在符合日期且未冷卻時，機率 **0%／100% 都仍抽一次 RNG**。發生後，source.mode: random 即使只有一個候選也再抽一次；固定／依序來源不抽，未發生不選來源。日期不符或冷卻跳過時不做該次機率／來源抽樣；人工發生／來源決策覆寫會跳過被覆寫的抽樣，與一般執行的 RNG 消耗不同。

事件 start／end 的 week 必須在 `1..weeks 陣列長度` 內（模板周數，不是 repeat 展開後的總周數），星期必須合法，end 不得早於 start；越界／倒置會拒絕匯入，無限重複也不放寬模板周數。起訖落在 start_weekday／end_weekday 裁切區仍可匯入，但被裁切的日期不執行、不補跑，完全沒有可達日期的範圍不會發生事件。若該模板位置在後續重複輪可達，單次事件仍可於首次實際到達時發生。

event(...) 只能讀 probability_percent／cooldown_days／cooldown_remaining。調整任務只寫前兩者，修改冷卻設定不回寫剩餘冷卻。每日執行前已選定今日事件與來源，當天任務修改設定不回溯改今天的計畫。

adjust_probability_event 先按 set／increase 得到要求值，再套屬性限制：probability_percent 接受有限小數並夾在 0～100；cooldown_days 的要求值必須是安全整數，不截斷小數，再將負值夾為 0。例：機率 10 增加 200 得 100，冷卻 3 增加 -10 得 0。非有限值或冷卻要求值為小數／不安全整數時失敗，不提交修改；這不是一般變數的 integer 截斷規則。只改 cooldown_days 設定，不改目前 cooldown_remaining。

### 日期符合、發生與實際執行

`日期／計數依據符合 → 檢查週期間隔或冷卻與機率 → 發生成立 → 選定一個日行程來源 → 各階段按優先權執行或略過`

- **Eligible（符合日期）**：符合起訖及 count，不代表今天一定發生；機率事件可能還在冷卻。
- **Occurred（發生）**：判定成立，機率事件設定冷卻，日行程來源選定，依序來源索引前進。這些不因後續時段被阻擋而撤回；同一天同一事件不因有多個階段而重複發生。
- **Executed（實際執行）**：以階段／任務判斷，可能只有部分執行。時段被更高優先事件阻擋，不會撤銷已完成的任務；日開始／日結束不受時段阻擋影響。

例如感冒事件已發生，但全天時段被更高優先事件阻擋，仍算已發生一次，冷卻照常開始，依序來源照常前進；其日開始／日結束任務仍依排序執行。

## 7. 優先權、中斷與放行

事件 execution 預設 overlay，priority 預設 0。每個階段均依「非負事件由高至低 → 主要日行程 → 負事件由高至低」執行。同優先權時，先按宣告順序執行宣告事件，再按**預約佇列插入順序（成功提交的建立先後）**執行到期預約，不依名稱、ID 或時間戳排序；Checkpoint 恢復保留此順序。例如先預約設 money=100，再預約增加 20，該階段會依序得到 100、120。

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

Schema、指南、匯入器與 runtime 應表達同一套契約：Schema 負責欄位與可表示的組合限制，parser 負責字串語法，語意驗證負責引用／型別／跨層與循環，模擬檢查預期效果。**若 Schema 通過但指南明確禁止，不得據此輸出該寫法。若來源互相衝突或行為未定義，回報規格缺口，不自行猜測預設。** 使用 MCP 時先做匯入 preview，再依目前 revision 正式取代；離線只有 Schema 可用時，不能宣稱已完成全部語意及執行驗證。

## 9. 圖示（選填）

icon 可填 `tabler:briefcase`、`tabler:briefcase|blue`、`tabler:briefcase|#60A5FA`，或純色 `blue`／`#60A5FA`。分隔符固定為 `|`，`tabler:` 是前景名稱的一部分；六位色碼建議加引號。

離線 icons.json 的 foregrounds 提供精確 id、分類與中英標籤，backgrounds 提供八種背景色。具名定義、任務／巨集參數與列舉選項均可用 icon；內建任務參數圖示另用 builtins 的 parameter_icons／parameter_option_icons，完整欄位查 Schema。

省略時採預設圖示。未知字串保留並顯示警告／回退，不阻擋匯入、不影響引用；runtime 不輸出 icon。

## 10. 進階小型範例

以下是可獨立匯入的合法 Blueprint 範例；原始專案測試會逐段驗證及匯出／再匯入。第一個進階範例只示範物件定義，沒有 days／weeks／sequences，不會自行形成可執行的日程；有周序列的範例仍須選定序列才會執行。範例只聚焦一組契約，不必把它們全加進每個專案。

### 加權候選、變數引用與布林引數

reward 是外部任務介面；真正增值由 engine handler 實作，模擬器只記錄。傳 target 的位置，不能傳 vars.score 的目前值；enabled 則引用布林計算式。任務候選 weight 是運算式字串。這也示範應用變數可作為環境任務的呼叫引數。

```yaml
variables:
  score: {initial: 0}
expressions:
  ready: {type: boolean, value: "vars.score >= 0"}
tasks:
  reward:
    parameters:
      target: {type: variable_reference, value_type: number, access: read_write}
      amount: {type: number}
      enabled: {type: boolean}
task_macros:
  nothing: {}
  lottery:
    mode: random
    candidates:
      - task: reward
        arguments: {target: {variable: score}, amount: "5", enabled: "expr.ready"}
        weight: "3"
      - {macro: nothing, weight: "1"}
    fallback: {macro: nothing}
slots:
  draw: {branches: [{when: null, run: {macro: lottery}}]}
```

### 事件參數、預約與中斷放行

第一天的主要日開始會把 cold 的未來機率調成 0，並預約本周四的加權疊加事件。當天的 cold 已經選定，不會被這次修改撤回。repair 事件使用 interrupt_lower；broken 為 false 時放行本時段，讓主要行程繼續。日行程來源 weight 是原生正數，與上例不同。

```yaml
project: {slots_per_day: 1}
variables:
  broken: {type: boolean, initial: false}
task_macros:
  prepare:
    parameters:
      target: {type: event_reference, event_kind: probability}
    steps:
      - builtin: adjust_probability_event
        event: {parameter: target}
        property: probability_percent
        operation: set
        value: "0"
      - builtin: schedule_event
        date: {mode: weeks_weekday, offset: "0", weekday: thu}
        source:
          mode: random
          candidates: [{day: visit, weight: 3}, {day: other_visit, weight: 1}]
        execution: overlay
        priority: 0
slots:
  prepare: {branches: [{when: null, run: {macro: prepare, arguments: {target: {event: cold}}}}]}
  normal: {}
  repair: {}
days:
  normal: {start: prepare, slots: [normal]}
  repair: {slots: [repair], releases: [{when: "vars.broken == false"}]}
  visit: {}
  other_visit: {}
weeks:
  w: {days: {mon: normal}}
sequences:
  life:
    weeks: [w]
    events:
      cold:
        kind: probability
        start: {week: 1, weekday: mon}
        end: {week: 1, weekday: sun}
        probability: 100
        cooldown_days: 7
        day: repair
        execution: interrupt_lower
        priority: 2
```

### 周私有日與序列 Override

private_tuesday 只能由擁有它的 w／tue 使用，不能拿來當共用事件來源或 Override。序列則把第一個模板周的星期一改用共用日 special，不修改 w 本身。

```yaml
project: {slots_per_day: 1}
days:
  normal: {}
  special: {}
  private_tuesday:
    scope: week_private
    owner: {week: w, weekday: tue}
weeks:
  w: {days: {mon: normal, tue: private_tuesday}}
sequences:
  life:
    weeks: [w]
    overrides: [{week: 1, weekday: mon, day: special}]
```
