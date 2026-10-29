import { sequenceRepeatErrors } from '../core/sequenceExecution.js';
import { compileProject, projectToDraft } from '../core/model.js';
import { normalizeSymbols } from '../core/symbols.js';
import { resolveDraftEnums } from '../core/enumParameters.js';
import { copy, fail, freeze, fingerprint, jsonCopy } from './utils.js';

const collections = ['variables', 'expressions', 'enums', 'tasks', 'macros', 'slots', 'days', 'weeks', 'sequences'];
const clean = (value) => {
  if (Array.isArray(value)) return value.map(clean);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => item !== undefined && !key.startsWith('_') && !['icon', 'description', 'uid'].includes(key)).map(([key, item]) => [key, clean(item)]));
};

/** Immutable executable definition, independent of handlers, listeners and run state. */
export class Program {
  #data;
  constructor(data) {
    if (data?.format !== 'schedule-runtime-program' || !['uuid', 'name'].includes(data.referenceMode)) fail('invalidRuntimeProgram');
    this.#data = freeze(jsonCopy(data));
    for (const key of collections) if (!data[key] || Array.isArray(data[key])) fail('invalidRuntimeProgram', { collection: key });
    if (!Number.isSafeInteger(data.settings?.slots_per_day) || data.settings.slots_per_day < 1 || !data.builtins || Array.isArray(data.builtins)) fail('invalidRuntimeProgram');
    this.referenceMode = data.referenceMode;
    this.id = fingerprint(data);
    this.settings = this.#data.settings;
    this.#checkReferences();
    Object.freeze(this);
  }
  static fromJSON(data) { return new Program(data); }
  static fromProject(input, { referenceMode = 'uuid' } = {}) {
    if (!['uuid', 'name'].includes(referenceMode)) fail('invalidReferenceMode');
    let draft = Array.isArray(input?.slots) ? normalizeSymbols(input) : projectToDraft(input);
    const checked = compileProject(draft);
    if (checked.errors.length) fail('invalidProject', { issues: checked.errors });
    draft = resolveDraftEnums(draft);
    const source = {
      variables: Object.entries(draft.operandNodes).filter(([, node]) => node.source !== 'computed').map(([id, node]) => ({ ...node, id })),
      expressions: Object.entries(draft.operandNodes).filter(([, node]) => node.source === 'computed').map(([id, node]) => ({ ...node, id })),
      enums: Object.entries(draft.enumNodes).map(([id, node]) => ({ ...node, id })),
      tasks: draft.tasks, macros: draft.taskMacros, slots: draft.slots, days: draft.days, weeks: draft.weeks, sequences: draft.sequences,
    };
    const ids = Object.fromEntries(collections.map((key) => [key, new Map(source[key].map((item) => [item.id, referenceMode === 'uuid' ? item.id : item.symbol]))]));
    const events = new Map(draft.sequences.flatMap((sequence) => (sequence.eventGroups ?? []).map((event) => [event.id, referenceMode === 'uuid' ? event.id : event.symbol])));
    const ref = (kind, id) => id == null ? id : ids[kind].get(id) ?? fail('missingReference', { kind, ref: id });
    function transform(value, local = new Map()) {
      if (Array.isArray(value)) return value.map((item) => transform(item, local));
      if (!value || typeof value !== 'object') return value;
      const output = {};
      for (const [key, item] of Object.entries(value)) {
        if (item === undefined || key.startsWith('_') || ['uid', 'icon', 'description', 'symbol'].includes(key)) continue;
        if (['reference_id', 'target_variable_id'].includes(key)) output[key] = ref('variables', item);
        else if (key === 'expression_macro_id') output[key] = ref('expressions', item);
        else if (key === 'parameter_id') output[key] = local.get(item) ?? fail('missingParameter', { ref: item });
        else if (key === 'task_id') output[key] = ref('tasks', item);
        else if (key === 'task_macro_id') output[key] = ref('macros', item);
        else if (key === 'event_group_id') output[key] = events.get(item) ?? fail('missingEvent', { ref: item });
        else if (key === 'enum_id') output[key] = ref('enums', item);
        else if (key === 'day_schedule_id') output[key] = ref('days', item);
        else if (key === 'arguments') {
          const target = source[value.expression_macro_id ? 'expressions' : value.task_macro_id ? 'macros' : 'tasks'].find((owner) => owner.id === (value.expression_macro_id ?? value.task_macro_id ?? value.task_id));
          const parameters = new Map((target?.parameters ?? []).map((p) => [p.id, referenceMode === 'uuid' ? p.id : p.symbol]));
          output.arguments = Object.fromEntries(Object.entries(item).map(([id, arg]) => [parameters.get(id) ?? fail('missingParameter', { ref: id }), transform(arg, local)]));
        } else output[key] = transform(item, local);
      }
      return output;
    }
    const data = { format: 'schedule-runtime-program', referenceMode, settings: copy(draft.project.settings), builtins: clean(draft.builtinTasks ?? {}) };
    for (const kind of collections) data[kind] = Object.fromEntries(source[kind].map((item) => {
      const local = new Map((item.parameters ?? []).map((p) => [p.id, referenceMode === 'uuid' ? p.id : p.symbol]));
      const result = transform(item, local);
      result.name = item.symbol; result.display_name = ['slots', 'days', 'weeks', 'sequences'].includes(kind) ? item.name : item.display_name;
      delete result.symbol; delete result.id;
      if (item.parameters) result.parameters = item.parameters.map((p) => ({ ...transform(p, local), id: local.get(p.id), name: p.symbol }));
      if (kind === 'variables') result.parent_id = ref('variables', item.parent_id);
      if (kind === 'enums') result.parent_id = ref('enums', item.parent_id);
      if (['slots', 'macros'].includes(kind)) for (const key of ['steps', 'candidates']) result[key]?.forEach((entry, index) => { entry.id = referenceMode === 'name' ? `${key}_${index}` : item[key][index].id; });
      if (kind === 'days') {
        result.slotIds = item.slotIds.map((id) => ref('slots', id));
        for (const key of ['dayStartId', 'dayEndId']) if (item[key] !== undefined) result[key] = ref('slots', item[key]);
        if (item.slotEvents) result.slotEvents = item.slotEvents.map((event) => Object.fromEntries(Object.entries(event).map(([key, id]) => [key, ref('slots', id)])));
        if (item.owner) result.owner = { ...item.owner, week_schedule_id: ref('weeks', item.owner.week_schedule_id) };
      }
      if (kind === 'weeks') result.days = Object.fromEntries(Object.entries(item.days).map(([day, id]) => [day, ref('days', id)]));
      if (kind === 'sequences') {
        result.rows = item.rows.map((row, index) => ({ uid: `row_${index}`, repeatCount: row.repeatCount === undefined ? 1 : row.repeatCount, weekId: ref('weeks', row.weekId), overrides: Object.fromEntries(Object.entries(row.overrides ?? {}).map(([day, id]) => [day, ref('days', id)])) }));
        result.eventGroups = (item.eventGroups ?? []).map((event) => ({ ...transform(event), id: events.get(event.id), name: event.symbol, display_name: event.display_name, dayId: event.dayId ? ref('days', event.dayId) : '', ...(event.dayCandidates ? { dayCandidates: event.dayCandidates.map((candidate) => ({ ...candidate, dayId: ref('days', candidate.dayId) })) } : {}) }));
      }
      return [ref(kind, item.id), clean(result)];
    }));
    return new Program(data);
  }
  toJSON() { return copy(this.#data); }
  entries(kind) { if (!collections.includes(kind)) fail('unknownCollection', { kind }); return Object.entries(this.#data[kind]); }
  get(kind, ref) { const item = Object.hasOwn(this.#data[kind] ?? {}, ref) ? this.#data[kind][ref] : null; if (!item) fail('missingReference', { kind, ref }); return item; }
  resolve(kind, ref) {
    if (Object.hasOwn(this.#data[kind] ?? {}, ref)) return ref;
    const items = this.entries(kind).filter(([, item]) => item.name === ref);
    if (items.length !== 1) fail('unknownName', { kind, ref });
    return items[0][0];
  }
  get builtins() { return this.#data.builtins; }
  initialValues() { return Object.fromEntries(this.entries('variables').filter(([, node]) => node.node_type === 'value').map(([id, node]) => [id, node.initial_value ?? (node.value_type === 'number' ? 0 : node.value_type === 'boolean' ? false : '')])); }
  asSchedule() {
    const entities = (kind) => this.entries(kind).map(([id, item]) => ({ ...item, id, symbol: item.name, name: item.display_name || item.name }));
    return { project: { settings: this.settings }, days: entities('days'), weeks: entities('weeks'), sequences: entities('sequences') };
  }
  #checkReferences() {
    const eventIds = new Set(this.entries('sequences').flatMap(([, sequence]) => (sequence.eventGroups ?? []).map((event) => event.id)));
    const walk = (value, parameters = new Set()) => {
      if (!value || typeof value !== 'object') return;
      const fields = { reference_id: 'variables', target_variable_id: 'variables', expression_macro_id: 'expressions', task_id: 'tasks', task_macro_id: 'macros', enum_id: 'enums', day_schedule_id: 'days' };
      for (const [key, item] of Object.entries(value)) {
        if (fields[key]) this.get(fields[key], item);
        if (key === 'parameter_id' && !parameters.has(item)) fail('missingParameter', { ref: item });
        if (key === 'event_group_id' && !eventIds.has(item)) fail('missingEvent', { ref: item });
        walk(item, parameters);
      }
    };
    for (const kind of collections) {
      const names = new Set();
      for (const [ref, item] of this.entries(kind)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.name ?? '') || names.has(item.name) || this.referenceMode === 'name' && ref !== item.name) fail('invalidRuntimeProgram', { kind });
        names.add(item.name);
        const parameters = new Set((item.parameters ?? []).map((p) => p.id));
        if (parameters.size !== (item.parameters?.length ?? 0)) fail('duplicateParameter');
        walk(item, parameters);
      }
    }
    for (const [, day] of this.entries('days')) {
      if (day.slotIds.length !== this.settings.slots_per_day) fail('invalidDaySlots');
      for (const id of [...day.slotIds, day.dayStartId, day.dayEndId, ...(day.slotEvents ?? []).flatMap((e) => Object.values(e))]) if (id != null) this.get('slots', id);
    }
    for (const [, week] of this.entries('weeks')) for (const id of Object.values(week.days)) if (id != null) this.get('days', id);
    for (const [, sequence] of this.entries('sequences')) { if (sequenceRepeatErrors(sequence).length) fail('invalidWeekRepeat'); }
    for (const [, sequence] of this.entries('sequences')) for (const row of sequence.rows) { this.get('weeks', row.weekId); for (const id of Object.values(row.overrides)) if (id != null) this.get('days', id); }
  }
}
