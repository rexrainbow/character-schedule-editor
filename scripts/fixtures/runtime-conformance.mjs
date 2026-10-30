// Source scenarios are compiled by JS only. Ports consume the generated Program JSON.
export const runtimeCases = [
  {
    id: 'selection-and-writes', description: 'Short-circuiting, priority, branch, truncation/clamp and reset baseline.',
    options: { initialState: { n: 3 } }, operations: [{ op: 'runSlot', slot: 'work' }],
    yaml: `variables:
  n: {initial: 8, integer: true, min: 0, max: 10}
  zero: {initial: 0}
task_macros:
  unavailable:
    eligibility: vars.n > 100
    steps: [{builtin: set_variable, target: n, value: "99"}]
  work:
    eligibility: ALL(true, ANY(true, 1 / vars.zero > 0))
    steps:
      - {builtin: increment_variable, target: n, value: "20"}
      - {builtin: increment_variable, target: n, value: "-2.8"}
      - {builtin: reset_variable, target: n}
      - {macro: finish}
  finish:
    mode: branch
    branches:
      - {when: vars.n == 8, run: {builtin: increment_variable, target: n, value: "-3"}}
      - {when: null, run: {builtin: set_variable, target: n, value: "0"}}
slots:
  work:
    mode: priority
    candidates: [{macro: unavailable}, {macro: work}]
`,
  },
  {
    id: 'seeded-weighted-selection', description: 'Seeded functions, zero-weight fallback and eligible-only weighted choices.',
    options: { seed: 'port-測試😀' }, operations: [{ op: 'runSlot', slot: 'roll' }],
    yaml: `variables:
  n: {initial: 0}
  text: {type: string, initial: ""}
task_macros:
  excluded:
    eligibility: "false"
    steps: [{builtin: set_variable, target: n, value: "999"}]
  weighted:
    mode: random
    candidates:
      - {macro: excluded, weight: "1000"}
      - {builtin: increment_variable, target: n, value: "2", weight: "1"}
      - {builtin: increment_variable, target: n, value: "3", weight: "2"}
  empty_pool:
    mode: random
    candidates: [{builtin: increment_variable, target: n, value: "99", weight: "0"}]
    fallback: {macro: weighted}
  roll:
    steps:
      - {builtin: set_variable, target: n, value: "expr.randomRange(2, 5)"}
      - {builtin: set_variable, target: text, value: 'expr.randomItem("red", "green", "blue")'}
      - {macro: empty_pool}
slots:
  roll: {branches: [{when: null, run: {macro: roll}}]}
`,
  },
  {
    id: 'days-events-and-release', description: 'Repeat boundary, event priority, per-slot release, periodic counts, sequential sources and cooldown.',
    operations: [{ op: 'runDay', sequence: 'life' }, ...Array.from({ length: 8 }, () => ({ op: 'nextDay' }))],
    yaml: `project: {slots_per_day: 2}
variables:
  n: {initial: 0}
slots:
  main: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "1"}}]}
  repair: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "10"}}]}
  bonus: {branches: [{when: null, run: {builtin: increment_variable, target: n, value: "100"}}]}
days:
  main: {slots: [main, main], tags: [working]}
  repair: {slots: [repair, repair], releases: [{when: null}, null]}
  bonus: {start: bonus}
  bonus_alt: {start: bonus}
weeks:
  normal: {days: {mon: main, tue: main, wed: main, thu: main, fri: main, sat: main, sun: main}}
sequences:
  life:
    weeks: [{week: normal, repeat: null}]
    events:
      repair:
        kind: probability
        start: {week: 1, weekday: mon}
        end: {week: 1, weekday: sun}
        probability: 100
        cooldown_days: 1
        priority: 2
        execution: interrupt_main
        day: repair
      bonus:
        kind: periodic
        start: {week: 1, weekday: mon}
        end: {week: 1, weekday: sun}
        every: 3
        count: {kind: tag, tag: working}
        priority: -1
        execution: overlay
        source: {mode: sequential, candidates: [{day: bonus}, {day: bonus_alt}]}
`,
  },
  {
    id: 'pending-task-resume', description: 'Pause rolls back staged writes; restore retries only the pending task with frozen random arguments.',
    handlers: { wait: [{ op: 'increment', variable: 'n', argument: 'amount' }] },
    operations: [{ op: 'startSlot', slot: 'work' }, { op: 'step' }, { op: 'resumeAndPause', task: 'wait' }, { op: 'restore' }, { op: 'resume' }],
    yaml: `variables:
  n: {initial: 0}
tasks:
  wait: {parameters: {amount: {type: number}}}
task_macros:
  work:
    steps:
      - {builtin: increment_variable, target: n, value: "1"}
      - {task: wait, arguments: {amount: "expr.randomRange(2, 5)"}}
      - {builtin: increment_variable, target: n, value: "10"}
slots:
  work: {branches: [{when: null, run: {macro: work}}]}
`,
  },
];
