# 周引用的有限與無限重複

重複設定屬於周序列的某一筆周引用，不改變共用周行程。次數表示**總執行次數**，1 表示一次，3 表示三次；null 表示無限重複。僅最後一筆允許無限重複，不支援條件式離開或多周群組循環。

## 編輯器

每筆周引用左側提供「執行次數」：一次、指定次數、無限。設定無限後，禁止在後方加入周、複製該筆或將它移至非末端；可先改為有限次數再操作。

周序列保持模板檢視，不展開重複資料。日覆蓋每輪都適用。Day 編號與當日模擬表示該格**首次有效執行**的位置，因此後續模板周會跳過前方累計的重複周數。模板格可能代表多個實際日期，目前模擬器不另外提供第 N 輪選擇。

開始日只裁切整段序列第一次執行；結束日只裁切最後一輪。單周執行三次、周四開始／周二結束，依序執行：周四到周日、完整一周、周一到周二。無限重複沒有結束日，原設定保留但不套用。

## Runtime

`startDay({sequence, position})` 的 position 是實際周曆位置，0 表示第一周周一；`dayIndex` 仍相對實際開始日從 0 計算。`nextDay()` 每次只前進一天，不自動跑完全部重複。

執行狀態與 diagnostic context 包含：

- `position`、`dayNumber`、`weekNumber`：持續增加的實際日期。
- `rowIndex`、`templatePosition`：來源周引用與模板日期，從 0 起算。
- `iteration`：目前周引用的第幾輪，從 1 起算。

這些位置隨 checkpoint 保存，恢復不重新播放前面已完成的任務。變數、亂數、機率冷卻與依序候選進度都不因換輪重設。有限序列的 `total_weeks` 是累計執行周數；無限序列使用 **0** 表示無有限總周數。其他進度變數照實際日期推進。

事件日期仍固定在模板位置：

- 單次事件只在首次有效到達指定位置時發生一次。
- 週期／機率事件的日期範圍是模板日期篩選；符合範圍的重複日期都參與計數，週期相位不因新一輪重設，開始日前的既定相位也保留。
- 機率冷卻只在符合計數的實際日期遞減。
- 預約事件綁實際未來日期，只在該日執行一次；允許預約超出模板長度但仍在展開後有效範圍內的日期。

日期解析與計數依周模板計算，不建立展開後的完整日期陣列；很大的有限次數與無限序列都使用相同的有限資料結構。

## 儲存、API 與藍圖

專案存檔新增選填 `week_repeat_counts`，與 `week_schedule_ids` 同長、逐筆對應，省略表示每筆一次。陣列元素是正整數或 null。Runtime JSON 的 `sequences.*.entries[]` 對應欄位為 `repeat_count`；Runtime Program 的 row 欄位為 `repeatCount`。

Core API：

```js
project.sequences.setRepeat(sequenceId, rowId, 3);
project.sequences.setRepeat(sequenceId, lastRowId, null);
```

MCP／command dispatch：

```json
{"object":"sequences","action":"setRepeat","name":"life","rowId":"該筆引用的 uid","count":3}
```

藍圖保留原本的一次性名稱簡寫，重複時使用物件：

```yaml
sequences:
  life:
    weeks:
      - introduction
      - { week: work_week, repeat: 10 }
      - conclusion
  endless:
    weeks:
      - { week: work_week, repeat: null }
```

專案、Runtime 與藍圖 Schema 同步描述此欄位；跨欄位規則（數量對應、無限只能末筆、累計日期需為安全整數）由語意驗證檢查。Markdown 報告保留模板列並標註 ×N／∞，總天數與結束日使用實際執行範圍。
