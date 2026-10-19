import useProject from './hooks/useProject.js';
import { editProject } from '../core/projectApi.js';
import EnumDefinitionsEditor from './editors/EnumDefinitionsEditor.jsx';
import { eventCatalog } from '../core/eventReferences.js';
import { countDayReferences } from '../core/sequenceEvents.js';
import NewProjectDialog from './dialogs/NewProjectDialog.jsx';
import SimulationEditor from './editors/SimulationEditor.jsx';
import EnvironmentSettings from './dialogs/EnvironmentSettings.jsx';
import EnvironmentImportDialog from './dialogs/EnvironmentImportDialog.jsx';
import { createEnvironmentInfo, validateEnvironment } from '../core/environmentModel.js';
import { EngineKeysContext, EngineKeyWarning } from './components/EngineKeyField.jsx';
import { engineKeyEntries } from '../core/engineKeyModel.js';

import ExpressionMacrosEditor from './editors/ExpressionMacrosEditor.jsx';
import TaskMacrosEditor from './editors/TaskMacrosEditor.jsx';
import TasksEditor from './editors/TasksEditor.jsx';
import { TaskContext, TaskMacrosContext, BuiltinTasksContext, EventCatalogContext, EnumDefinitionsContext } from './contexts/TaskContext.js';
import OperandsEditor from './editors/OperandsEditor.jsx';
import SlotIcon from './components/SlotIcon.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FolderPlus, GitBranch, Globe2, Layers3, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Upload, X } from 'lucide-react';
import ActionMenu from './components/ActionMenu.jsx';
import { referenceCount, validateDocument } from '../core/model.js';
import { resolveLocale, translator } from '../i18n/index.js';
import { IconButton, Issues, SlotInfo } from './components/ui.jsx';
import SlotEditor from './editors/SlotEditor.jsx';
import DayEditor from './editors/DayEditor.jsx';
import { DayTagFilter, DayTagChips } from './components/DayTags.jsx';
import { matchesDayTag } from '../core/dayTags.js';
import ProjectSettings from './dialogs/ProjectSettings.jsx';
import SlotDialog from './dialogs/SlotDialog.jsx';
import WeekEditor from './editors/WeekEditor.jsx';
import WeekSlotDialog from './dialogs/WeekSlotDialog.jsx';
import DaySelector from './dialogs/DaySelector.jsx';
import SequenceEditor from './editors/SequenceEditor.jsx';
import { dayOverrideReferenceCount, weekSequenceReferenceCount } from '../core/sequenceModel.js';
import { dayReferenceCount, sharedDays } from '../core/weekModel.js';

const MODE_PAGES = { user: ['days', 'weeks', 'sequences', 'slots', 'operands', 'enums', 'expressions', 'taskMacros'], environment: ['operands', 'enums', 'expressions', 'tasks'], simulation: ['simulation'] };

