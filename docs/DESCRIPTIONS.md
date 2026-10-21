# 說明欄位

`description` 是選填文字，用來保存用途、設計意圖或規則解釋，不影響條件判斷與執行結果。`display_name` 用來識別物件，`description` 用來解釋物件。

## 支援範圍

- 變數與群組、計算式巨集、列舉定義與群組。
- 任務定義、內建任務、任務巨集及其參數。
- 時段、日、周、周序列行程與事件。
- 計算式分支、任務分支、任務步驟與優先候選項目。

不替每個巢狀運算節點增加說明欄位。說明屬於整個物件、分支、步驟或候選項目；移動、複製時跟著該項目保留。

## 編輯與顯示

物件編輯器在 icon／name／display_name 下一列提供多行「說明（選填）」欄位。分支、步驟及候選項目的說明位於其編輯內容最後，唯讀的環境定義也禁止修改說明。

邏輯一覽依目前展開層級，以 `//` 註解顯示可見規則及物件的說明。多行說明每行均加上註解前綴；「顯示說明」預設開啟，偏好會與展開設定一起保存。計算式預覽也會顯示分支說明。

Markdown 報告包含周序列、事件、日行程說明，時段與任務說明隨展開的邏輯輸出。文字會依報告的既有規則跳脫。

## 保存與交換

Project、環境檔及 Blueprint 都保存說明。空白或缺少欄位代表沒有說明，匯出省略空白欄位。一般 YAML `#` 註解不保證匯入後仍能保留，需往返保存的內容請使用 `description`。

Runtime 匯出不包含 `description`，包含巢狀分支與參數的說明也會移除。

```yaml
expressions:
  weekly_pay:
    display_name: 每周薪資
    description: 依出勤班數結算，包含全勤獎金。
    type: number
    branches:
      - when: vars.worked_shifts == 10
        value: (vars.worked_shifts * 10) + 20
        description: 全勤，加發獎金 20。
      - when: null
        value: vars.worked_shifts * 10
        description: 其他班數按實際出勤計薪。
```

任務序列的 `steps` 與優先模式的 `candidates` 仍使用既有 inline action 格式；`description` 與 `task`、`macro` 或 `builtin` 並列，匯入時保存於對應步驟／候選，而非被呼叫的定義。

```yaml
task_macros:
  work:
    steps:
      - builtin: increment_variable
        target: stamina
        value: "-12"
        description: 先消耗體力。
```

內建任務可使用頂層 `description`；固定參數的說明使用 `parameter_descriptions: { target: 可寫入的變數 }`，與 `parameter_names`、`parameter_symbols` 對應。

API 可在既有 `create`／`update` 的 `values.description` 讀寫物件說明，或在 `branches`、`steps`、`candidates` 項目上讀寫說明。名稱解析、revision 檢查與交易驗證維持原有行為；非字串值會由 Schema 拒絕。
