export const weightedBlueprint = `project: {name: Weighted demo}
variables:
  stamina: {display_name: Stamina, initial: 0}
  balance: {display_name: Balance, initial: 0}
task_macros:
  work: {display_name: Work, eligibility: vars.stamina >= 10, steps: [{builtin: increment_variable, target: balance, value: "10"}]}
  rest: {display_name: Rest, steps: [{builtin: increment_variable, target: balance, value: "1"}]}
  lottery:
    display_name: Choose activity
    mode: random
    candidates: [{macro: work, weight: "1"}, {macro: rest, weight: "0"}]
    fallback: {builtin: increment_variable, target: balance, value: "2"}
slots: {s: {display_name: Activity, branches: [{when: null, run: {macro: lottery}}]}}
`;
