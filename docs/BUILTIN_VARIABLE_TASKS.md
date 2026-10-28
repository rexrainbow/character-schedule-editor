# 內建變數操作任務

任務介面將下列範本歸於「變數操作」，另有兩個固定無參數的 [流程控制任務](./FLOW_CONTROL_TASKS.md)，供周序列某日取消尚未執行的低優先行程。

任務清單固定提供四個範本。環境模式可修改圖示、顯示名稱、name 及各參數名稱；不得新增／刪除／排序／改變參數型別，也不能刪除或複製範本。未自訂名稱跟隨繁體中文／英文介面，自訂名稱保留原文。

| 編輯器識別 | 預設名稱 | 目標型別 | 目標權限 | 其他參數 |
| --- | --- | --- | --- | --- |
| `set_variable` | 設定變數 | 任意 | write | value：符合目標型別的 expression |
| `increment_variable` | 增加數值 | number | read_write | value：數字 expression（增量） |
| `toggle_variable` | 切換布林 | boolean | read_write | 無 |
| `reset_variable` | 重設初始值 | 任意 | write | 無 |

四個任務均只能選取變數空間中非唯讀的葉節點，不能選群組或計算式巨集。目標樹會依型別過濾，保留群組供展開瀏覽。使用者模式可選取任一層的可寫變數。目標位置與一般讀取 expression 分開保存。

增加數值先求值增量，再加至目標目前值；負數代表減少。增量可以引用變數、計算式巨集、數字運算式及目前巨集的數字參數。切換布林相當於 `target = !target`。重設初始值使用 runtime 實際採用的初始化值，而非直接將編輯器匯出的 initial_value 複製進呼叫；環境層初始化政策由 engine 決定。

初始值和執行狀態的關係詳見 [INITIAL_VALUES.md](./INITIAL_VALUES.md)。Engine 應在初始化時保留可供重設的基準；恢復執行存檔不應把當下的值誤當成初始化基準。若有並行執行，增加與切換應由 engine 保證讀取、修改、寫回的原子性。

專案資料範例：

```json
{
  "builtin": "increment_variable",
  "target_variable_id": "11111111-1111-4111-8111-111111111111",
  "value": { "type": "constant", "value": -10 }
}
```

切換與重設只有 builtin 及 target_variable_id，不保存 value。固定範本的自訂 metadata 分別存於 `builtin_tasks.<識別>`；切換與重設只允許自訂 target 參數名稱。

時段分支、序列巨集步驟及分支巨集皆支援四個範本。所有引用均納入變數刪除、型別與唯讀變更檢查，環境替換亦依原規則重連目標 UUID，失敗時不修改專案。

Runtime 呼叫沿用特殊目標介面：

```json
{
  "task_key": "increment_variable",
  "target": { "type": "environment_reference", "name": "energy" },
  "value": { "type": "constant", "value": -10 }
}
```

切換與重設的 runtime 呼叫省略 value。目標也可為應用變數 `{type: "reference", reference_id: UUID}`。Runtime 不輸出 builtin 識別或固定操作碼，engine 依使用者填寫的 task_key 實作相對應契約。

實際使用的範本列入 environment_requirements.tasks，task_key 使用範本的 name；名稱依任務命名空間檢查唯一性。增加及切換的環境變數依賴標記 read_write；重設標記 write；同一變數的多處使用會合併權限。執行規則見 [ENGINE_SEMANTICS.md](./ENGINE_SEMANTICS.md)。
