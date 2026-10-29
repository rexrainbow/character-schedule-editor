# 帶參數的計算式巨集與隨機函數

環境與使用者計算式巨集都可宣告固定參數，支援 number、string、boolean；單一計算式與分支模式都能引用自己的參數，回傳型別也支援文字。參數有 UUID、name、display_name、icon 與 description，沿用任務參數的顯示方式。參數僅在當次呼叫有效，不會加入變數空間。

編輯介面的參數區位於定義之前。新增、移除與上下排序適用於一般巨集；仍被自己定義引用的參數不能直接刪除。呼叫位置會顯示各引數，點擊後沿用運算元選取器，並支援巢狀函數與局部參數。數字、文字、布林均需型別相容，沒有隱式轉型。

## 環境內建函數

編輯器與本機／MCP 專案服務在啟動、新建或載入專案、匯入環境時，自動補齊兩個環境函數，直接顯示於計算式巨集清單，沒有另外的安裝按鈕。既有函數保留 UUID、名稱、圖示及參數顯示設定，不會重複建立；預設 name 與自訂巨集衝突時，使用不重複的後綴，不覆寫自訂內容。使用者模式可引用環境函數，不能修改環境定義。環境函數也可以由其他環境巨集引用。

| 預設 name | 參數 | 回傳與規則 |
| --- | --- | --- |
| randomRange | min、max：number | `[min, max)` 的連續數值；min == max 直接回傳該值且不消耗亂數。min > max 或非有限數值停止執行。 |
| randomItem | items：可變候選 | 至少一個候選，每個等機率。同次呼叫須全為 number、string 或 boolean，回傳同型別的選中值。重複候選也各占一個抽樣位置。 |

randomItem 的 `value_type: any` 與參數 `type: any, variadic: true` 是固定內建契約，型別由每次呼叫的候選推導；一般自訂巨集不宣告 any 或可變參數。內建函數的參數數量、型別與可變性鎖定，名稱、圖示與說明可編輯。

## YAML 與儲存格式

```yaml
expressions:
  recovery:
    display_name: 恢復量
    type: number
    parameters:
      low: { type: number, display_name: 最少 }
      high: { type: number, display_name: 最多 }
    value: expr.randomRange(params.low, params.high)
  greeting:
    display_name: 隨機問候
    type: string
    value: 'expr.randomItem("你好", "早安", "歡迎")'
```

使用方式為 `expr.recovery(8, 16)`。文字引數須保留雙引號，例如 `expr.greeting()`；無參數巨集也可保留原本的 `expr.greeting`。引數依宣告順序輸入；專案內部依參數 UUID 保存對應，改名或排序不會讓既有引數綁到其他參數。匯出 YAML 時重新依當下順序輸出文字呼叫。

初始 YAML 引用預設 `expr.randomRange(...)` 或 `expr.randomItem(...)` 且未宣告它們時，匯入器補上環境定義。匯出的 YAML 會顯式包含內建契約，也可以自行宣告：

```yaml
expressions:
  randomRange:
    scope: environment
    type: number
    builtin: randomRange
    parameters:
      min: {type: number}
      max: {type: number}
  randomItem:
    scope: environment
    type: any
    builtin: randomItem
    parameters:
      items: {type: any, variadic: true}
```

專案的呼叫節點使用 `expression_macro_reference`，`arguments` 以被呼叫者參數 UUID 為 key；固定參數對應單一運算元，可變候選對應運算元陣列。巨集定義保存自己的 parameters。環境替換時，會依參數名稱重連引數並檢查型別／可變性相容。

## 執行語意

內建函數的預設顯示名稱與參數名稱隨介面語系切換（例如 Random range／隨機範圍、Minimum／最小值）。自行填寫的顯示名稱保持原樣；清空後恢復系統預設。翻譯只用於顯示，不改變 UUID、name 或引數參照，也不會因切換語系而寫入專案。

1. 呼叫時按參數順序求值引數，每個只求值一次，再綁定為巨集內的區域值。randomItem 的全部候選先依序求值，再抽一個；未選中候選的引數運算也已執行。
2. 所有函數沿用 runtime 共用 seeded RNG；每次 randomItem 呼叫消耗一次抽樣，包含只有一個候選時。非退化 randomRange 消耗一次。不同函數／事件的抽樣順序會影響之後的結果。
3. 被 ALL／ANY 短路跳過的條件，以及未選中分支的回傳結果不求值，因此不消耗其中的亂數。計算式沒有快取，多次呼叫可能得到不同結果；要保留結果時使用設定變數任務。
4. 預覽與邏輯一覽只格式化資料，不求值。diagnostics 開關不改變求值與抽樣；啟用時可收到 `expression.random` 紀錄及一般數值求值紀錄。
5. 已準備的 pending 任務引數會隨 checkpoint 保存，恢復該任務時沿用，不重抽。計算式不修改變數空間，但隨機函數會推進亂數狀態。

UUID／name 兩種 Runtime Program 採相同求值流程。專案、環境、Blueprint 與執行資料都保存參數及呼叫；icon、description 維持僅供編輯器與藍圖使用。

參考 [BLUEPRINT.md](BLUEPRINT.md)、[ENGINE_SEMANTICS.md](ENGINE_SEMANTICS.md) 與 [隨機計算式範例](recipes/random-expressions.md)。
