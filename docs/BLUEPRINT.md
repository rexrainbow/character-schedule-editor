# YAML 藍圖輸入與輸出

藍圖替代人類操作 GUI 建立專案的步驟，保留執行定義與共用引用，匯入時產生全新 UUID、使用預設圖示。不包含 UUID、icon、schema_version、畫面展開狀態或執行中的變數／冷卻／預約佇列。這是宣告式重建，不是專案存檔或完整展開的 Markdown 報告。

第一版只支援整份替換，不合併、不同步刪除、不處理舊格式相容性。環境任務可重建介面，但 engine 的實作仍需外部提供。

## 格式、Schema 與範例

使用者編輯模式的右上角「匯出」選單提供「執行資料（JSON）」、「藍圖（YAML）」、「行程報告（Markdown）」與「專案存檔（JSON）」。報告涵蓋全部周序列，可選擇是否包含未引用內容。藍圖下載為 `character-schedule-blueprint.yaml`，可透過啟動畫面或專案選單的匯入功能重建專案。匯出藍圖或報告不會清除專案尚未儲存的狀態；完整專案存檔在左側專案選單也有入口。

- [blueprint.schema.json](../src/schemas/blueprint.schema.json)：YAML 轉成 JSON 後的欄位契約；`npm run schema:blueprint` 重新產生。
- [生活與薪資 YAML](./recipes/examples/life-simulation.yaml)：可直接匯入的完整測試案例。
- [SYSTEM_SEMANTICS.md](./SYSTEM_SEMANTICS.md)：執行語意與限制。

Schema 來源為 `src/core/blueprint/schema.js`，不直接引用或改造專案存檔 Schema。欄位結構驗證之後還需要 expression parser、符號解析及核心型別／引用／循環／權限驗證。

## 大項目

每個集合是「name → 定義」的 mapping。name 是必填的持久化符號，限 `[A-Za-z_][A-Za-z0-9_]*`，亦作為 engine 契約。不同集合可同名，同類型跨層不可重名。事件名稱在全部周序列內唯一；參數名稱只在各任務／巨集內唯一。GUI 與 API 規則見 [NAMING.md](./NAMING.md)。

| 項目 | 意義與主要欄位 |
| --- | --- |
| project | name、slots_per_day（預設 3） |
| environment | 選填 name、version；身分 UUID 重新產生，不檢查版本相容 |
| variables | 變數與群組：display_name、scope、kind、parent、order、type、initial、min、max、integer、read_only |
| expressions | 計算式巨集：display_name、scope、type、value 或 branches |
| tasks | 環境任務介面：display_name、parameters |
| task_macros | display_name、parameters、eligibility、mode，以及 steps／branches／candidates |
| slots | display_name、branches；或 mode: priority 與 candidates；省略邏輯是空活動 |
| days | display_name、slots、start、end、hooks、releases、tags、purposes；可保留周私有日的 scope／owner |
| weeks | display_name、days（mon 至 sun，省略星期為空） |
| sequences | display_name、weeks、overrides、start_weekday、end_weekday、events |
| enums | display_name、scope、kind、parent、order、options |
| builtins | 固定種類為 key，選填 name（預設種類名稱）、display_name、parameter_names（參數顯示文字）、parameter_symbols（參數 name）；不改型別／數量 |

集合省略代表空集合，不加入預設行程進度範本。各定義 display_name 留白時顯示 mapping key，且仍保存為空白。scope 預設 application，環境定義需明確標 environment；tasks 本身就是環境介面。變數 kind 預設 value、type 預設 number、read_only 預設 false；初始值依型別預設 0／空字串／false。群組使用 kind: group，不可指定數值屬性。列舉 kind 預設 enum。

engine_key 已移除。mapping key 直接保存為 name，匯出不再依顯示名稱產生符號。圖示不在藍圖內，匯入時使用編輯器預設；手動用途只是分類，tags 保留事件計數語意。

## 文字運算式

```yaml
expressions:
  weekly_pay:
    display_name: 本期薪資
    type: number
    value: "(vars.worked_shifts * 10) + 20"
```

