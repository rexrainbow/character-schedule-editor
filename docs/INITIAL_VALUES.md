# 變數初始值

環境層與應用層的變數葉節點均可設定 `initial_value`。群組與計算式巨集沒有初始值；第一版只接受常數，不接受 expression 或變數引用。

數值變數亦可設定選填最小值與最大值，初始值須位於其範圍內，詳見 [VARIABLE_BOUNDS.md](./VARIABLE_BOUNDS.md)。

| `value_type` | 初始值 | 預設 |
| --- | --- | --- |
| `number` | 有限數字 | `0` |
| `string` | 字串 | `""` |
| `boolean` | 布林值 | `false` |

初始值不接受 `null`，不自動轉換型別。省略欄位時採用上述預設。新增變數會明確寫入初始值；複製保留原值。變更型別仍須通過既有引用檢查，之後確認將初始值重設為新型別的預設值；取消不修改資料。

`read_only` 限制執行時任務寫入，不限制在所屬編輯模式設定初始值。使用者編輯模式只能檢視環境層定義，仍可編輯應用層定義。

專案存檔與環境存檔保留初始值。匯入拒絕型別不合的值並回報位置，環境替換使用新環境的初始值，不改動應用層初始值。

Runtime Program 的 variables 字典包含完整環境與應用變數，以 scope 區分，parent_id 保留群組階層。葉節點均有 initial_value、value_type、read_only、name 與顯示文字，不輸出 icon。預設以 name 作為集合 key 與引用，群組與葉節點共用唯一命名空間。

不再另設 environment_requirements.variables。Runtime 宿主可覆寫環境層目前值與重設基準；定義中的初值仍一併輸出，不提供另一次匯出開關。格式見 [RUNTIME.md](RUNTIME.md)。

初始值是建立執行個體時的設定，不是執行中狀態。Runtime 恢復存檔時應使用存檔狀態；重載定義或切換行程不代表自動重設。初始化與狀態保存策略由 engine 實作。
