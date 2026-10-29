// A closed expression language. Never executes JavaScript or arbitrary property access.
export class BlueprintError extends Error {
  constructor(message, path = '') { super(message); this.code = 'invalidBlueprint'; this.path = path; }
}
export function parseExpression(source, resolve, { condition = false, path = '', parametersOf = () => [] } = {}) {
  const fail = (message) => { throw new BlueprintError(message, path); };
  if (typeof source !== 'string' || !source.trim() || source.length > 16000) fail('Expected an expression string of 1–16000 characters.');
  const tokens = []; let offset = 0;
  while (offset < source.length) {
    if (/\s/.test(source[offset])) { offset++; continue; }
    const rest = source.slice(offset);
    const match = /^(?:"(?:[^"\\]|\\[\s\S])*"|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|==|!=|<=|>=|&&|\|\||[()+*/<>,\-])/.exec(rest);
    if (!match) fail(`Unexpected character at column ${offset + 1}.`);
    tokens.push(match[0]); offset += match[0].length;
    if (tokens.length > 4000) fail('Expression token limit exceeded.');
  }
  let index = 0, depth = 0;
  const precedence = { or: 1, '||': 1, and: 2, '&&': 2, '==': 3, '!=': 3, '<': 3, '<=': 3, '>': 3, '>=': 3, '+': 4, '-': 4, '*': 5, '/': 5 };
  const isCondition = (value) => value?.kind === 'comparison' || value?.kind === 'group';
  function asCondition(value) { return isCondition(value) ? value : { kind: 'comparison', operand_a: value, comparator: '==', operand_b: { type: 'constant', value: true } }; }
  function scalar(value) { if (isCondition(value)) fail('A condition cannot be used as a scalar operand; reference a Boolean expression macro.'); return value; }
  function take(expected) { if (tokens[index++] !== expected) fail(`Expected ${expected} near token ${index}.`); }
  function expression(min = 0) {
    if (++depth > 64) fail('Expression nesting limit exceeded.');
    let token = tokens[index++], left;
    if (token === '(') { left = expression(); take(')'); }
    else if (token === '-') {
      const right = scalar(expression(6));
      left = right.type === 'constant' && typeof right.value === 'number' ? { type: 'constant', value: -right.value } : { type: 'expression', operator: '-', operand_a: { type: 'constant', value: 0 }, operand_b: right };
    } else if (token === 'ALL' || token === 'ANY') {
      take('('); const items = [asCondition(expression())];
      while (tokens[index] === ',') { index++; items.push(asCondition(expression())); }
      take(')'); left = { kind: 'group', mode: token, items };
    } else if (token === 'event') {
      take('('); const event = tokens[index++]; take(','); const property = tokens[index++]; take(')');
      let name, prop; try { name = JSON.parse(event); prop = JSON.parse(property); } catch { fail('event() requires two JSON string literals.'); }
      if (typeof name !== 'string' || typeof prop !== 'string') fail('event() requires two JSON string literals.');
      if (!['probability_percent', 'cooldown_days', 'cooldown_remaining'].includes(prop)) fail('Unknown event property.');
      left = { type: 'event_property', event: name === '@current' ? { type: 'current_event_reference' } : name.startsWith('@param:') ? { type: 'parameter_reference', parameter_id: resolve('params', name.slice(7), path) } : { type: 'event_reference', event_group_id: resolve('events', name, path) }, property: prop };
    } else if (token === 'true' || token === 'false') left = { type: 'constant', value: token === 'true' };
    else if (token?.startsWith('"')) { try { left = { type: 'constant', value: JSON.parse(token) }; } catch { fail('Invalid JSON string literal.'); } }
    else if (/^(?:\d|\.)/.test(token ?? '')) {
      const value = Number(token); if (!Number.isFinite(value)) fail('Number must be finite.'); left = { type: 'constant', value };
    } else {
      const match = /^(vars|expr|params)\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(token ?? '');
      if (!match) fail(`Unknown expression token ${token ?? '<end>'}. Use vars.*, expr.* or params.*.`);
      const [, namespace, name] = match, id = resolve(namespace, name, path);
      if (namespace === 'expr' && tokens[index] === '(') {
        take('('); const args = [];
        if (tokens[index] !== ')') { args.push(scalar(expression())); while (tokens[index] === ',') { index++; args.push(scalar(expression())); } }
        take(')'); const parameters = parametersOf(name), arguments_ = {}; let position = 0;
        for (const p of parameters) { if (p.variadic) { arguments_[p.id] = args.slice(position); position = args.length; } else arguments_[p.id] = args[position++]; }
        if (position !== args.length || parameters.some((p) => p.variadic ? !arguments_[p.id].length : arguments_[p.id] === undefined)) fail(`Wrong argument count for ${name}.`);
        left = { type: 'expression_macro_reference', expression_macro_id: id, arguments: arguments_ };
      } else left = namespace === 'vars' ? { type: 'reference', reference_id: id } : namespace === 'expr' ? { type: 'expression_macro_reference', expression_macro_id: id } : { type: 'parameter_reference', parameter_id: id };
    }
    while (precedence[tokens[index]] !== undefined && precedence[tokens[index]] >= min) {
      const operator = tokens[index++], right = expression(precedence[operator] + 1);
      if (['and', 'or', '&&', '||'].includes(operator)) left = { kind: 'group', mode: ['and', '&&'].includes(operator) ? 'ALL' : 'ANY', items: [asCondition(left), asCondition(right)] };
      else if (['==', '!=', '<', '<=', '>', '>='].includes(operator)) left = { kind: 'comparison', operand_a: scalar(left), comparator: operator, operand_b: scalar(right) };
      else left = { type: 'expression', operator, operand_a: scalar(left), operand_b: scalar(right) };
    }
    depth--; return left;
  }
  const result = expression(); if (index !== tokens.length) fail(`Unexpected token ${tokens[index]}.`);
  return condition ? asCondition(result) : scalar(result);
}

export function formatExpression(value, symbol) {
  if (value.kind === 'group') return `${value.mode}(${value.items.map((item) => formatExpression(item, symbol)).join(', ')})`;
  if (value.kind === 'comparison') return `(${formatExpression(value.operand_a, symbol)} ${value.comparator} ${formatExpression(value.operand_b, symbol)})`;
  if (value.type === 'constant') return JSON.stringify(value.value);
  if (value.type === 'expression') return `(${formatExpression(value.operand_a, symbol)} ${value.operator} ${formatExpression(value.operand_b, symbol)})`;
  if (value.type === 'reference') return `vars.${symbol('vars', value.reference_id)}`;
  if (value.type === 'expression_macro_reference') {
    const name = `expr.${symbol('expr', value.expression_macro_id)}`;
    if (value.arguments === undefined) return name;
    const args = symbol('expression_parameters', value.expression_macro_id).flatMap((p) => p.variadic ? value.arguments[p.id] : [value.arguments[p.id]]);
    return `${name}(${args.map((arg) => formatExpression(arg, symbol)).join(', ')})`;
  }
  if (value.type === 'parameter_reference') return `params.${symbol('params', value.parameter_id)}`;
  if (value.type === 'event_property') {
    const event = value.event.type === 'current_event_reference' ? '@current' : value.event.type === 'parameter_reference' ? `@param:${symbol('params', value.event.parameter_id)}` : symbol('events', value.event.event_group_id);
    return `event(${JSON.stringify(event)}, ${JSON.stringify(value.property)})`;
  }
  throw new BlueprintError(`Unsupported operand ${value.type}.`);
}
