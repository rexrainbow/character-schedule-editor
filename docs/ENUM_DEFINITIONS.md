# 共用列舉定義

環境編輯與使用者編輯各有「列舉定義」頁面，皆不加「環境」或「應用」前綴。這是固定字串集合的定義，不是變數空間中的 runtime 狀態，也不屬於計算式巨集。

環境層管理 engine 提供的列舉；使用者模式可查看並引用這些來源，但不能修改。應用層另外管理自己的列舉，兩層以同一套樹狀編輯器呈現。環境任務參數只可引用環境層；任務巨集可引用兩層。

## 編輯與識別

樹節點分為群組 `group` 與列舉 `enum`。支援新增、搜尋、重新命名、修改圖示及 name、同級上下交換、變更父群組、複製及刪除子樹。父群組必須同層，不能移入自己的子樹。

每個節點以 UUID 作為 dictionary key，包含必填 name、display_name、icon、scope、parent_id 及 order。複製子樹會重建 UUID、父引用，配置不重複的 name，並複製獨立的選項內容。

列舉葉節點以共用選項編輯器管理 `{display_name, value}`。值只接受非空、無前後空白的字串，集合不得為空或重複；名稱也不可空白。內容在 runtime 是固定定義，沒有初始值或可寫入的狀態欄位。現有數字型「目前星期」不會自動改型。

## 參數來源

任務與巨集的「選項」參數提供「自訂選項／引用列舉」。引用時透過有搜尋及群組展開的面板選擇來源，顯示路徑及選項預覽，之後呼叫端直接使用來源的最新名稱與順序。

```json
{
  "id": "參數 UUID",
  "display_name": "指定星期",
  "type": "enum",
  "enum_id": "星期列舉 UUID"
}
```

`enum_id` 與 `options` 互斥。切回自訂選項會複製當下內容並解除連結。複製任務或巨集則維持原 enum_id，共用同一份列舉。

改名或排序可即時同步所有使用位置。刪除被參數引用的列舉或包含它的群組會被拒絕。修改選項值、增減選項，若會讓現有呼叫或參數轉傳失效，也會保留修改前資料並列出錯誤位置。新增選項可能擴大來源參數集合，須確認接收方接受全部可能值。

## 儲存與環境替換

專案以 `enum_definitions` dictionary 保存完整樹；draft 對應欄位是 enumNodes。參數只存 enum_id，不嵌入來源的選項。匯入驗證 UUID、節點結構、父層、循環、選項、引用目標及作用域。

環境匯出只包含環境層定義及環境任務。以環境建立專案時載入整棵環境列舉樹；替換環境時保留應用層定義。原有應用巨集的環境 enum_id 會依環境身分及 UUID，或唯一 name 重新連結。來源消失、名稱無法對應、選項集合縮小而不相容、UUID 與應用層衝突，皆拒絕套用候選資料。

不直接修改原專案後再嘗試復原；候選資料通過完整編譯後才可套用。

## Runtime 匯出

runtime 頂層的 enum_definitions 保存兩層列舉葉節點，以 UUID 索引，內容為 name、display_name、scope 及 options；不輸出圖示、群組、父層或編輯排序。

runtime 參數若為引用模式，保持 `{type: "enum", enum_id: UUID}`；自訂模式仍保存 options。Engine 必須從 catalog 解析 enum_id，再檢查實際字串是否存在。列舉以 `enums.name` 加入 exports，對應 `{kind: "enums", id: UUID}`。

模擬使用當前定義解析參數，可比較字串、轉傳至相容參數，或控制「調整機率事件」的屬性及操作；不將定義寫進變數空間。

實作：`enumDefinitions.js`、`EnumDefinitionsEditor.jsx`、`EnumOptionsEditor.jsx`、`ParameterContractFields.jsx` 與三份 Schema。測試：`tests/enumDefinitions.test.js`、`tests/browser/enumDefinitions.spec.js`。
