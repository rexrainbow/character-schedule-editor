export const numberBounds = (node) => Object.fromEntries(['min_value', 'max_value'].filter((key) => Object.hasOwn(node, key)).map((key) => [key, node[key]]));
export const withinBounds = (node, value) => (!Object.hasOwn(node, 'min_value') || value >= node.min_value) && (!Object.hasOwn(node, 'max_value') || value <= node.max_value);
export function clampVariable(node, value) {
  if (node.value_type !== 'number') return value;
  return Math.min(node.max_value ?? Infinity, Math.max(node.min_value ?? -Infinity, value));
}
export function variableBoundsErrors(node, path, initial) {
  const errors = [];
  for (const [key, value] of Object.entries(numberBounds(node))) {
    if (node.value_type !== 'number' || typeof value !== 'number' || !Number.isFinite(value)) errors.push({ path: `${path}/${key}`, key: 'invalidVariableBound' });
  }
  if (errors.length || node.value_type !== 'number') return errors;
  if (node.min_value > node.max_value) errors.push({ path: `${path}/max_value`, key: 'invalidVariableRange' });
  else if (Number.isFinite(initial) && !withinBounds(node, initial)) errors.push({ path: `${path}/initial_value`, key: 'initialValueOutsideBounds' });
  return errors;
}
