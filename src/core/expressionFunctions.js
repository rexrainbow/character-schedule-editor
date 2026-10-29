/** Fixed runtime functions stored alongside environment expression definitions. */
export const expressionBuiltins = ['randomRange', 'randomItem'];
export function addExpressionFunctions(nodes, t = (key) => key) {
  const next = structuredClone(nodes);
  for (const builtin of expressionBuiltins) {
    if (Object.values(next).some((node) => node.source === 'computed' && node.definition?.builtin === builtin)) continue;
    const used = new Set(Object.values(next).filter((node) => node.source === 'computed').map((node) => node.symbol));
    let symbol = builtin, suffix = 2; while (used.has(symbol)) symbol = `${builtin}_${suffix++}`;
    const parameter = (symbol, type, variadic = false) => ({ id: crypto.randomUUID(), symbol, display_name: '', type, ...(variadic ? { variadic: true } : {}) });
    next[crypto.randomUUID()] = { symbol, display_name: '', icon: builtin === 'randomRange' ? 'tabler:calculator|cyan' : 'tabler:dice|purple', source: 'computed', node_type: 'value', scope: 'environment', parent_id: null, order: 0, value_type: builtin === 'randomRange' ? 'number' : 'any', parameters: builtin === 'randomRange' ? [parameter('min', 'number'), parameter('max', 'number')] : [parameter('items', 'any', true)], definition: { kind: 'builtin', builtin } };
  }
  return next;
}

export function expressionParameterErrors(node, path) {
  const parameters = node.parameters ?? [], errors = [], seen = new Set();
  if (!Array.isArray(parameters)) return [{ path: `${path}/parameters`, key: 'invalidDefinition' }];
  const builtin = node.definition?.kind === 'builtin' && node.definition.builtin;
  for (const [index, p] of parameters.entries()) {
    const location = `${path}/parameters/${index}`;
    if (!p || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(p.id ?? '') || seen.has(p.id)) errors.push({ path: location, key: 'duplicateParameter' });
    seen.add(p?.id);
    if (!['number', 'string', 'boolean'].includes(p?.type) && !(builtin === 'randomItem' && p?.type === 'any')) errors.push({ path: location, key: 'invalidDefinition' });
    if (p?.variadic && builtin !== 'randomItem') errors.push({ path: location, key: 'invalidDefinition' });
  }
  if (builtin && (!expressionBuiltins.includes(builtin) || node.scope !== 'environment' || builtin === 'randomRange' && (node.value_type !== 'number' || parameters.length !== 2 || parameters.some((p) => p.type !== 'number' || p.variadic)) || builtin === 'randomItem' && (node.value_type !== 'any' || parameters.length !== 1 || parameters[0]?.type !== 'any' || !parameters[0]?.variadic))) errors.push({ path, key: 'invalidDefinition' });
  return errors;
}
