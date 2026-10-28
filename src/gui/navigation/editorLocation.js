import { builtinTaskDefinitions } from '../../core/builtinTaskModel.js';
import { isComputed, variableScope, expressionScope } from '../../core/operandModel.js';
import { translator } from '../../i18n/index.js';

export const MODE_PAGES = { user: ['days', 'weeks', 'sequences', 'slots', 'operands', 'enums', 'expressions', 'taskMacros'], environment: ['operands', 'enums', 'expressions', 'tasks'], simulation: ['simulation', 'continuousSimulation'] };
const publicPages = { operands: 'variables', taskMacros: 'task-macros', continuousSimulation: 'continuous' };
const pageNames = Object.fromEntries(Object.values(MODE_PAGES).flat().map((page) => [publicPages[page] ?? page, page]));

export function locationItems(draft, mode, page) {
  const visible = (node) => mode !== 'environment' || (isComputed(node) ? expressionScope(node) : variableScope(node)) === 'environment';
  if (page === 'operands' || page === 'expressions') return Object.entries(draft.operandNodes).filter(([, node]) => isComputed(node) === (page === 'expressions') && visible(node)).map(([id, node]) => ({ ...node, id }));
  if (page === 'enums') return Object.entries(draft.enumNodes ?? {}).filter(([, node]) => visible(node)).map(([id, node]) => ({ ...node, id }));
  if (page === 'tasks') return [...draft.tasks, ...builtinTaskDefinitions(draft.builtinTasks, translator('en'))];
  if (page === 'days') return draft.days.filter((day) => day.scope !== 'week_private');
  return draft[page] ?? [];
}

export function defaultLocationItem(draft, mode, page) {
  const items = locationItems(draft, mode, page);
  const scope = mode === 'environment' ? 'environment' : 'application';
  if (page === 'operands') return items.find((item) => variableScope(item) === scope && item.symbol === 'schedule_current_week') ?? items.find((item) => variableScope(item) === scope);
  if (page === 'enums') return items.find((item) => (item.scope ?? 'environment') === scope);
  return items[0];
}

export function parseEditorLocation(hash) {
  if (!hash || hash === '#') return null;
  try {
    const parts = hash.replace(/^#\/?/, '').split('/').map(decodeURIComponent);
    const [mode, pageName, name, events, eventName] = parts, page = pageNames[pageName];
    if (!MODE_PAGES[mode]?.includes(page) || parts.length > 5 || parts.length === 4 || (parts.length === 5 && (page !== 'sequences' || events !== 'events')) || parts.some((part) => !part)) return { invalid: true };
    if (mode === 'simulation' && parts.length !== 2) return { invalid: true };
    return { mode, page, name, eventName };
  } catch { return { invalid: true }; }
}

export function resolveEditorLocation(draft, request) {
  if (!request || request.invalid) return { location: { mode: 'user', page: 'days', id: null }, error: 'invalid' };
  const { mode, page, name, eventName } = request;
  const item = name ? locationItems(draft, mode, page).find((item) => item.symbol === name) : null;
  const location = { mode, page, id: item?.id ?? null };
  if (name && !item) return { location, error: 'missing', name };
  if (eventName) {
    const event = item?.eventGroups?.find((group) => group.symbol === eventName);
    if (!event) return { location, error: 'missing', name: eventName };
    location.eventId = event.id;
  }
  return { location };
}

export function editorLocationHash(draft, { mode, page, id, eventId }) {
  const item = locationItems(draft, mode, page).find((item) => item.id === id);
  const parts = [mode, publicPages[page] ?? page];
  if (item?.symbol) {
    parts.push(item.symbol);
    const event = item.eventGroups?.find((group) => group.id === eventId);
    if (event?.symbol) parts.push('events', event.symbol);
  }
  return '#/' + parts.map(encodeURIComponent).join('/');
}

export const locationIdentity = ({ mode, page, id, eventId }) => JSON.stringify([mode, page, id ?? null, eventId ?? null]);