export default function App() {
  const [project, draft] = useProject();
  const engineKeys = useMemo(() => engineKeyEntries(draft), [draft]);
  const [initialized, setInitialized] = useState(false);
  const [settings, setSettings] = useState(null);
  const [mode, setMode] = useState('user');
  const [modeTabs, setModeTabs] = useState({ user: 'days', environment: 'operands', simulation: 'simulation' });
  const [simulation, setSimulation] = useState(null);
  const tab = modeTabs[mode];
  project.setMode(mode);
  const setTab = (page) => setModeTabs((previous) => ({ ...previous, [mode]: page }));
  const EDITOR_PAGES = MODE_PAGES[mode];
  const pageLabel = (page) => t(page === 'operands' ? (mode === 'environment' ? 'environmentVariables' : 'applicationVariables') : page === 'tasks' ? 'taskDefinitions' : page === 'expressions' && mode === 'environment' ? 'environmentExpressions' : page);
  const [editorViews, setEditorViews] = useState({});
  function editorView(page) {
    const key = `${mode}:${page}`;
    return { view: editorViews[key], onViewChange: (update) => setEditorViews((previous) => ({ ...previous, [key]: update(previous[key] ?? {}) })) };
  }
  function resetNavigation() { setDayTagFilter(''); setMode('user'); setModeTabs({ user: 'days', environment: 'operands', simulation: 'simulation' }); setSimulation(null); setEditorViews({}); setWeekHighlight(null); setDayReturn(null); setDayRestore(null); }
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayReturn, setDayReturn] = useState(null);
  const [dayRestore, setDayRestore] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [weekHighlight, setWeekHighlight] = useState(null);
  const [selectedSequence, setSelectedSequence] = useState(null);
  const [dayTagFilter, setDayTagFilter] = useState('');
  const [searches, setSearches] = useState({ slots: '', days: '', weeks: '', sequences: '' });
  const [cellDialog, setCellDialog] = useState(null);
  const [weekCellDialog, setWeekCellDialog] = useState(null);
  const [daySelector, setDaySelector] = useState(null);
  const [preference, setPreference] = useState(() => { try { return localStorage.getItem('schedule-editor-language') || 'system'; } catch { return 'system'; } });
  const [languages, setLanguages] = useState(() => navigator.languages ?? [navigator.language]);
  const locale = resolveLocale(preference, languages);
  const t = useMemo(() => translator(locale), [locale]);
  const [notice, setNotice] = useState(null);
  const [operationIssues, setOperationIssues] = useState([]);
  const [dirty, setDirty] = useState(false);
  const fileInput = useRef(null), environmentInput = useRef(null);
  const [environmentSettings, setEnvironmentSettings] = useState(false);
  const [environmentPreview, setEnvironmentPreview] = useState(null);
  const activeSlot = draft.slots.find((slot) => slot.id === selectedSlot) ?? draft.slots[0];
  const publicDays = sharedDays(draft);
  const returnDay = publicDays.find((day) => day.id === dayReturn?.dayId);
  const activeDay = publicDays.find((day) => day.id === selectedDay) ?? publicDays[0];
  const activeWeek = draft.weeks.find((week) => week.id === selectedWeek) ?? draft.weeks[0];
  const activeSequence = draft.sequences.find((sequence) => sequence.id === selectedSequence) ?? draft.sequences[0];
  const search = searches[tab] ?? '';
  const allItems = tab === 'slots' ? draft.slots : tab === 'days' ? publicDays : tab === 'weeks' ? draft.weeks : draft.sequences;
  const items = allItems.filter((item) => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (tab !== 'days' || matchesDayTag(item, dayTagFilter)));
  const activeItem = tab === 'slots' ? activeSlot : tab === 'days' ? activeDay : tab === 'weeks' ? activeWeek : activeSequence;
  const view = tab === 'slots' ? { search: 'search', add: 'addSlot', empty: 'noSlots', hint: 'noSlotsHint', noResults: 'noResults' }
    : tab === 'days' ? { search: 'searchDays', add: 'addDay', empty: 'noDays', hint: 'noDaysHint', noResults: 'noDayResults' }
      : tab === 'weeks' ? { search: 'searchWeeks', add: 'addWeek', empty: 'noWeeks', hint: 'noWeeksHint', noResults: 'noWeekResults' }
        : { search: 'searchSequences', add: 'addSequence', empty: 'noSequences', hint: 'noSequencesHint', noResults: 'noSequenceResults' };

  useEffect(() => {
    document.documentElement.lang = locale; document.title = t('title');
    try { localStorage.setItem('schedule-editor-language', preference); } catch { /* Optional preference storage. */ }
  }, [locale, preference, t]);
  useEffect(() => {
    const update = () => setLanguages(navigator.languages ?? [navigator.language]);
    window.addEventListener('languagechange', update); return () => window.removeEventListener('languagechange', update);
  }, []);
  useEffect(() => {
    const guard = (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [dirty]);

  function commit(next) {
    if (next === draft) return;
    const revision = project.getRevision();
    const result = project.replaceDraft(next);
    if (!result.ok) { const event = result.errors.find((error) => error.key === 'eventInUse'); if (event) window.alert(t('eventInUse', { count: event.count })); else { setOperationIssues(result.errors); setNotice({ key: 'projectOperationBlocked', error: true }); } return; }
    if (project.getRevision() === revision) return;
    setSimulation((previous) => previous ? { ...previous, result: null } : previous); setDirty(true); setNotice(null); setOperationIssues([]);
  }
  function commitResult(result) { if (!result.ok) { const event = result.errors.find((error) => error.key === 'eventInUse'); if (event) window.alert(t('eventInUse', { count: event.count })); else { setOperationIssues(result.errors); setNotice({ key: 'projectOperationBlocked', error: true }); } return false; } commit(result.draft); return true; }
  function resetSearch() { setSearches({ ...searches, [tab]: '' }); }
  function openReferencedSlot(slot, origin = null) {
    setDayReturn(origin);
    setMode('user');
    setSelectedSlot(slot.id);
    setSearches((previous) => ({ ...previous, slots: '' }));
    setModeTabs((previous) => ({ ...previous, user: 'slots' }));
  }
  function returnToDay() {
    if (!returnDay) return;
    setDayTagFilter(''); setSelectedDay(returnDay.id);
    setDayRestore({ ...dayReturn });
    setDayReturn(null);
    setMode('user');
    setSearches((previous) => ({ ...previous, days: '' }));
    setModeTabs((previous) => ({ ...previous, user: 'days' }));
  }
  function openReferencedDay(day, week, weekday) {
    if (!day) return;
    setMode('user');
    if (day.scope === 'week_private') {
      setSelectedWeek(week.id);
      setSearches((previous) => ({ ...previous, weeks: '' }));
      setWeekHighlight({ weekId: week.id, weekday });
      setModeTabs((previous) => ({ ...previous, user: 'weeks' }));
    } else {
      setDayTagFilter(''); setSelectedDay(day.id);
      setSearches((previous) => ({ ...previous, days: '' }));
      setWeekHighlight(null);
      setModeTabs((previous) => ({ ...previous, user: 'days' }));
    }
  }
  function addItem() {
    if (tab === 'slots') { const result = editProject(draft, t).slots.create({ name: t('newSlot') }); const slot = result.value; commit(result.draft); setSelectedSlot(slot.id); }
    else if (tab === 'days') { setDayTagFilter(''); const result = editProject(draft, t).days.create({ name: t('newDay') }); const day = result.value; commit(result.draft); setSelectedDay(day.id); }
    else if (tab === 'weeks') { const result = editProject(draft, t).weeks.create({ name: t('newWeek') }); const week = result.value; commit(result.draft); setSelectedWeek(week.id); }
    else { const result = editProject(draft, t).sequences.create({ name: t('newSequence') }); const sequence = result.value; commit(result.draft); setSelectedSequence(sequence.id); }
    resetSearch();
  }
  function copySlot() { const result = editProject(draft, t).slots.duplicate(activeSlot.id); const slot = result.value; commit(result.draft); setSelectedSlot(slot.id); resetSearch(); }
  function deleteSlot() {
    if (!window.confirm(t('deleteReferenced', { name: activeSlot.name, count: referenceCount(draft, activeSlot.id) }))) return;
    if (commitResult(editProject(draft, t).slots.remove(activeSlot.id))) setSelectedSlot(null);
  }
  function copyDay() { setDayTagFilter(''); const result = editProject(draft, t).days.duplicate(activeDay.id); const day = result.value; commit(result.draft); setSelectedDay(day.id); resetSearch(); }
  function deleteDay() {
    const countRefs = countDayReferences(draft, activeDay.id);
    if (countRefs.length) { window.alert(t('eventCountDayDeleteBlocked', { count: countRefs.length })); return; }
    const eventCount = draft.sequences.reduce((sum, sequence) => sum + (sequence.eventGroups ?? []).filter((group) => group.dayId === activeDay.id).length, 0);
    const message = t('deleteDayOverrideConfirm', { name: activeDay.name, count: dayReferenceCount(draft, activeDay.id), overrideCount: dayOverrideReferenceCount(draft, activeDay.id) }) + (eventCount ? `\n${t('eventDayDeleteWarning', { count: eventCount })}` : '');
    if (window.confirm(message)) { if (commitResult(editProject(draft, t).days.remove(activeDay.id))) setSelectedDay(null); }
  }
  function copyWeek() { const next = editProject(draft, t).weeks.duplicate(activeWeek.id).draft; commit(next); setSelectedWeek(next.weeks.at(-1).id); resetSearch(); }
  function removeWeek() {
    const result = editProject(draft, t).weeks.remove(activeWeek.id);
    if (!result.ok) { setOperationIssues(result.errors); setNotice({ key: 'projectOperationBlocked', error: true }); return; }
    const next = result.draft;
    const eventCount = draft.sequences.reduce((sum, sequence, index) => sum + (sequence.eventGroups?.length ?? 0) - (next.sequences[index].eventGroups?.length ?? 0), 0);
    const message = t('deleteWeekSequenceConfirm', { name: activeWeek.name, count: weekSequenceReferenceCount(draft, activeWeek.id) }) + (eventCount ? `\n${t('eventGroupsTrimConfirm', { count: eventCount })}` : '');
    if (window.confirm(message)) {
      const adjusted = next.sequences.some((sequence, index) => sequence.endWeekday !== draft.sequences[index].endWeekday);
      commit(next); setSelectedWeek(null);
      if (adjusted) setNotice({ key: 'sequenceRangeAdjusted' });
    }
  }
  function copySequence() { const result = editProject(draft, t).sequences.duplicate(activeSequence.id); const sequence = result.value; commit(result.draft); setSelectedSequence(sequence.id); resetSearch(); }
  function removeSequence() { if (window.confirm(t('deleteSequenceConfirm', { name: activeSequence.name }))) { if (commitResult(editProject(draft, t).sequences.remove(activeSequence.id))) setSelectedSequence(null); } }
  function saveSettings(settings) { if (commitResult(editProject(draft, t).settings.update(settings))) setSettings(null); }
  function createNewProject(next) {
    project.reset(next); setDirty(true); setNotice(null); setOperationIssues([]); setInitialized(true); setSettings(null); setSelectedSlot(null); setSelectedDay(null); setSelectedWeek(null); setSelectedSequence(null);
    resetNavigation(); setSearches({ slots: '', days: '', weeks: '', sequences: '' }); setCellDialog(null); setWeekCellDialog(null); setDaySelector(null);
  }
  function exportEnvironmentFile() {
    const candidate = draft.environment ? draft : { ...draft, environment: createEnvironmentInfo(t('newEnvironment')) };
    const result = editProject(candidate, t).exportEnvironment();
    if (result.errors.length) { setOperationIssues(result.errors); setNotice({ key: 'environmentExportInvalid', error: true, issueTitle: 'errorsForExport' }); return; }
    if (candidate !== draft) commit(candidate);
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'character-schedule-environment.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setOperationIssues([]); setNotice({ key: 'environmentExported' });
  }
  async function importEnvironmentFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      const errors = validateEnvironment(data);
      if (errors.length) { setOperationIssues(errors); setNotice({ key: 'environmentImportInvalid', error: true, issueTitle: 'errorsForImport' }); return; }
      setEnvironmentPreview({ data, result: project.environment.previewImport(data) });
    } catch { setOperationIssues([]); setNotice({ key: 'parseError', error: true }); }
  }
  function newProject() { if (!dirty || window.confirm(t('newProjectConfirm'))) setSettings('new'); }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
      const errors = validateDocument(data);
      if (errors.length) { setOperationIssues(errors); setNotice({ key: 'importInvalid', error: true, issueTitle: 'errorsForImport' }); return; }
      if (dirty && !window.confirm(t('importConfirm'))) return;
      project.loadDocument(data); setSelectedSlot(null); setSelectedDay(null); setSelectedWeek(null); setSelectedSequence(null); setSearches({ slots: '', days: '', weeks: '', sequences: '' }); resetNavigation();
      setInitialized(true); setSettings(null); setCellDialog(null); setWeekCellDialog(null); setDaySelector(null); setEnvironmentSettings(false); setEnvironmentPreview(null); setDirty(false); setOperationIssues([]); setNotice({ key: 'imported' });
    } catch { setOperationIssues([]); setNotice({ key: 'parseError', error: true }); }
  }
  function exportFile() {
    const result = project.toDocument();
    if (result.errors.length) { setOperationIssues(result.errors); setNotice({ key: 'exportInvalid', error: true, issueTitle: 'errorsForExport' }); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'character-schedule.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setDirty(false); setOperationIssues([]); setNotice({ key: 'exported' });
  }
  function exportRuntime() {
    // A runtime artifact cannot restore this project, so keep its dirty state.
    const result = editProject(draft, t).exportRuntime();
    if (result.errors.length) { setOperationIssues(result.errors); setNotice({ key: 'runtimeExportInvalid', error: true, issueTitle: 'errorsForExport' }); return; }
    const url = URL.createObjectURL(new Blob([JSON.stringify(result.data, null, 2) + '\n'], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'character-schedule-runtime.json'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setOperationIssues([]); setNotice({ key: 'runtimeExported' });
  }

  return <EnumDefinitionsContext.Provider value={draft.enumNodes ?? {}}><EventCatalogContext.Provider value={eventCatalog(draft)}><BuiltinTasksContext.Provider value={draft.builtinTasks}><EngineKeysContext.Provider value={engineKeys}><TaskMacrosContext.Provider value={draft.taskMacros}><TaskContext.Provider value={draft.tasks}><div className="app-shell" data-mode={mode}>
    <header className="app-header"><div className="project-identity"><GitBranch size={21} /><h1 title={initialized ? draft.project.name : t('title')}>{initialized ? draft.project.name : t('title')}</h1>{initialized && mode === 'environment' && <span className="environment-badge" title={t('environmentMode')}>{t('environmentBadge')}</span>}{initialized && mode === 'simulation' && <span className="environment-badge simulation-badge" title={t('simulationMode')}>{t('simulationBadge')}</span>}<ActionMenu label={t('projectMenu')} icon={ChevronDown} items={[{ label: t('settings'), icon: Settings2, disabled: !initialized, onClick: () => setSettings('existing') }, { label: t('newProject'), icon: FolderPlus, onClick: newProject }, { separator: true }, { label: t('import'), icon: Upload, onClick: () => fileInput.current.click() }, { label: t('export'), icon: Download, disabled: !initialized, onClick: exportFile }, ...(initialized ? [{ separator: true }, { label: t('userMode'), checked: mode === 'user', onClick: () => setMode('user') }, { label: t('environmentMode'), checked: mode === 'environment', onClick: () => setMode('environment') }, { label: t('simulationMode'), checked: mode === 'simulation', onClick: () => setMode('simulation') }] : [])]} /></div>
      {initialized && <><nav className="header-tabs" aria-label={t('editorPage')}><div role="tablist">{EDITOR_PAGES.map((page) => <button key={page} role="tab" aria-selected={tab === page} onClick={() => setTab(page)}>{pageLabel(page)}</button>)}</div></nav><select className="mobile-page-picker" aria-label={t('editorPage')} value={tab} onChange={(event) => setTab(event.target.value)}>{EDITOR_PAGES.map((page) => <option key={page} value={page}>{pageLabel(page)}</option>)}</select></>}
      <div className="header-actions"><label className="language-picker"><Globe2 size={16} /><select aria-label={t('language')} value={preference} onChange={(e) => setPreference(e.target.value)}><option value="system">{t('system')}</option><option value="zh-TW">繁體中文</option><option value="en">English</option></select></label>
        {initialized && mode === 'environment' && <ActionMenu label={t('environmentActions')} icon={Settings2} items={[{ label: t('environmentSettings'), icon: Settings2, onClick: () => setEnvironmentSettings(true) }, { label: t('importEnvironment'), icon: Upload, onClick: () => environmentInput.current.click() }, { label: t('exportEnvironment'), icon: Download, onClick: exportEnvironmentFile }]} />}
        {initialized && mode === 'user' && <button className="button primary export-button" aria-label={t('exportRuntime')} onClick={exportRuntime}><Download size={17} /><span>{t('exportRuntime')}</span></button>}
        <input className="sr-only" ref={fileInput} type="file" accept=".json,application/json" aria-label={t('import')} onChange={importFile} />
        {initialized && <input className="sr-only" ref={environmentInput} type="file" accept=".json,application/json" aria-label={t('importEnvironment')} onChange={importEnvironmentFile} />}
      </div>
    </header>
    {notice && <div role="status" className={`notice ${notice.error ? 'notice-error' : ''}`}><span>{t(notice.key)}</span><IconButton icon={X} label={t('close')} onClick={() => { setNotice(null); setOperationIssues([]); }} /></div>}
    {operationIssues.length > 0 && <details className="import-issues" open><summary>{t(notice?.issueTitle ?? 'errorsForExport')}</summary><Issues errors={operationIssues} t={t} /></details>}
    {initialized && mode === 'simulation' ? <SimulationEditor onOpenDay={openReferencedDay} onOpenSequence={(sequence) => { setMode('user'); setSelectedSequence(sequence.id); setSearches((previous) => ({ ...previous, sequences: '' })); setModeTabs((previous) => ({ ...previous, user: 'sequences' })); }} draft={draft} session={simulation} onSessionChange={(update) => setSimulation((previous) => ({ ...previous, ...update }))} onOpenSlot={openReferencedSlot} t={t} /> : initialized && tab === 'enums' ? <EnumDefinitionsEditor scope={mode === 'environment' ? 'environment' : 'application'} key={mode} {...editorView('enums')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'expressions' ? <ExpressionMacrosEditor scope={mode === 'environment' ? 'environment' : 'application'} key={mode} {...editorView('expressions')} draft={draft} t={t} onChange={(operandNodes) => commit({ ...draft, operandNodes })} /> : initialized && tab === 'taskMacros' ? <TaskMacrosEditor {...editorView('taskMacros')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'tasks' ? <TasksEditor {...editorView('tasks')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'operands' ? <OperandsEditor {...editorView('operands')} scope={mode === 'environment' ? 'environment' : 'application'} key={mode} draft={draft} t={t} onChange={(operandNodes) => commit({ ...draft, operandNodes })} /> : initialized ? <div className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><aside className="sidebar"><div className="sidebar-heading"><h2><Layers3 size={17} /><span title={t(tab)}>{t(tab)}</span></h2><span className="count">{allItems.length}</span><button type="button" className="icon-button sidebar-toggle" aria-label={t(sidebarCollapsed ? 'expandList' : 'collapseList')} title={t(sidebarCollapsed ? 'expandList' : 'collapseList')} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
      <label className="search-field"><Search size={16} /><input aria-label={t(view.search)} placeholder={t(view.search)} value={search} onChange={(e) => setSearches({ ...searches, [tab]: e.target.value })} /></label>
      {tab === 'days' && <DayTagFilter days={publicDays} value={dayTagFilter} onChange={setDayTagFilter} t={t} />}
      <button className="button add-slot" onClick={addItem}><Plus size={16} />{t(view.add)}</button>
      <div className="slot-list">{items.map((item) => <div key={item.id} className="schedule-list-entry"><button className={`slot-item ${item.id === activeItem?.id ? 'selected' : ''}`} title={item.name} aria-pressed={item.id === activeItem?.id} onClick={() => tab === 'slots' ? setSelectedSlot(item.id) : tab === 'days' ? setSelectedDay(item.id) : tab === 'weeks' ? setSelectedWeek(item.id) : setSelectedSequence(item.id)}>{tab === 'slots' ? <SlotInfo slot={item} t={t} /> : <><SlotIcon name={item.icon} /><div className="slot-info-text"><strong>{item.name || '—'}</strong><EngineKeyWarning kind={tab} id={item.id} value={item.engine_key} t={t} /></div></>}<ChevronRight size={16} /></button>{tab === 'days' && <DayTagChips day={item} onFilter={setDayTagFilter} t={t} />}</div>)}
        {!items.length && <div className="sidebar-empty"><Search size={24} /><strong>{t(search || tab === 'days' && dayTagFilter ? view.noResults : view.empty)}</strong></div>}
      </div></aside><main><div className={`editor-content editor-${tab}`}>
        {tab === 'slots' && activeSlot ? <SlotEditor onOpenMacro={(id) => { setMode('user'); setModeTabs((previous) => ({ ...previous, user: 'taskMacros' })); setEditorViews((previous) => ({ ...previous, 'user:taskMacros': { ...previous['user:taskMacros'], selected: id, search: '' } })); }} onReturnDay={returnDay ? returnToDay : undefined} returnDayName={returnDay?.name} tasks={draft.tasks} operandNodes={draft.operandNodes} slot={activeSlot} t={t} onChange={(slot) => commitResult(editProject(draft, t).slots.replace(slot.id, slot))} onDuplicate={copySlot} onDelete={deleteSlot} />
          : tab === 'days' && activeDay ? <DayEditor days={publicDays} onOpenSlot={openReferencedSlot} restorePosition={dayRestore} day={activeDay} slots={draft.slots} t={t} onChange={(day) => commitResult(editProject(draft, t).days.update(day.id, day))} onDuplicate={copyDay} onDelete={deleteDay} onCell={(index) => setCellDialog({ dayId: activeDay.id, index })} />
            : tab === 'weeks' && activeWeek ? <WeekEditor onOpenDay={openReferencedDay} highlight={weekHighlight} key={activeWeek.id} week={activeWeek} draft={draft} t={t} onChange={(week) => commitResult(editProject(draft, t).weeks.update(week.id, week))} onDuplicate={copyWeek} onDelete={removeWeek} onDay={(weekday) => setDaySelector({ weekId: activeWeek.id, weekday })} onCell={(weekday, index) => setWeekCellDialog({ weekId: activeWeek.id, weekday, index })} />
              : tab === 'sequences' && activeSequence ? <SequenceEditor onSimulateDay={(sequenceId, position) => { setSimulation((previous) => ({ ...previous, target: 'day', sequenceId, position, result: null })); setMode('simulation'); }} onOpenSlot={openReferencedSlot} onOpenDay={openReferencedDay} key={activeSequence.id} draft={draft} sequence={activeSequence} t={t} onChange={(sequence) => commitResult(editProject(draft, t).sequences.update(sequence.id, sequence))} onDuplicate={copySequence} onDelete={removeSequence} />
              : <div className="empty-state"><Layers3 size={40} /><h2>{t(view.empty)}</h2><p>{t(view.hint)}</p><button className="button primary" onClick={addItem}><Plus size={16} />{t(view.add)}</button></div>}
      </div></main></div> : <main className="welcome"><div className="empty-state"><FolderPlus size={40} /><h2>{t('welcome')}</h2><p>{t('welcomeHint')}</p><div className="welcome-actions"><button className="button primary" onClick={() => setSettings('new')}>{t('newProject')}</button><button className="button secondary" onClick={() => fileInput.current.click()}>{t('import')}</button></div></div></main>}
    <footer className="app-footer" title={t('unsaved')}><span>{t('unsaved')}</span></footer>
    {settings === 'existing' && <ProjectSettings draft={draft} t={t} onSave={saveSettings} onClose={() => setSettings(null)} />}
    {settings === 'new' && <NewProjectDialog t={t} onCreate={createNewProject} onClose={() => setSettings(null)} />}
    {environmentSettings && <EnvironmentSettings draft={draft} t={t} onClose={() => setEnvironmentSettings(false)} onSave={(environment, count) => { if (commitResult(editProject(draft, t).environment.update(environment, count))) setEnvironmentSettings(false); }} />}
    {environmentPreview && <EnvironmentImportDialog preview={environmentPreview} current={draft.environment} t={t} onClose={() => setEnvironmentPreview(null)} onApply={() => { const result = project.environment.import(environmentPreview.data); if (!result.ok) { setOperationIssues(result.errors); setNotice({ key: 'environmentImportInvalid', error: true }); return; } setDirty(true); setSimulation((previous) => previous ? { ...previous, result: null } : previous); setOperationIssues([]); setEnvironmentPreview(null); setEditorViews({}); setNotice({ key: 'environmentImported' }); }} />}
    {cellDialog && <SlotDialog draft={draft} day={draft.days.find((day) => day.id === cellDialog.dayId)} index={cellDialog.index} t={t} onCommit={commit} onClose={() => setCellDialog(null)} />}
    {weekCellDialog && <WeekSlotDialog draft={draft} {...weekCellDialog} t={t} onCommit={commit} onClose={() => setWeekCellDialog(null)} />}
    {daySelector && <DaySelector draft={draft} week={draft.weeks.find((week) => week.id === daySelector.weekId)} weekday={daySelector.weekday} t={t} onCommit={commit} onClose={() => setDaySelector(null)} />}
  </div></TaskContext.Provider></TaskMacrosContext.Provider></EngineKeysContext.Provider></BuiltinTasksContext.Provider></EventCatalogContext.Provider></EnumDefinitionsContext.Provider>;
}
