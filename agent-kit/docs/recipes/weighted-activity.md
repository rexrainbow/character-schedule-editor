# 在可執行的活動中加權擇一

工作需要體力、娛樂需要金錢；只讓符合資格的活動參與抽選。沒有符合者時休息，休息不占用正常候選機率。

```yaml
variables:
  stamina: {initial: 20}
  money: {initial: 0}
task_macros:
  work:
    eligibility: vars.stamina >= 10
    steps:
      - {builtin: increment_variable, target: stamina, value: "-10"}
      - {builtin: increment_variable, target: money, value: "10"}
  entertain:
    eligibility: vars.money >= 30
    steps:
      - {builtin: increment_variable, target: money, value: "-30"}
  rest:
    steps:
      - {builtin: increment_variable, target: stamina, value: "15"}
  choose_activity:
    mode: random
    candidates:
      - {macro: work, weight: "3"}
      - {macro: entertain, weight: "1"}
    fallback: {macro: rest}
slots:
  activity:
    branches:
      - {when: null, run: {macro: choose_activity}}
```

兩者都符合時為 75% 工作、25% 娛樂；只有工作符合時必選工作；兩者都不符合時才休息。這裡的資格只是活動開始前的檢查，並非工作已完成的記錄。固定種子可重現抽選，交換候選順序會改變同一抽樣值對應的活動。

格式見 [BLUEPRINT.md](../BLUEPRINT.md)，執行契約見 [ENGINE_SEMANTICS.md](../ENGINE_SEMANTICS.md)。
