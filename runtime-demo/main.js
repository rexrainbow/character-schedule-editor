import '../src/styles/styles.css';
import './style.css';
import { Program, Runtime } from '../src/runtime/index.js';
import { validateRuntimeDocument } from '../src/core/runtimeModel.js';
import { sequenceExecutionRange, resolveExecutionDate } from '../src/core/sequenceExecution.js';
import { translator, resolveLocale } from '../src/i18n/index.js';
import { builtinTaskDefinitions } from '../src/core/builtinTaskModel.js';
import { messages } from './messages.js';

const $ = (id) => document.getElementById(id);
let locale = resolveLocale('system', navigator.languages), program = null, runtime = null, selected = '', fileName = '';
let busy = false, loading = false, failure = null, groups = [], renderFrame = null;
let variablePage = 0;
const variablePageSize = 10;
const text = (key, args = {}) => Object.entries(args).reduce((value, [name, item]) => value.replaceAll(`{${name}}`, String(item)), messages[locale][key] ?? key);
const node = (tag, content, className) => { const element = document.createElement(tag); element.textContent = content; if (className) element.className = className; return element; };
const sequence = () => program && selected ? program.get('sequences', selected) : null;
const range = () => sequence() ? sequenceExecutionRange(sequence()) : null;
const ended = () => runtime?.status === 'completed' && runtime.getState().execution.position >= range().end;

