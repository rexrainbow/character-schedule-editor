import { translator } from '../i18n/index.js';

const defaults = new Map();
export function usesDefaultBuiltinLabel(item, key, identity) {
  const value = item?.display_name;
  if (typeof value !== 'string') return value == null;
  if (!value.trim() || value === item?._fallbackValue || value === item?.symbol || value === identity || value === key) return true;
  if (!defaults.has(key)) defaults.set(key, ['en', 'zh-TW'].map((locale) => translator(locale)(key)));
  return defaults.get(key).includes(value);
}
export const builtinLabel = (item, key, t, identity) => usesDefaultBuiltinLabel(item, key, identity) ? t(key) : item.display_name;
export const expressionParameterRole = (builtin, index) => builtin === 'randomRange' ? ['min', 'max'][index] : 'items';

/** UI-only labels. Existing fallback markers keep translations out of saved metadata. */
export function localizeExpressionFunctions(nodes, t) {
  const next = { ...nodes };
  for (const [id, node] of Object.entries(nodes)) {
    const builtin = node.definition?.kind === 'builtin' && node.definition.builtin;
    if (!['randomRange', 'randomItem'].includes(builtin)) continue;
    const key = `expressionFunction_${builtin}`, label = builtinLabel(node, key, t, builtin);
    next[id] = { ...node, ...(usesDefaultBuiltinLabel(node, key, builtin) ? { display_name: label, _fallbackValue: label } : {}), parameters: (node.parameters ?? []).map((p, index) => {
      const role = expressionParameterRole(builtin, index), key = `expressionParam_${role}`;
      if (!usesDefaultBuiltinLabel(p, key, role)) return p;
      const label = t(key); return { ...p, display_name: label, _fallbackValue: label };
    }) };
  }
  return next;
}
