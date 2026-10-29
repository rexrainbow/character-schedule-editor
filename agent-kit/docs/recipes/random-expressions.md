# 使用參數與隨機計算式

休息時，體力隨機恢復 8（含）到 16（不含）。這是時段任務效果，不需要新增全天事件。

```yaml
variables:
  stamina: {initial: 60, min: 0, max: 100}
expressions:
  recovery:
    type: number
    parameters:
      low: {type: number}
      high: {type: number}
    value: expr.randomRange(params.low, params.high)
  greeting:
    type: string
    value: 'expr.randomItem("你好", "早安", "歡迎")'
task_macros:
  rest:
    steps:
      - {builtin: increment_variable, target: stamina, value: 'expr.recovery(8, 16)'}
slots:
  rest:
    branches:
      - {when: null, run: {macro: rest}}
```

可直接匯入。匯入器會補上兩個預設環境函數；匯出會包含完整的內建契約。`greeting` 可作為文字任務參數或文字變數指派的值。隨機函數使用模擬種子；要重複使用同一抽取結果，先設定到變數，再讀該變數。

細節見 [計算式函數](../EXPRESSION_FUNCTIONS.md) 與 [Engine 執行語意](../ENGINE_SEMANTICS.md)。
