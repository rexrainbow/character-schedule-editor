import { Diagnostics } from './Diagnostics.js';
import { clampVariable } from '../core/variableBounds.js';
import { fail } from './utils.js';

export class Evaluator {
  constructor(program, state, context = {}, emit = () => {}, diagnostics = new Diagnostics(false)) { this.program = program; this.state = state; this.context = context; this.emit = emit; this.stack = new Set(); this.operations = 0; this.diagnostics = diagnostics; }
  guard(depth) { if (++this.operations > 20000 || depth > 64) fail('executionLimit'); }
  operand(value, scope = {}, depth = 0, path = '') {
    try { return this.diagnostics.observe('value', () => ({ operand: value, path }), () => this.operandValue(value, scope, depth, path)); }
    catch (error) { error.path ??= path; throw error; }
  }
  operandValue(value, scope = {}, depth = 0, path = '') {
    this.guard(depth);
    let result;
    if (value?.type === 'constant') result = value.value;
    else if (value?.type === 'reference') result = this.read(value.reference_id);
    else if (value?.type === 'parameter_reference') { if (!Object.hasOwn(scope, value.parameter_id)) fail('missingParameter'); result = scope[value.parameter_id]; }
    else if (value?.type === 'event_property') { const event = this.event(value.event, scope); result = this.state.events[event][value.property]; }
    else if (value?.type === 'expression_macro_reference') {
      const id = value.expression_macro_id, definition = this.program.get('expressions', id);
      if (this.stack.has(id)) fail('computedCycle');
      this.stack.add(id);
      try { result = this.computed(definition.definition, depth + 1, `/expression_macros/${id}/definition`); } finally { this.stack.delete(id); }
      if (typeof result !== definition.value_type) fail('computedResultMismatch');
    } else if (value?.type === 'expression') {
      const a = this.operand(value.operand_a, scope, depth + 1, `${path}/operand_a`), b = this.operand(value.operand_b, scope, depth + 1, `${path}/operand_b`);
      if (typeof a !== 'number' || typeof b !== 'number') fail('numericOperandRequired');
      if (value.operator === '/' && b === 0) fail('divisionByZero', { path: `${path}/operand_b` });
      if (!['+', '-', '*', '/'].includes(value.operator)) fail('invalidArithmeticOperator');
      result = value.operator === '+' ? a + b : value.operator === '-' ? a - b : value.operator === '*' ? a * b : a / b;
    } else fail('invalidOperand');
    if (!['number', 'boolean', 'string'].includes(typeof result)) fail('invalidValue');
    if (typeof result === 'number' && !Number.isFinite(result)) fail('finiteNumber');
    return result;
  }
  condition(value, scope = {}, depth = 0, path = '') {
    if (value === null) return true;
    try { return this.diagnostics.observe('condition', () => ({ condition: value, path }), () => this.conditionValue(value, scope, depth, path), (result) => ({ result })); }
    catch (error) { error.path ??= path; throw error; }
  }
  conditionValue(value, scope = {}, depth = 0, path = '') {
    this.guard(depth);
    if (value === null) return true;
    let result;
    if (value?.kind === 'group') {
      if (!['ALL', 'ANY'].includes(value.mode) || !value.items?.length) fail('invalidCondition');
      if (!this.diagnostics.enabled) return value.mode === 'ALL' ? value.items.every((item, index) => this.condition(item, scope, depth + 1, `${path}/items/${index}`)) : value.items.some((item, index) => this.condition(item, scope, depth + 1, `${path}/items/${index}`));
      result = value.mode === 'ALL'; let stopped = false;
      value.items.forEach((item, index) => {
        if (stopped) { this.diagnostics.skipped('condition', () => ({ condition: item, path: `${path}/items/${index}`, reason: 'shortCircuit' })); return; }
        result = this.condition(item, scope, depth + 1, `${path}/items/${index}`);
        stopped = value.mode === 'ALL' ? !result : result;
      });
    } else if (value?.kind === 'comparison') {
      const a = this.operand(value.operand_a, scope, depth + 1, `${path}/operand_a`), b = this.operand(value.operand_b, scope, depth + 1, `${path}/operand_b`);
      if (typeof a !== typeof b) fail('operandTypeMismatch');
      if (!['==', '!=', '<', '<=', '>', '>='].includes(value.comparator)) fail('invalidComparator');
      if (typeof a !== 'number' && !['==', '!='].includes(value.comparator)) fail('comparatorMismatch');
      result = value.comparator === '==' ? a === b : value.comparator === '!=' ? a !== b : value.comparator === '<' ? a < b : value.comparator === '<=' ? a <= b : value.comparator === '>' ? a > b : a >= b;
    } else fail('invalidCondition');
    return result;
  }
  computed(definition, depth, path = '') {
    this.guard(depth);
    if (definition.kind === 'number') return this.operand(definition.expression, {}, depth + 1, `${path}/expression`);
    if (definition.kind === 'boolean') return this.condition(definition.condition, {}, depth + 1, `${path}/condition`);
    if (definition.kind === 'branch') {
      if (!this.diagnostics.enabled) { for (const [index, branch] of definition.branches.entries()) if (this.condition(branch.condition, {}, depth + 1, `${path}/branches/${index}/condition`)) return this.computed(branch.result, depth + 1, `${path}/branches/${index}/result`); fail('invalidDefinition'); }
      let selected = false, result;
      definition.branches.forEach((branch, index) => {
        const details = () => ({ condition: branch.condition, index: index + 1, isElse: branch.condition === null, unconditional: definition.branches.length === 1 && branch.condition === null, path: `${path}/branches/${index}` });
        if (selected) { this.diagnostics.skipped('branch', details); return; }
        this.diagnostics.begin('branch', details);
        const matched = this.condition(branch.condition, {}, depth + 1, `${path}/branches/${index}/condition`);
        if (matched) {
          selected = true; result = this.computed(branch.result, depth + 1, `${path}/branches/${index}/result`);
          this.diagnostics.note('return', () => ({ value: result, path: `${path}/branches/${index}/result` }));
        } else this.diagnostics.note('skipped', () => ({ role: 'return' }));
        this.diagnostics.end('branch', () => ({ result: matched }));
      });
      if (selected) return result;
    }
    fail('invalidDefinition');
  }
  read(ref) { const id = this.program.resolve('variables', ref), node = this.program.get('variables', id); if (node.node_type !== 'value' || !Object.hasOwn(this.state.variables, id)) fail('missingVariable'); return this.state.variables[id]; }
  write(ref, value, system = false) {
    const id = this.program.resolve('variables', ref), node = this.program.get('variables', id);
    if (node.node_type !== 'value' || node.read_only && !system) fail('readonlyTarget');
    if (typeof value !== node.value_type || typeof value === 'number' && !Number.isFinite(value)) fail('writeTypeMismatch');
    const before = this.state.variables[id];
    this.state.variables[id] = clampVariable(node, value);
    if (!system) this.diagnostics.note('variable.staged', () => ({ ref: id, before, requested: value, after: this.state.variables[id], committed: false }));
    return this.state.variables[id];
  }
  event(value, scope = {}, kind = 'probability') {
    const ref = value?.type === 'parameter_reference' ? scope[value.parameter_id] : value;
    const id = ref?.type === 'current_event_reference' ? this.context.eventRef : ref?.event_group_id;
    if (!id || !this.context.sequenceRef) fail('eventDayContextRequired');
    const event = this.program.get('sequences', this.context.sequenceRef).eventGroups.find((item) => item.id === id) ?? this.state.reservations.find((item) => item.sequenceRef === this.context.sequenceRef && item.event.id === id)?.event;
    if (!event || kind === 'probability' && event.kind !== 'probability') fail('invalidEventReference');
    return id;
  }
  arguments(use, definition, scope = {}, path = '') {
    const args = [];
    for (const parameter of definition.parameters) {
      const value = use.arguments?.[parameter.id];
      if (value === undefined) fail('missingArgument', { parameter: parameter.name });
      const forwarded = value?.type === 'parameter_reference' ? scope[value.parameter_id] : value;
      let result;
      if (parameter.type === 'variable_reference') {
        if (forwarded?.type !== 'variable_reference') fail('invalidVariableReference');
        const id = this.program.resolve('variables', forwarded.reference_id), node = this.program.get('variables', id);
        if (node.node_type !== 'value' || parameter.value_type !== 'any' && parameter.value_type !== node.value_type) fail('variableReferenceTypeMismatch');
        if (parameter.access !== 'read' && node.read_only) fail('readonlyTarget');
        const supplied = forwarded.access ?? 'read_write';
        if (supplied !== 'read_write' && supplied !== parameter.access) fail('variableReferenceContractMismatch');
        result = { type: 'variable_reference', reference_id: id, access: parameter.access };
      } else if (parameter.type === 'event_reference') result = { type: 'event_reference', event_group_id: this.event(value, scope, parameter.event_kind ?? 'any') };
      else if (parameter.type === 'enum') {
        result = value.type === 'parameter_reference' ? forwarded : value.type === 'constant' ? value.value : value;
        if (!(parameter.options ?? this.program.get('enums', parameter.enum_id).options).some((option) => option.value === result)) fail('invalidEnumArgument');
      } else {
        result = this.operand(value, scope, 0, `${path}/arguments/${parameter.id}`);
        if (typeof result !== parameter.type) fail('argumentTypeMismatch');
      }
      this.diagnostics.note('argument', () => ({ parameter, value: result, path: `${path}/arguments/${parameter.id}` }));
      args.push([parameter.id, result]);
    }
    return Object.fromEntries(args);
  }
}
