# 持久化名稱與顯示名稱

現行格式使用必填 `name` 作為持久化符號與 engine 契約，已移除 `engine_key`。舊文件中的 engine key 規則不再適用；開發階段不提供舊存檔自動遷移。

## 身分與範圍

- UUID 是編輯器內部身分；改名不改 UUID，也不破壞既有引用。
- name 符合 `^[A-Za-z_][A-Za-z0-9_]*$`，區分大小寫，不含空格、點或連字號。
- 同類型名稱唯一，不同類型可重名，例如時段行程 work 與任務巨集 work。
- 變數名稱在全部變數群組與葉節點間唯一，環境／應用層不允許同類重名；計算式與列舉各有獨立命名空間。
- 參數名稱只在所屬任務／巨集內唯一。事件名稱目前在整個專案唯一；操作時仍須指定所屬周序列。
- 一般任務與內建任務共用任務命名空間。

display_name 是選填的人類顯示文字。留白時顯示 name；儲存仍保留空白，改 name 後 fallback 跟著改。GUI 第一行排列為圖示、name、display_name。新建物件可先得到合法的自動名稱，再由使用者修改；複製使用新的名稱，不能與來源相同。GUI 允許暫時未完成的輸入，提交前驗證、存檔與 runtime 匯出會拒絕不合法或重複名稱。

## Blueprint 維持 mapping

```yaml
variables:
  stamina: { display_name: 體力, initial: 60, min: 0, max: 100 }
  money: { initial: 90, min: 0 }
expressions:
  weekly_pay:
    display_name: 本期薪資
    type: number
    value: vars.money * 10
```

mapping key 就是物件的 name，不需要在內容重複宣告 name，也不輸出 UUID／icon。初始輸入與編輯過程的匯出使用相同格式；符號不再由 display_name 重新推導。money 的顯示文字預設就是 money。

匯入保留所有 key，配置新 UUID，再重接引用；不是合併或更新目前專案。更名既有變數後，匯出會依同一個 UUID 找到新 name，因此運算式及任務目標同步更新。

固定內建任務的 YAML key 是操作種類（例如 increment_variable），內容可選填 name 改變 engine 契約名稱，省略時使用種類名稱。名稱與動作種類分開；參數型別與數量仍固定。

## Agent／MCP 不需要輸出 UUID 對照表

先取得 project_export(format: yaml) 的 value 與同一結果的 revision，再查詢相關操作：

```json
{
  "command": { "object": "variables", "action": "get", "name": "stamina" }
}
```

```json
{
  "expectedRevision": 42,
  "command": {
    "object": "variables",
    "action": "update",
    "name": "stamina",
    "values": { "name": "energy", "display_name": "體力", "initial_value": 70 }
  }
}
```

命令層在每次呼叫的目前快照中精確解析 name，再交給 UUID 核心。id 欄位亦可接受名稱或完整 UUID。若同時給 id 與 name，必須指向同一物件；不使用前綴模糊匹配。查無名稱就拒絕，不建立替代物件。

引用欄位如 slotId、dayId、weekId、sequenceId、ownerId 也接受名稱。動作 AST 的 reference_id、task_macro_id 等仍沿用原欄位名稱，但可填對應的名稱；呼叫 arguments 的 key 可填被呼叫者參數名稱。查詢回傳 name／display_name 及內部 id，agent 不需要為後續修改保存 id。

傳輸格式與 GUI 工作資料分開：公開專案 JSON、runtime 及命令結果使用 name；GUI 工作資料的符號欄位是 symbol，行程原有 name 欄位仍承載顯示文字。純 JS 使用端可呼叫 `executeCommand(session, command)` 使用與 MCP 相同的名稱解析。

## Runtime

物件與環境契約輸出 name，環境引用使用 `{type: environment_reference, name: ...}`，任務 task_key 的內容為該任務的 name。UUID 仍可用於 runtime 內部關聯；對外入口 exports 採類型前綴，例如 slots.work、taskMacros.work，避免跨類同名覆蓋。

行程進度範本改用 schedule_current_week、schedule_current_weekday、schedule_current_day、schedule_current_slot、schedule_slots_per_day、schedule_total_weeks；模擬自動配對相同名稱。改名時仍可明確指定進度綁定。Engine 應同步採用新契約；display_name 更動不影響 name。
# 物件說明

名稱欄位之外另提供選填 `description`，說明用途或設計意圖，與名稱解析及 runtime 契約無關。詳見 [DESCRIPTIONS.md](DESCRIPTIONS.md)。

