export const expressionFunctionYaml = `
environment: {name: Functions, version: dev}
variables:
  n: {initial: 0}
  text: {type: string}
  flag: {type: boolean}
expressions:
  twice:
    display_name: Twice
    type: number
    parameters: {x: {type: number, display_name: Input}}
    value: params.x + params.x
  greeting:
    display_name: Greeting
    type: string
    parameters: {a: {type: string, display_name: Greeting text}}
    value: expr.randomItem(params.a, "B", "C")
  label:
    display_name: Label
    type: string
    parameters: {x: {type: number, display_name: Input}}
    branches:
      - {when: params.x > 0, value: '"Positive"'}
      - {when: null, value: '"Negative"'}
task_macros:
  update:
    steps:
      - {builtin: set_variable, target: n, value: 'expr.twice(expr.randomRange(1, 3))'}
      - {builtin: set_variable, target: text, value: 'expr.greeting("A")'}
      - {builtin: set_variable, target: flag, value: 'expr.randomItem(true, false)'}
slots:
  demo:
    display_name: Demo
    branches: [{when: null, run: {macro: update}}]
`;