| 語法 | 意義 |
| --- | --- |
| vars.stamina | 變數葉節點，群組不可求值 |
| expr.weekly_pay | 計算式巨集回傳值 |
| params.amount | 目前任務巨集的局部參數 |
| 10、-3.5、1e2、true、false | 數字／布林常數 |
| `"rain"` | JSON 雙引號字串常數；外層 YAML 可用單引號包住 |
| +、-、*、/、括號 | 數字運算；乘除先於加減，同優先權左結合 |
| ==、!=、<、<=、>、>= | 比較；型別規則沿用核心 |
| and／or、&&／\|\| | 布林條件，and 優先於 or |
| ALL(a, b)、ANY(a, b) | 明確群組，可巢狀；匯出採此形式保留原樹 |
| `event("cold", "probability_percent")` | 明確事件的數值屬性 |
| `event("@current", "cooldown_remaining")` | 目前事件屬性 |
| `event("@param:target", "cooldown_days")` | 目前巨集的事件參數屬性 |

事件屬性只允許 probability_percent、cooldown_days、cooldown_remaining。一般 scalar 引數不能直接放比較或 ALL／ANY；需要布林結果時建立 type: boolean 的計算式巨集，再以 expr.* 引用。when、eligibility 與布林計算定義可直接寫條件；單一布林運算元在條件位置等價於與 true 比較。

**所有運算式欄位都是字串**：常數 `"10"`、`"true"` 也要保留 YAML 引號，避免解析成 number／boolean。字串常數例如 `value: '"rain"'`，而非 `value: rain`。初始值 initial 則是原生 YAML 數字／字串／布林，不是運算式。

Parser 不執行 JavaScript；沒有 eval、任意函數、陣列索引或任意物件存取。單一運算式限制 16,000 字元、4,000 tokens、64 層。YAML 限 4 MB，拒絕重複 key、自訂 tag 與 alias 展開。

## 動作、參數與分支

```yaml
task_macros:
  work:
    parameters:
      cost: { type: number, display_name: 體力消耗 }
    eligibility: vars.stamina >= params.cost
    steps:
      - { builtin: increment_variable, target: stamina, value: "0 - params.cost" }
      - { macro: reward, arguments: { amount: "10" } }
```

mode 預設 sequence，steps 是直接動作陣列，不包含內部步驟 UUID。mode: branch 使用 `branches: [{when: 條件字串或null, run: 動作}]`；非空時唯一 ELSE（when: null）須在最後。mode: priority 使用 `candidates: [{macro: 符號, arguments: {...}}]`，候選只能呼叫巨集。三種模式皆可設定 eligibility，空內容合法。

一般呼叫為 `{task: 符號, arguments: {...}}`，巨集呼叫為 `{macro: 符號, arguments: {...}}`；arguments 的 key 是被呼叫者參數符號。parameters 是 mapping，支援 number、string、boolean、variable_reference、event_reference、enum。引用參數另填 value_type／access，事件參數另填 event_kind，列舉使用 enum 符號或 options: [{display_name, value}]。

一般引數是運算式字串；位置型引數使用 `{variable: money}`、`{event: cold}`、`{current_event: true}`、`{parameter: target}`。局部參數的存取與轉傳相容性由核心驗證。

內建動作：

| builtin | 其他欄位 |
| --- | --- |
| set_variable | target 變數符號、value 運算式 |
| increment_variable | target、value、選填 random_amplitude 運算式 |
| toggle_variable／reset_variable | target |
| adjust_probability_event | event 位置引數、property、operation、value 運算式；property／operation 可用 `{parameter: 符號}` |
| schedule_event | display_name、date、day 或 source、execution、priority |

預約 date 為 `{mode: days, offset: "7"}` 或 `{mode: weeks_weekday, offset: "1", weekday: thu}`。預約只允許固定或加權來源；不支援依序。放行不是一般動作，放在日行程 releases。

## 日、周、周序列與事件

```yaml
days:
  inspection:
    slots: [repair, repair]
    hooks:
      - { start: check, end: null }
      - { start: check, end: null }
    releases:
      - { when: "vars.broken == false" }
      - { when: "vars.broken == false" }
```

日行程 start／end 是日開始／結束的時段行程符號。slots 長度等於每日時段數，省略時補全空格；hooks 與 releases 若提供，長度也須相同。release 元素 null 表示未加入，`{when: null}` 或 `{}` 表示已加入無條件放行。周私有日可用 `scope: week_private`、`owner: {week: 周符號, weekday: tue}` 保留；不能作為共用事件候選。

周序列 weeks 是有順序的周符號陣列；overrides 為 `[{week: 1, weekday: mon, day: 日符號或null}]`。沒有覆蓋記錄表示繼承，day: null 表示清空。開始與結束星期分別作用於第一與最後一周。

事件位於各序列的 events mapping，具有 kind、start、priority（預設 0）、execution（預設 overlay），來源用 day 或 source 二擇一：

```yaml
source:
  mode: random
  candidates:
    - { day: success, weight: 3 }
    - { day: failure, weight: 1 }
```

