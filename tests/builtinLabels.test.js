import test from 'node:test';
import assert from 'node:assert/strict';
import { translator } from '../src/i18n/index.js';
import { normalizeSymbols } from '../src/core/symbols.js';
import { builtinTaskDefinitions, changeBuiltinDefinition } from '../src/core/builtinTaskModel.js';
import { addExpressionFunctions } from '../src/core/expressionFunctions.js';
import { localizeExpressionFunctions } from '../src/core/builtinLabels.js';
import { createProject, compileProject } from '../src/core/model.js';

test('builtin task defaults use translated labels even when metadata-only overrides generated symbol fallbacks', () => {
  const config = normalizeSymbols({ builtinTasks: { increment_variable: { icon: 'blue' }, reset_variable: { symbol: 'reset_stats' } } }).builtinTasks;
  for (const locale of ['en', 'zh-TW']) {
    const t = translator(locale), definitions = builtinTaskDefinitions(config, t);
    assert.equal(definitions.find((item) => item.id === 'builtin:increment_variable').display_name, t('incrementVariable'));
    assert.equal(definitions.find((item) => item.id === 'builtin:reset_variable').display_name, t('resetVariable'));
    assert.equal(builtinTaskDefinitions({ increment_variable: { display_name: 'increment_variable' } }, t).find((item) => item.id === 'builtin:increment_variable').display_name, t('incrementVariable'));
  }
  const en = translator('en'), current = builtinTaskDefinitions(config, en).find((item) => item.id === 'builtin:increment_variable');
  const custom = changeBuiltinDefinition(config, current, { ...current, display_name: 'Gain resources' });
  for (const locale of ['en', 'zh-TW']) assert.equal(builtinTaskDefinitions(custom, translator(locale)).find((item) => item.id === current.id).display_name, 'Gain resources');
});

test('random function names and parameter defaults switch language without changing UUIDs or stored data', () => {
  const nodes = normalizeSymbols({ operandNodes: addExpressionFunctions({}) }).operandNodes;
  for (const locale of ['en', 'zh-TW']) {
    const t = translator(locale), view = localizeExpressionFunctions(nodes, t);
    for (const [id, node] of Object.entries(view)) {
      assert.equal(node.display_name, t('expressionFunction_' + node.definition.builtin));
      assert.equal(node.parameters[0].display_name, t('expressionParam_' + (node.definition.builtin === 'randomRange' ? 'min' : 'items')));
      assert.equal(node.parameters[0].id, nodes[id].parameters[0].id);
    }
    assert.deepEqual(normalizeSymbols({ operandNodes: view }).operandNodes, nodes);
    const result = compileProject({ ...createProject(), operandNodes: view }); assert.deepEqual(result.errors, []);
    assert.ok(Object.values(result.data.expression_macros).every((node) => node.display_name === '' && node.parameters.every((p) => p.display_name === '')));
  }
});

test('existing default English function labels localize, while custom function and parameter names survive', () => {
  const source = addExpressionFunctions({}), [id, range] = Object.entries(source).find(([, node]) => node.definition.builtin === 'randomRange');
  range.display_name = 'Random range'; range.parameters[0].display_name = 'Minimum';
  const initial = normalizeSymbols({ operandNodes: source }).operandNodes;
  assert.equal(localizeExpressionFunctions(initial, translator('zh-TW'))[id].display_name, '隨機範圍');
  const changed = structuredClone(initial); changed[id].display_name = 'Lucky roll'; changed[id].parameters[0].display_name = 'Lower bound';
  const custom = normalizeSymbols({ operandNodes: changed }).operandNodes;
  for (const locale of ['en', 'zh-TW']) {
    const view = localizeExpressionFunctions(custom, translator(locale));
    assert.equal(view[id].display_name, 'Lucky roll'); assert.equal(view[id].parameters[0].display_name, 'Lower bound');
    assert.equal(view[id].parameters[1].display_name, translator(locale)('expressionParam_max'));
  }
});
