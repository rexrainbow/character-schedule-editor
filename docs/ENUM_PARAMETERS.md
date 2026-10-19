# 選項參數

任務定義及任務巨集的參數型別新增 `enum`。介面稱為「選項」，定義一組顯示名稱及固定字串值，呼叫時以 dropdown 選取，不自動選第一項。

選項來源可為下列自訂 `options`，或以 `enum_id` 引用「列舉定義」。兩者互斥，不把共用來源的選項複製進參數；可切換回自訂選項，將目前內容另存成獨立設定。完整分層與樹狀定義見 [ENUM_DEFINITIONS.md](./ENUM_DEFINITIONS.md)。

```json
{
  "id": "參數 UUID",
  "display_name": "屬性",
  "type": "enum",
  "options": [
    { "display_name": "發生機率 (%)", "value": "probability_percent" },
    { "display_name": "冷卻天數", "value": "cooldown_days" }
  ]
}
```

`options` 至少一筆。名稱不可空白；值必須為非空且沒有前後空白的字串，同一參數內不可重複。名稱是使用者可編輯的顯示文字，value 是 runtime 契約。選項不另外產生 UUID，參照以參數 UUID 及固定值辨識。其他參數型別不能帶 options。

參數編輯介面可新增、刪除及上下交換選項，分開編輯名稱和值。修改名稱、排序不影響呼叫資料。修改／刪除已使用的值，或使巨集內轉傳變得不相容，會沿用參數修改警告，保留修改前資料。使用中的參數須先調整呼叫端與內部轉傳，才能縮減選項集合；草稿中的空白、重複選項會顯示欄位錯誤，匯出／匯入亦會驗證。

## 呼叫與轉傳

固定選項儲存為既有的字串常數運算元，巨集參數引用沿用既有 UUID 結構：

```json
{ "type": "constant", "value": "probability_percent" }
```

```json
{ "type": "parameter_reference", "parameter_id": "來源參數 UUID" }
```

選項輸入僅接受所宣告的固定選項，或相容的 enum 巨集參數；不接受任意變數、計算式巨集、算術式或一般 string 參數。呼叫欄位的下拉選單會分為「固定選項」及「引用巨集參數」。未選擇時顯示提示並視為未完成。

相容性比較 value，不比較名稱或排序。接收方的選項值集合必須包含來源的全部可能值，例如來源 `{a}` 可傳給接收方 `{a,b}`，反向不行。環境匯入替換任務定義時亦檢查此契約。

巨集內部可將 enum 參數作為字串運算元，與字串常數做 `==`、`!=` 比較，或傳給一般 string 參數。不接受數值算術或數字比較。參數引用保護、複製巨集後參數 UUID 重建，均包含 enum 引用。

## 調整機率事件

內建任務的「屬性」「操作」已共用 enum 定義與輸入元件。固定選項集合不可變更，參數顯示名稱仍可透過內建任務定義修改。

- 屬性：`probability_percent`、`cooldown_days`。
- 操作：`set`、`increase`。

原本的固定值仍使用既有字串欄位格式；這兩個欄位現在也可填入 `parameter_reference`。例如巨集對外定義相容的「屬性」與「操作」參數，內部把它們轉傳給調整任務。模擬先解析參數值，再套用既有機率限制及冷卻整數規則。

## 匯出與驗證

專案、環境及 runtime Schema 均包含 enum 定義。自訂選項的參數保存 options；共用列舉的參數保存 enum_id，runtime 由頂層 enum_definitions 查找選項。固定參數仍輸出字串常數，巨集內引用仍以參數 UUID 傳遞。Engine 在呼叫時應驗證解析後的值屬於接收方選項，並以字串供條件判斷使用。

「調整機率事件」runtime 輸出的 property/operation，可為固定字串或參數引用物件；引擎須先在目前巨集呼叫作用域解析後，才執行設定變更。

主要實作：`src/core/enumParameters.js`、`src/gui/editors/EnumArgumentEditor.jsx`、`src/gui/components/ParameterContractFields.jsx`。驗證包含單元測試 `tests/enumParameters.test.js` 及瀏覽器測試 `tests/browser/enumParameters.spec.js`。