隨機權重預設 1；sequential 來源只填 day，按陣列順序循環，不填 weight。

| kind | 日期規則 |
| --- | --- |
| once | start: {week, weekday} |
| periodic | start、end、every（至少 1）、選填 count |
| probability | start、end、probability（0–100）、cooldown_days、選填 count |

count 是 `{kind: all}`、`{kind: day, day: 符號}` 或 `{kind: tag, tag: 工作}`，省略為全部日期。execution 可為 overlay、interrupt_main、interrupt_lower；後兩者優先權不可負。週期從第一個符合日期即執行；若要 Day 7 首次扣房租，start 就應設定那一天。

## API 與 MCP

瀏覽器與 Node 共用：

```js
import { importBlueprint, exportBlueprint } from './src/core/blueprint/index.js';
const compiled = importBlueprint(yamlText); // {data: 專案JSON, draft, errors}
const output = exportBlueprint(compiled.draft); // {data: YAML字串, errors}
```

Project session 提供 `importBlueprint(text)` 與 `exportBlueprint()`；匯入是與 loadDocument 相同的整份重建操作，不是一般物件更新。Node service 另外保護 revision、未儲存內容與模擬模式。

MCP 呼叫流程：

```text
project_status
project_import_yaml({yaml: "...", preview: true})
project_import_yaml({yaml: "...", expectedRevision: 當前版本})
project_export({format: "yaml"})
project_export({format: "yaml", path: "blueprint.yaml", expectedRevision: 當前版本})
project_save({path: "project.json", expectedRevision: 當前版本})
```

匯入也接受 path: "blueprint.yaml" 或 .yml，與 yaml 文字二擇一。preview 只驗證與回傳數量，不替換專案、不增加 revision；不是對後續匯入的鎖定。正式匯入需要 expectedRevision，未儲存專案需要明確 discardChanges: true。任何錯誤保留目前專案；成功匯入清除原檔案關聯、標為未儲存，需另外 project_save。匯出不是儲存。

Resource：`schedule://schema/blueprint`、`schedule://guide/blueprint`、`schedule://guide/blueprint-example`。連至本機 GUI 的 MCP bridge 使用相同 API，成功匯入會同步至 GUI。

GUI 起始畫面與系統選單共用「匯入專案」入口，依副檔名分流：.json 載入完整專案，.yaml／.yml 編譯藍圖並以新 UUID 重建。純網頁（含 GitHub Pages）在瀏覽器內編譯；本機同步模式會把完整驗證後的專案提交至共用服務。伺服器「開啟專案」路徑也接受 YAML／YML。藍圖匯入標為未儲存，錯誤或取消取代確認時保留原專案。

## 匯出與重建保證

`sequences.*.weeks` 可混合周名稱與 `{week: 名稱, repeat: 總次數}`。`repeat: null` 表示最後一筆無限重複，詳見 [周重複](WEEK_REPEAT.md)。匯出不展開周資料。

匯出完整定義，保留未被使用的物件、共用巨集、參數、分支、環境契約、Override、私有日與事件來源，不輸出展開後的副本。mapping key 保留物件的持久化 name，修改 display_name 不影響 key；修改 name 後，匯出依原 UUID 找到新名稱並重寫引用。

匯入先分配符號，再解析前向引用，最後完整驗證才可提交。不嘗試用同名物件配對舊專案。重建後 UUID 與圖示可以不同，但可執行邏輯與共用關係相同。文字匯出有標準化，例如括號、ALL／ANY 與預設初始值；不保留原始註解或排版。

## 測試案例假設

生活 YAML 保留目前編輯內容：每日三個時段，工作日兩班工作後休息；周日開始結算，1–4 班為實際工資減 10、0 班不給薪，金錢下限 0；日結束心情 -6，感冒只中斷當日。固定回歸案例另存 tests/fixtures/life-simulation.yaml，包含房租與不同薪資假設，不因使用者修改文件範例而改變。

`tests/blueprint.test.js` 驗證文字 parser、重建、模擬結果、現有範例與複雜引用；`tests/blueprintMcp.test.js` 使用真正 stdio MCP 與本機 HTTP bridge，驗證建立、預覽、修改、YAML 匯出／匯入、全新 UUID、存檔與失敗保留。
# 說明欄位

各物件及分支／步驟／候選可使用選填的 `description`。需要在匯入與再匯出後保留的規則註解，請改存此欄位；YAML `#` 註解不會成為專案資料。完整範圍、介面與 API 行為請參閱 [DESCRIPTIONS.md](DESCRIPTIONS.md)。