function taskLabel(record) {
  const external = !record.builtin && program.entries('tasks').map(([, item]) => item).find((item) => item.name === record.name);
  const builtin = record.builtin && builtinTaskDefinitions(program.builtins, translator(locale)).find((item) => item.id === `builtin:${record.builtin}`);
  return { label: external?.display_name || builtin?.display_name || record.name, external: !!external };
}
function taskData(title, value) {
  const section = node('section', '', 'task-data'), fields = node('dl', '');
  section.append(node('h3', title));
  for (const [key, item] of Object.entries(value)) fields.append(node('dt', key), node('dd', JSON.stringify(item)));
  section.append(fields); return section;
}
function renderVariables() {
  const entries = program?.entries('variables').filter(([, item]) => item.node_type === 'value') ?? [];
  const total = Math.max(1, Math.ceil(entries.length / variablePageSize));
  variablePage = Math.min(variablePage, total - 1);
  const container = $('variables');
  $('variable-pages').hidden = entries.length <= variablePageSize;
  $('variable-pages').setAttribute('aria-label', text('variablePages'));
  $('variables-prev').setAttribute('aria-label', text('previousVariables')); $('variables-next').setAttribute('aria-label', text('nextVariables'));
  $('variables-prev').disabled = variablePage === 0; $('variables-next').disabled = variablePage >= total - 1;
  $('variables-page').textContent = text('page', { page: variablePage + 1, total });
  if (!entries.length) { container.replaceChildren(node('p', text(program ? 'noVariables' : 'empty'), 'variables-empty')); return; }
  const values = runtime ? runtime.getState().variables : program.initialValues();
  const table = node('table', ''), head = node('thead', ''), heading = node('tr', ''), body = node('tbody', '');
  for (const title of ['variableName', 'variableValue']) { const cell = node('th', text(title)); cell.scope = 'col'; heading.append(cell); }
  head.append(heading);
  for (const [ref, variable] of entries.slice(variablePage * variablePageSize, (variablePage + 1) * variablePageSize)) {
    const row = node('tr', ''), name = node('th', ''), value = node('td', JSON.stringify(values[ref])); name.scope = 'row'; row.dataset.ref = ref;
    const path = [variable.name], visited = new Set([ref]); let parent = variable.parent_id;
    while (parent && !visited.has(parent)) { visited.add(parent); const group = program.get('variables', parent); path.unshift(group.name); parent = group.parent_id; }
    name.append(node('span', variable.display_name || variable.name), node('code', path.join('.'))); row.append(name, value); body.append(row);
  }
  table.append(head, body); container.replaceChildren(table);
}
function appendTasks(list, group, start = 0) {
  const end = Math.min(start + 200, group.tasks.length);
  for (const record of group.tasks.slice(start, end)) {
    const item = node('li', ''), label = taskLabel(record);
    const heading = node('div', '', 'task-title'); heading.append(node('span', label.label));
    if (label.label !== record.name) heading.append(node('code', record.name));
    if (label.external) heading.append(node('span', text('recorded'), 'recorded'));
    item.append(heading);
    const payloads = node('div', '', 'task-payloads');
    if (Object.keys(record.arguments ?? {}).length) payloads.append(taskData(text('arguments'), record.arguments));
    if (record.result !== undefined) payloads.append(taskData(text('result'), record.result !== null && typeof record.result === 'object' ? record.result : { value: record.result }));
    if (payloads.childElementCount) item.append(payloads);
    list.append(item);
  }
  if (end < group.tasks.length) {
    const row = node('li', ''), button = node('button', text('more', { count: Math.min(200, group.tasks.length - end) }));
    button.type = 'button'; button.addEventListener('click', () => { row.remove(); appendTasks(list, group, end); }); row.append(button); list.append(row);
  }
}
function renderLog() {
  const container = $('log'), scroll = container.scrollTop, atBottom = container.scrollHeight - container.clientHeight - scroll < 32;
  const fragment = document.createDocumentFragment();
  if (!groups.length) fragment.append(node('p', text('empty'), 'empty-log'));
  const t = translator(locale);
  groups.forEach((group, index) => {
    const section = document.createElement('details'); section.className = 'day-entry'; section.open = index === groups.length - 1;
    const summary = document.createElement('summary');
    summary.append(node('strong', text('day', { day: group.date.dayNumber })), node('span', text('date', { week: group.date.weekNumber, weekday: t(group.date.weekday) })), node('span', `${group.tasks.length}`, 'task-count'));
    section.append(summary);
    const content = document.createElement('ol'); let populated = false;
    const populate = () => { if (section.open && !populated) { populated = true; if (group.tasks.length) appendTasks(content, group); else content.append(node('li', text('noTasks'), 'empty-day')); } };
    section.addEventListener('toggle', populate); populate(); section.append(content); fragment.append(section);
  });
  container.replaceChildren(fragment);
  container.scrollTop = atBottom ? container.scrollHeight : scroll;
}
function render() {
  document.documentElement.lang = locale; document.title = `${text('title')} · Character Schedule`;
  document.querySelectorAll('[data-text]').forEach((element) => { element.textContent = text(element.dataset.text); });
  $('language').value = locale; $('language').disabled = busy;
  $('help').disabled = false; $('help-close').disabled = false;
  $('help').setAttribute('aria-label', text('help')); $('help').title = text('help');
  $('file').setAttribute('aria-label', text('load')); $('sequence').setAttribute('aria-label', text('sequence'));
  $('seed').setAttribute('aria-label', text('seed')); $('language').setAttribute('aria-label', text('language'));
  $('file-name').textContent = fileName || text('noFile');
  $('project-name').hidden = !program; $('project-name').textContent = program?.toJSON().display_name || fileName;
  const options = program?.entries('sequences') ?? [];
  $('sequence').replaceChildren(...options.map(([id, item]) => { const option = node('option', item.display_name || item.name); option.value = id; return option; }));
  $('sequence').value = selected;
  $('load').disabled = busy; $('file').disabled = busy; $('sequence').disabled = busy || !!runtime || !options.length; $('seed').disabled = busy || !!runtime;
  $('reset').disabled = busy || !program;
  const failed = runtime?.status === 'failed', finished = ended(), empty = !range()?.totalDays;
  $('run').textContent = text(busy && !loading ? 'running' : failed ? 'failed' : finished ? 'ended' : runtime ? 'next' : 'first');
  $('run').disabled = busy || !program || empty || failed || finished;
  $('log').setAttribute('aria-busy', String(busy && !loading));
  $('status').textContent = text(loading ? 'loading' : busy ? 'running' : failed ? 'failed' : finished ? 'ended' : !program ? 'noFile' : !options.length ? 'noSequence' : empty ? 'emptySequence' : groups.length ? 'done' : 'ready', { day: groups.at(-1)?.date.dayNumber ?? 1, count: groups.at(-1)?.tasks.length ?? 0 });
  $('error').hidden = !failure;
  $('error').textContent = failure ? `${text(failure.key)} ${failure.detail}` : '';
  renderLog(); renderVariables();
}
async function loadFile(file) {
  if (!file || busy) return;
  busy = true; loading = true; failure = null; render();
  try {
    const data = JSON.parse(await file.text()), issues = validateRuntimeDocument(data);
    if (issues.length) throw new Error(issues.slice(0, 3).map((issue) => `${issue.path}: ${issue.key}`).join('; '));
    const next = Program.fromJSON(data), options = next.entries('sequences');
    program = next; selected = options.find(([, item]) => sequenceExecutionRange(item).totalDays > 0)?.[0] ?? options[0]?.[0] ?? '';
    fileName = file.name; runtime = null; groups = []; variablePage = 0;
  } catch (error) { failure = { key: 'loadError', detail: error.message }; }
  finally { busy = false; loading = false; $('file').value = ''; render(); }
}
async function runDay() {
  if (busy || !program || !selected || !range().totalDays || ended() || runtime?.status === 'failed') return;
  busy = true; failure = null;
  if (!runtime) {
    runtime = new Runtime({ program, seed: $('seed').value, unhandledTasks: 'record', diagnostics: false });
    runtime.on('task.completed', (record) => {
      groups.at(-1).tasks.push(record);
      if (renderFrame === null) renderFrame = requestAnimationFrame(() => { renderFrame = null; renderLog(); renderVariables(); });
    });
  }
  const execution = runtime.getState().execution, position = execution ? execution.position + 1 : range().start;
  groups.push({ date: resolveExecutionDate(sequence(), position), tasks: [] }); render();
  try { if (execution) await runtime.nextDay(); else await runtime.runDay({ sequence: selected }); }
  catch (error) { failure = { key: 'runError', detail: error.code ?? error.message }; }
  finally { if (renderFrame !== null) cancelAnimationFrame(renderFrame); renderFrame = null; busy = false; render(); }
}
$('load').addEventListener('click', () => $('file').click());
$('file').addEventListener('change', () => loadFile($('file').files[0]));
$('run').addEventListener('click', runDay);
$('reset').addEventListener('click', () => { if (busy) return; runtime = null; groups = []; failure = null; variablePage = 0; render(); });
$('variables-prev').addEventListener('click', () => { variablePage = Math.max(0, variablePage - 1); renderVariables(); });
$('variables-next').addEventListener('click', () => { variablePage++; renderVariables(); });
$('sequence').addEventListener('change', () => { selected = $('sequence').value; failure = null; render(); });
$('language').addEventListener('change', () => { locale = $('language').value; render(); });
$('help').addEventListener('click', () => { $('help-dialog').showModal(); $('help-close').focus(); });
$('help-close').addEventListener('click', () => $('help-dialog').close());
$('help-dialog').addEventListener('close', () => $('help').focus());
// Keep keyboard access to the scrollable content and Close inside the modal.
$('help-dialog').addEventListener('keydown', (event) => {
  if (event.key !== 'Tab') return;
  const items = [$('help-dialog').querySelector('.help-body'), $('help-close')], index = items.indexOf(document.activeElement);
  event.preventDefault(); items[(index + (event.shiftKey ? -1 : 1) + items.length) % items.length].focus();
});
render();
