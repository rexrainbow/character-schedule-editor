import AppNotice from './components/AppNotice.jsx';
import ContinuousSimulationEditor from './editors/ContinuousSimulationEditor.jsx';
import { scheduledDayReferences } from '../core/scheduledEvents.js';
import { eventDayIds } from '../core/eventDaySource.js';
import { dayUses, DAY_USES, matchesDayUse } from '../core/dayUses.js';
import DayListOptions from './components/DayListOptions.jsx';
import { DayUseChips } from './components/DayUses.jsx';
import useProject from './hooks/useProject.js';
import useEditorLocation from './hooks/useEditorLocation.js';
import { MODE_PAGES, editorLocationHash, defaultLocationItem, locationItems } from './navigation/editorLocation.js';
import { NavigationContext } from './navigation/NavigationContext.js';
import ConnectionStatus from './components/ConnectionStatus.jsx';
import ServerFileDialog from './dialogs/ServerFileDialog.jsx';
import { ProjectConnectionContext } from './contexts/ProjectConnectionContext.js';
import ReportExportDialog from './dialogs/ReportExportDialog.jsx';
import { editProject } from '../core/projectApi.js';
import { importBlueprint } from '../core/blueprint/index.js';
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
import { TaskContext, TaskMacrosContext, BuiltinTasksContext, EventCatalogContext, EnumDefinitionsContext, ScheduleDraftContext } from './contexts/TaskContext.js';
import OperandsEditor from './editors/OperandsEditor.jsx';
import SlotIcon from './components/SlotIcon.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Download, FolderPlus, GitBranch, Globe2, Layers3, Link, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Upload } from 'lucide-react';
import ActionMenu from './components/ActionMenu.jsx';
import { referenceCount, validateDocument } from '../core/model.js';
import { resolveLocale, translator } from '../i18n/index.js';
import { Dialog, Issues, SlotInfo } from './components/ui.jsx';
import SlotEditor from './editors/SlotEditor.jsx';
import DayEditor from './editors/DayEditor.jsx';
import { DayTagChips } from './components/DayTags.jsx';
import { matchesDayTag } from '../core/dayTags.js';
import ProjectSettings from './dialogs/ProjectSettings.jsx';
import SlotDialog from './dialogs/SlotDialog.jsx';
import WeekEditor from './editors/WeekEditor.jsx';
import WeekSlotDialog from './dialogs/WeekSlotDialog.jsx';
import DaySelector from './dialogs/DaySelector.jsx';
import SequenceEditor from './editors/SequenceEditor.jsx';
import { dayOverrideReferenceCount, weekSequenceReferenceCount } from '../core/sequenceModel.js';
import { dayReferenceCount, sharedDays } from '../core/weekModel.js';

export default function App() {
  const [project, draft, connection] = useProject();
  const [serverFileDialog, setServerFileDialog] = useState(null);
  const engineKeys = useMemo(() => engineKeyEntries(draft), [draft]);
  const [initialized, setInitialized] = useState(false);
  const [settings, setSettings] = useState(null);
  const [reportDialog, setReportDialog] = useState(false);
  const [mode, setMode] = useState('user');
  const [modeTabs, setModeTabs] = useState({ user: 'days', environment: 'operands', simulation: 'simulation' });
  const [simulation, setSimulation] = useState(null);
  const [continuousSimulation, setContinuousSimulation] = useState({});
  useEffect(() => { setContinuousSimulation((previous) => ({ ...previous, result: null })); }, [draft]);
  const tab = modeTabs[mode];
  project.setMode(mode);
  const setTab = (page) => { navigation.refresh(); setModeTabs((previous) => ({ ...previous, [mode]: page })); };
  const EDITOR_PAGES = MODE_PAGES[mode];
  const SimulationView = tab === 'continuousSimulation' ? ContinuousSimulationEditor : SimulationEditor;
  const pageLabel = (page) => t(page === 'operands' ? (mode === 'environment' ? 'environmentVariables' : 'applicationVariables') : page === 'tasks' ? 'taskDefinitions' : page === 'expressions' && mode === 'environment' ? 'environmentExpressions' : page);
  const [editorViews, setEditorViews] = useState({});
  const [sequenceEvent, setSequenceEvent] = useState(null);
  const [routeEpoch, setRouteEpoch] = useState(0);
  const [routeError, setRouteError] = useState(null);
  function editorView(page) {
    const key = `${mode}:${page}`;
    return { view: editorViews[key], onViewChange: (update) => { navigation.refresh(); setEditorViews((previous) => ({ ...previous, [key]: update(previous[key] ?? {}) })); } };
  }
  function resetNavigation() { setDayTagFilter(''); setDayUseFilter(''); setCollapsedDayUses([]); setMode('user'); setModeTabs({ user: 'days', environment: 'operands', simulation: 'simulation' }); setSimulation(null); setContinuousSimulation({}); setEditorViews({}); setWeekHighlight(null); setDayReturn(null); setDayRestore(null); setCandidateView(null); setSequenceEvent(null); }
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayReturn, setDayReturn] = useState(null);
  const [dayRestore, setDayRestore] = useState(null);
  const [candidateView, setCandidateView] = useState(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const [weekHighlight, setWeekHighlight] = useState(null);
  const [selectedSequence, setSelectedSequence] = useState(null);
  const [dayTagFilter, setDayTagFilter] = useState('');
  const [dayUseFilter, setDayUseFilter] = useState('');
  const [dayListView, setDayListView] = useState('grouped');
  const [collapsedDayUses, setCollapsedDayUses] = useState([]);
  const uses = useMemo(() => dayUses(draft), [draft]);
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
  const projectDirty = connection ? !!(connection.dirty || connection.localChanges || connection.pending) : dirty;
  const fileInput = useRef(null), environmentInput = useRef(null);
  const [environmentSettings, setEnvironmentSettings] = useState(false);
  const [environmentPreview, setEnvironmentPreview] = useState(null);
  const activeSlot = draft.slots.find((slot) => slot.id === selectedSlot) ?? draft.slots[0];
  const publicDays = sharedDays(draft);
  const returnDay = publicDays.find((day) => day.id === dayReturn?.dayId);
  const activeDay = publicDays.find((day) => day.id === selectedDay) ?? publicDays[0];
  const activeWeek = draft.weeks.find((week) => week.id === selectedWeek) ?? draft.weeks[0];
  const activeSequence = draft.sequences.find((sequence) => sequence.id === selectedSequence) ?? draft.sequences[0];
  const locationSelection = ['slots', 'days', 'weeks', 'sequences'].includes(tab)
    ? ({ slots: activeSlot, days: activeDay, weeks: activeWeek, sequences: activeSequence })[tab]?.id
    : mode === 'simulation' ? null : editorViews[`${mode}:${tab}`]?.selected ?? defaultLocationItem(draft, mode, tab)?.id;
  const currentLocation = { mode, page: tab, id: locationSelection ?? null, ...(tab === 'sequences' && sequenceEvent?.sequenceId === activeSequence?.id ? { eventId: sequenceEvent.id } : {}) };
  const locationDefinition = locationItems(draft, mode, tab).find((item) => item.id === locationSelection);
  const locationObject = currentLocation.eventId ? locationDefinition?.eventGroups?.find((group) => group.id === currentLocation.eventId) : locationDefinition;
  const locationName = (locationObject?.display_name ?? locationObject?.name) || locationObject?.symbol;
  function applyLocation(location) {
    setMode(location.mode); setModeTabs((previous) => ({ ...previous, [location.mode]: location.page }));
    const select = { slots: setSelectedSlot, days: setSelectedDay, weeks: setSelectedWeek, sequences: setSelectedSequence }[location.page];
    if (select) select(location.id);
    else setEditorViews((previous) => ({ ...previous, [`${location.mode}:${location.page}`]: { ...previous[`${location.mode}:${location.page}`], selected: location.id, search: '' } }));
    setSearches((previous) => ({ ...previous, [location.page]: '' }));
    setDayTagFilter(''); setDayUseFilter(''); setCollapsedDayUses([]);
    setSequenceEvent(location.eventId ? { sequenceId: location.id, id: location.eventId } : null);
    setDayReturn(null); setDayRestore(null); setCandidateView(null); setWeekHighlight(null);
    setSettings(null); setCellDialog(null); setWeekCellDialog(null); setDaySelector(null); setReportDialog(false); setEnvironmentSettings(false); setEnvironmentPreview(null); setServerFileDialog(null);
    setRouteEpoch((value) => value + 1);
  }
  const navigation = useEditorLocation({ ready: initialized, draft, current: currentLocation, apply: applyLocation, onError: setRouteError });
  async function copyEditorLink(eventId) {
    const url = new URL(window.location.href);
    url.hash = editorLocationHash(draft, { ...currentLocation, ...(typeof eventId === 'string' ? { eventId } : {}) });
    try { await navigator.clipboard.writeText(url.href); setNotice({ key: 'editorLinkCopied' }); }
    catch { setNotice({ key: 'editorLinkCopyFailed', error: true }); }
  }
  const search = searches[tab] ?? '';
  const allItems = tab === 'slots' ? draft.slots : tab === 'days' ? publicDays : tab === 'weeks' ? draft.weeks : draft.sequences;
  const items = allItems.filter((item) => item.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) && (tab !== 'days' || matchesDayTag(item, dayTagFilter) && matchesDayUse(uses[item.id], dayUseFilter)));
  const activeItem = tab === 'slots' ? activeSlot : tab === 'days' ? activeDay : tab === 'weeks' ? activeWeek : activeSequence;
  const view = tab === 'slots' ? { search: 'search', add: 'addSlot', empty: 'noSlots', hint: 'noSlotsHint', noResults: 'noResults' }
    : tab === 'days' ? { search: 'searchDays', add: 'addDay', empty: 'noDays', hint: 'noDaysHint', noResults: 'noDayResults' }
      : tab === 'weeks' ? { search: 'searchWeeks', add: 'addWeek', empty: 'noWeeks', hint: 'noWeeksHint', noResults: 'noWeekResults' }
        : { search: 'searchSequences', add: 'addSequence', empty: 'noSequences', hint: 'noSequencesHint', noResults: 'noSequenceResults' };

  function filterDayUse(role) { setDayUseFilter(role); setCollapsedDayUses((previous) => previous.filter((key) => key !== role)); }
  function revealDayUses(id) { setDayUseFilter(''); const roles = uses[id]?.roles ?? ['main']; setCollapsedDayUses((previous) => previous.filter((role) => !roles.includes(role))); }
  function renderItem(item) { return <div key={item.id} className="schedule-list-entry"><button className={`slot-item ${item.id === activeItem?.id ? 'selected' : ''}`} title={item.name} aria-pressed={item.id === activeItem?.id} onClick={() => { navigation.refresh(); ({ slots: setSelectedSlot, days: setSelectedDay, weeks: setSelectedWeek, sequences: setSelectedSequence })[tab](item.id); }}>{tab === 'slots' ? <SlotInfo slot={item} t={t} /> : <><SlotIcon name={item.icon} /><div className="slot-info-text"><strong>{item.name || '—'}</strong><EngineKeyWarning kind={tab} id={item.id} value={item.symbol} t={t} /></div></>}<ChevronRight size={16} /></button>{tab === 'days' && <><DayUseChips use={uses[item.id]} hideSingle={dayListView === 'grouped'} onFilter={filterDayUse} t={t} /><DayTagChips day={item} onFilter={setDayTagFilter} t={t} /></>}</div>; }

  useEffect(() => {
    document.documentElement.lang = locale; document.title = t('title');
    try { localStorage.setItem('schedule-editor-language', preference); } catch { /* Optional preference storage. */ }
  }, [locale, preference, t]);
  useEffect(() => { if (initialized) document.title = [locationName, pageLabel(tab), draft.project.name].filter(Boolean).join(' · '); }, [initialized, locationName, tab, mode, draft.project.name, t]);
  useEffect(() => {
    const update = () => setLanguages(navigator.languages ?? [navigator.language]);
    window.addEventListener('languagechange', update); return () => window.removeEventListener('languagechange', update);
  }, []);
  useEffect(() => {
    const guard = (event) => { if (projectDirty) { event.preventDefault(); event.returnValue = ''; } };
    window.addEventListener('beforeunload', guard); return () => window.removeEventListener('beforeunload', guard);
  }, [projectDirty]);
  useEffect(() => { if (connection?.ready) { setInitialized(true); setSimulation((previous) => previous ? { ...previous, result: null } : previous); } }, [connection?.ready, connection?.externalStamp]);
  useEffect(() => {
    if (!connection?.ready) return;
    const missing = selectedDay && !draft.days.some((item) => item.id === selectedDay) || selectedSlot && !draft.slots.some((item) => item.id === selectedSlot) || selectedWeek && !draft.weeks.some((item) => item.id === selectedWeek) || selectedSequence && !draft.sequences.some((item) => item.id === selectedSequence);
    if (missing) { setNotice({ key: 'remoteObjectRemoved' }); setSelectedDay(null); setSelectedSlot(null); setSelectedWeek(null); setSelectedSequence(null); }
  }, [connection?.externalStamp]);

  async function reloadServer() {
    if ((connection.localChanges || connection.conflict) && !window.confirm(t('remoteReloadConfirm'))) return;
    const result = await project.reload();
    if (!result.ok) return;
    setSettings(null); setCellDialog(null); setWeekCellDialog(null); setDaySelector(null); setEnvironmentSettings(false); setEnvironmentPreview(null); setReportDialog(false); setServerFileDialog(null);
    setNotice(null); setOperationIssues([]); resetNavigation();
  }

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
    setDayTagFilter(''); revealDayUses(returnDay.id); setSelectedDay(returnDay.id);
    setDayRestore({ ...dayReturn });
    setDayReturn(null);
    setMode('user');
    setSearches((previous) => ({ ...previous, days: '' }));
    setModeTabs((previous) => ({ ...previous, user: 'days' }));
  }
  function returnToCandidates() {
    if (!candidateView || !draft.sequences.some((sequence) => sequence.id === candidateView.sequenceId && sequence.eventGroups?.some((group) => group.id === candidateView.groupId))) return;
    setMode('user'); setSelectedSequence(candidateView.sequenceId); setDayReturn(null);
    setSearches((previous) => ({ ...previous, sequences: '' }));
    setModeTabs((previous) => ({ ...previous, user: 'sequences' }));
    setCandidateView((previous) => ({ ...previous, open: true, returning: false }));
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
      setDayTagFilter(''); revealDayUses(day.id); setSelectedDay(day.id);
      setSearches((previous) => ({ ...previous, days: '' }));
      setWeekHighlight(null);
      setModeTabs((previous) => ({ ...previous, user: 'days' }));
    }
  }
  function openReferencedSequence(sequence) {
    if (!sequence) return;
    setContinuousSimulation((previous) => previous.result?.status === 'running' ? { ...previous, result: { ...previous.result, status: 'cancelled' } } : previous);
    setMode('user'); setSelectedSequence(sequence.id);
    setSearches((previous) => ({ ...previous, sequences: '' }));
    setModeTabs((previous) => ({ ...previous, user: 'sequences' }));
  }
  function openContinuousSimulation(sequenceId) {
    setContinuousSimulation((previous) => {
      const target = previous.sequenceId ?? draft.sequences[0]?.id;
      return { ...previous, sequenceId, result: target === sequenceId ? previous.result : null };
    });
    setModeTabs((previous) => ({ ...previous, simulation: 'continuousSimulation' }));
    setMode('simulation');
  }
  function addItem() {
    if (tab === 'slots') { const result = editProject(draft, t).slots.create({ name: t('newSlot') }); const slot = result.value; commit(result.draft); setSelectedSlot(slot.id); }
    else if (tab === 'days') { setDayTagFilter(''); revealDayUses(); const result = editProject(draft, t).days.create({ name: t('newDay') }); const day = result.value; commit(result.draft); setSelectedDay(day.id); }
    else if (tab === 'weeks') { const result = editProject(draft, t).weeks.create({ name: t('newWeek') }); const week = result.value; commit(result.draft); setSelectedWeek(week.id); }
    else { const result = editProject(draft, t).sequences.create({ name: t('newSequence') }); const sequence = result.value; commit(result.draft); setSelectedSequence(sequence.id); }
    resetSearch();
  }
  function copySlot() { const result = editProject(draft, t).slots.duplicate(activeSlot.id); const slot = result.value; commit(result.draft); setSelectedSlot(slot.id); resetSearch(); }
  function deleteSlot() {
    if (!window.confirm(t('deleteReferenced', { name: activeSlot.name, count: referenceCount(draft, activeSlot.id) }))) return;
    if (commitResult(editProject(draft, t).slots.remove(activeSlot.id))) setSelectedSlot(null);
  }
  function copyDay() { setDayTagFilter(''); revealDayUses(); const result = editProject(draft, t).days.duplicate(activeDay.id); const day = result.value; commit(result.draft); setSelectedDay(day.id); resetSearch(); }
  function deleteDay() {
    if (scheduledDayReferences(draft, activeDay.id).length) { window.alert(t('scheduledDayInUse')); return; }
    const countRefs = countDayReferences(draft, activeDay.id);
    if (countRefs.length) { window.alert(t('eventCountDayDeleteBlocked', { count: countRefs.length })); return; }
    const eventCount = draft.sequences.reduce((sum, sequence) => sum + (sequence.eventGroups ?? []).filter((group) => eventDayIds(group).includes(activeDay.id)).length, 0);
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
  async function createNewProject(next) {
    const result = await project.reset(next);
    if (!result.ok) { setOperationIssues(result.errors); setNotice({ key: 'projectOperationBlocked', error: true }); return; }
    setDirty(true); setNotice(null); setOperationIssues([]); setInitialized(true); setSettings(null); setSelectedSlot(null); setSelectedDay(null); setSelectedWeek(null); setSelectedSequence(null);
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
  function newProject() { if (!projectDirty || window.confirm(t('newProjectConfirm'))) setSettings('new'); }
  async function importFile(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const yaml = /\.ya?ml$/i.test(file.name);
      if (!yaml && !/\.json$/i.test(file.name)) { setOperationIssues([]); setNotice({ key: 'projectFileTypeError', error: true }); return; }
      const text = (await file.text()).replace(/^\uFEFF/, '');
      const compiled = yaml ? importBlueprint(text) : null;
      const data = yaml ? compiled.data : JSON.parse(text);
      const errors = yaml ? compiled.errors : validateDocument(data);
      if (errors.length) { setOperationIssues(errors); setNotice({ key: 'importInvalid', error: true, issueTitle: 'errorsForImport' }); return; }
      if (projectDirty && !window.confirm(t('importConfirm'))) return;
      const result = await project.loadDocument(data);
      if (!result.ok) { setOperationIssues(result.errors); setNotice({ key: 'importInvalid', error: true, issueTitle: 'errorsForImport' }); return; }
      setSelectedSlot(null); setSelectedDay(null); setSelectedWeek(null); setSelectedSequence(null); setSearches({ slots: '', days: '', weeks: '', sequences: '' }); resetNavigation();
      setInitialized(true); setSettings(null); setCellDialog(null); setWeekCellDialog(null); setDaySelector(null); setEnvironmentSettings(false); setEnvironmentPreview(null); setDirty(yaml); setOperationIssues([]); setNotice({ key: yaml ? 'blueprintImported' : 'imported' });
    } catch { setOperationIssues([]); setNotice({ key: 'projectReadError', error: true }); }
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

  function exportBlueprintFile() {
    const result = editProject(draft, t).exportBlueprint();
    if (result.errors.length) { setOperationIssues(result.errors); setNotice({ key: 'blueprintExportInvalid', error: true, issueTitle: 'errorsForExport' }); return; }
    const url = URL.createObjectURL(new Blob([result.data], { type: 'application/yaml;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'character-schedule-blueprint.yaml'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setOperationIssues([]); setNotice({ key: 'blueprintExported' });
  }

  function exportReport(options) {
    const result = editProject(draft, t).exportReport(options);
    if (result.errors.length) return result.errors;
    const url = URL.createObjectURL(new Blob([result.data], { type: 'text/markdown;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'character-schedule-report.md'; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000); setOperationIssues([]); setNotice({ key: 'reportExported' });
    return [];
  }

  if (connection && !connection.ready) return <div className="remote-loading"><h1>{t('title')}</h1><p role="status">{t(connection.error ? 'remoteDisconnected' : 'remoteLoading')}</p><button className="button secondary" onClick={reloadServer}>{t('remoteRetry')}</button></div>;

  return <NavigationContext.Provider value={navigation.registry}><ProjectConnectionContext.Provider value={connection}><ScheduleDraftContext.Provider value={draft}><EnumDefinitionsContext.Provider value={draft.enumNodes ?? {}}><EventCatalogContext.Provider value={eventCatalog(draft)}><BuiltinTasksContext.Provider value={draft.builtinTasks}><EngineKeysContext.Provider value={engineKeys}><TaskMacrosContext.Provider value={draft.taskMacros}><TaskContext.Provider value={draft.tasks}><div className="app-shell" data-mode={mode} key={`${connection?.resetEpoch ?? 0}:${routeEpoch}`} data-connection={connection ? "remote" : "local"}>
    <header className="app-header"><div className="project-identity"><GitBranch size={21} /><h1 title={initialized ? draft.project.name : t('title')}>{initialized ? draft.project.name : t('title')}</h1>{initialized && mode === 'environment' && <span className="environment-badge" title={t('environmentMode')}>{t('environmentBadge')}</span>}{initialized && mode === 'simulation' && <span className="environment-badge simulation-badge" title={t('simulationMode')}>{t('simulationBadge')}</span>}<ActionMenu label={t('projectMenu')} icon={ChevronDown} items={[{ label: t('settings'), icon: Settings2, disabled: !initialized, onClick: () => setSettings('existing') }, { label: t('newProject'), icon: FolderPlus, onClick: newProject }, ...(connection ? [{ label: t('remoteOpen'), icon: Upload, onClick: () => setServerFileDialog('open') }, { label: t('remoteSave'), icon: Download, onClick: () => setServerFileDialog('save') }] : []), { separator: true }, { label: t('import'), icon: Upload, onClick: () => fileInput.current.click() }, { label: t('export'), icon: Download, disabled: !initialized, onClick: exportFile }, ...(initialized ? [{ separator: true }, { label: t('userMode'), checked: mode === 'user', onClick: () => setMode('user') }, { label: t('environmentMode'), checked: mode === 'environment', onClick: () => setMode('environment') }, { label: t('simulationMode'), checked: mode === 'simulation', onClick: () => setMode('simulation') }] : [])]} /></div>
      {initialized && <><nav className="header-tabs" aria-label={t('editorPage')}><div role="tablist">{EDITOR_PAGES.map((page) => <button key={page} role="tab" aria-selected={tab === page} onClick={() => setTab(page)}>{pageLabel(page)}</button>)}</div></nav><select className="mobile-page-picker" aria-label={t('editorPage')} value={tab} onChange={(event) => setTab(event.target.value)}>{EDITOR_PAGES.map((page) => <option key={page} value={page}>{pageLabel(page)}</option>)}</select></>}
      <div className="header-actions">{initialized && <button type="button" className="icon-button" aria-label={t('copyEditorLink')} title={t('copyEditorLink')} onClick={() => copyEditorLink()}><Link size={17} /></button>}<label className="language-picker"><Globe2 size={16} /><select aria-label={t('language')} value={preference} onChange={(e) => setPreference(e.target.value)}><option value="system">{t('system')}</option><option value="zh-TW">繁體中文</option><option value="en">English</option></select></label>
        {initialized && mode === 'environment' && <ActionMenu label={t('environmentActions')} icon={Settings2} items={[{ label: t('environmentSettings'), icon: Settings2, onClick: () => setEnvironmentSettings(true) }, { label: t('importEnvironment'), icon: Upload, onClick: () => environmentInput.current.click() }, { label: t('exportEnvironment'), icon: Download, onClick: exportEnvironmentFile }]} />}
        {initialized && mode === 'user' && <ActionMenu label={t('exportMenu')} triggerClassName="button primary export-button" items={[{ label: t('exportRuntimeOption'), icon: Download, onClick: exportRuntime }, { label: t('exportBlueprintOption'), icon: Download, onClick: exportBlueprintFile }, { label: t('exportReportOption'), icon: Download, onClick: () => setReportDialog(true) }, { label: t('exportProjectOption'), icon: Download, onClick: exportFile }]}><Download size={17} /><span>{t('exportMenu')}</span><ChevronDown size={14} /></ActionMenu>}
        <input className="sr-only" ref={fileInput} type="file" accept=".json,.yaml,.yml,application/json,application/yaml,text/yaml" aria-label={t('import')} onChange={importFile} />
        {initialized && <input className="sr-only" ref={environmentInput} type="file" accept=".json,application/json" aria-label={t('importEnvironment')} onChange={importEnvironmentFile} />}
      </div>
    </header>
    {routeError && <div className="route-error" role="alert"><span>{t(routeError.error === 'invalid' ? 'editorLinkInvalid' : 'editorLinkMissing', { name: routeError.name ?? '' })}</span><button type="button" className="button secondary" onClick={() => setRouteError(null)}>{t('close')}</button></div>}
    <AppNotice notice={notice} t={t} onDismiss={(target) => { setNotice((current) => current === target ? null : current); if (target.error && target === notice) setOperationIssues([]); }} />
    {operationIssues.length > 0 && <details className="import-issues" open><summary>{t(notice?.issueTitle ?? 'errorsForExport')}</summary><Issues errors={operationIssues} t={t} /></details>}
    {initialized && mode === 'simulation' ? <SimulationView onOpenDay={openReferencedDay} onOpenSequence={openReferencedSequence} draft={draft} session={tab === 'continuousSimulation' ? continuousSimulation : simulation} onSessionChange={(update) => (tab === 'continuousSimulation' ? setContinuousSimulation : setSimulation)((previous) => ({ ...previous, ...update }))} onOpenSlot={openReferencedSlot} t={t} /> : initialized && tab === 'enums' ? <EnumDefinitionsEditor scope={mode === 'environment' ? 'environment' : 'application'} key={mode} {...editorView('enums')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'expressions' ? <ExpressionMacrosEditor scope={mode === 'environment' ? 'environment' : 'application'} key={mode} {...editorView('expressions')} draft={draft} t={t} onChange={(operandNodes) => commit({ ...draft, operandNodes })} /> : initialized && tab === 'taskMacros' ? <TaskMacrosEditor {...editorView('taskMacros')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'tasks' ? <TasksEditor {...editorView('tasks')} draft={draft} onChange={commit} t={t} /> : initialized && tab === 'operands' ? <OperandsEditor {...editorView('operands')} scope={mode === 'environment' ? 'environment' : 'application'} key={mode} draft={draft} t={t} onChange={(operandNodes) => commit({ ...draft, operandNodes })} /> : initialized ? <div className={`workspace ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}><aside className="sidebar compact-sidebar"><div className="sidebar-heading"><h2><Layers3 size={17} /><span title={t(tab)}>{t(tab)}</span></h2><span className="count">{tab === 'days' ? `${items.length}/${allItems.length}` : allItems.length}</span>{tab === 'days' && <><DayListOptions search={search} onSearchChange={(value) => setSearches({ ...searches, days: value })} onClear={() => { setSearches({ ...searches, days: '' }); setDayTagFilter(''); setDayUseFilter(''); }} days={publicDays} uses={uses} role={dayUseFilter} onRoleChange={filterDayUse} view={dayListView} onViewChange={setDayListView} tag={dayTagFilter} onTagChange={setDayTagFilter} t={t} /></>}<button type="button" className="icon-button" aria-label={t(view.add)} title={t(view.add)} onClick={addItem}><Plus size={17} /></button><button type="button" className="icon-button sidebar-toggle" aria-label={t(sidebarCollapsed ? 'expandList' : 'collapseList')} title={t(sidebarCollapsed ? 'expandList' : 'collapseList')} aria-expanded={!sidebarCollapsed} onClick={() => setSidebarCollapsed(!sidebarCollapsed)}>{sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}</button></div>
      {tab !== 'days' && <label className="search-field"><Search size={16} /><input aria-label={t(view.search)} placeholder={t(view.search)} value={search} onChange={(e) => setSearches({ ...searches, [tab]: e.target.value })} /></label>}
      <div className="slot-list">{tab === 'days' && dayListView === 'grouped' ? DAY_USES.filter((role) => !dayUseFilter || role === dayUseFilter).map((role) => {
        const days = items.filter((item) => uses[item.id]?.roles.includes(role));
        return days.length ? <details key={role} className={`day-use-group day-use-group-${role}`} open={!collapsedDayUses.includes(role)} onToggle={(event) => { const open = event.currentTarget.open; setCollapsedDayUses((previous) => open ? previous.includes(role) ? previous.filter((key) => key !== role) : previous : previous.includes(role) ? previous : [...previous, role]); }}><summary aria-label={t('dayUseGroup', { name: t(`dayUse_${role}`), count: days.length })}>{t(`dayUse_${role}`)}<span className="count">{days.length}</span></summary><div className="day-use-group-items">{days.map(renderItem)}</div></details> : null;
      }) : items.map(renderItem)}
        {!items.length && <div className="sidebar-empty"><Search size={24} /><strong>{t(search || tab === 'days' && (dayTagFilter || dayUseFilter) ? view.noResults : view.empty)}</strong></div>}
      </div></aside><main><div className={`editor-content editor-${tab}`}>
        {candidateView?.returning && ['days', 'slots'].includes(tab) && draft.sequences.some((sequence) => sequence.id === candidateView.sequenceId && sequence.eventGroups?.some((group) => group.id === candidateView.groupId)) && <button className="button secondary candidate-view-return" onClick={returnToCandidates}>{t('returnEventCandidates')}</button>}
        {tab === 'slots' && activeSlot ? <SlotEditor onOpenMacro={(id) => { setMode('user'); setModeTabs((previous) => ({ ...previous, user: 'taskMacros' })); setEditorViews((previous) => ({ ...previous, 'user:taskMacros': { ...previous['user:taskMacros'], selected: id, search: '' } })); }} onReturnDay={returnDay ? returnToDay : undefined} returnDayName={returnDay?.name} tasks={draft.tasks} operandNodes={draft.operandNodes} slot={activeSlot} t={t} onChange={(slot) => commitResult(editProject(draft, t).slots.replace(slot.id, slot))} onDuplicate={copySlot} onDelete={deleteSlot} />
          : tab === 'days' && activeDay ? <DayEditor nodes={draft.operandNodes} days={publicDays} onOpenSlot={openReferencedSlot} restorePosition={dayRestore} day={activeDay} slots={draft.slots} t={t} onChange={(day) => commitResult(editProject(draft, t).days.update(day.id, day))} onDuplicate={copyDay} onDelete={deleteDay} onCell={(index) => setCellDialog({ dayId: activeDay.id, index })} />
            : tab === 'weeks' && activeWeek ? <WeekEditor onOpenDay={openReferencedDay} highlight={weekHighlight} key={activeWeek.id} week={activeWeek} draft={draft} t={t} onChange={(week) => commitResult(editProject(draft, t).weeks.update(week.id, week))} onDuplicate={copyWeek} onDelete={removeWeek} onDay={(weekday) => setDaySelector({ weekId: activeWeek.id, weekday })} onCell={(weekday, index) => setWeekCellDialog({ weekId: activeWeek.id, weekday, index })} />
              : tab === 'sequences' && activeSequence ? <SequenceEditor eventView={sequenceEvent?.sequenceId === activeSequence.id ? sequenceEvent : null} onEventViewChange={(value) => setSequenceEvent(value ? { ...value, sequenceId: activeSequence.id } : null)} onCopyLink={copyEditorLink} onSimulateSequence={openContinuousSimulation} candidateView={candidateView} onCandidateViewChange={setCandidateView} onSimulateDay={(sequenceId, position) => { setSimulation((previous) => ({ ...previous, target: 'day', sequenceId, position, result: null })); setModeTabs((previous) => ({ ...previous, simulation: 'simulation' })); setMode('simulation'); }} onOpenSlot={openReferencedSlot} onOpenDay={openReferencedDay} key={activeSequence.id} draft={draft} sequence={activeSequence} t={t} onChange={(sequence) => commitResult(editProject(draft, t).sequences.update(sequence.id, sequence))} onDuplicate={copySequence} onDelete={removeSequence} />
              : <div className="empty-state"><Layers3 size={40} /><h2>{t(view.empty)}</h2><p>{t(view.hint)}</p><button className="button primary" onClick={addItem}><Plus size={16} />{t(view.add)}</button></div>}
      </div></main></div> : <main className="welcome"><div className="empty-state"><FolderPlus size={40} /><h2>{t('welcome')}</h2><p>{t('welcomeHint')}</p><div className="welcome-actions"><button className="button primary" onClick={() => setSettings('new')}>{t('newProject')}</button><button className="button secondary" onClick={() => fileInput.current.click()}>{t('import')}</button></div></div></main>}
    {connection && <ConnectionStatus connection={connection} onReload={reloadServer} onExport={exportFile} t={t} />}
    <footer className="app-footer" title={connection?.file ?? t('unsaved')}><span>{connection ? [t(projectDirty ? 'remoteUnsaved' : 'remoteSaved'), connection.file?.split(/[\\/]/).at(-1) ?? t('remoteNoFile')].join(' · ') : t('unsaved')}</span></footer>
    {serverFileDialog && <ServerFileDialog kind={serverFileDialog} project={project} connection={connection} onOpened={() => { resetNavigation(); setOperationIssues([]); setNotice(null); }} onClose={() => setServerFileDialog(null)} t={t} />}
    {navigation.confirmation && <Dialog title={t('editorLeaveTitle')} t={t} onClose={navigation.cancel} footer={<><button autoFocus className="button secondary" onClick={navigation.cancel}>{t('editorStay')}</button><button className="button primary" onClick={navigation.discard}>{t('editorDiscard')}</button></>}><p>{t('editorLeaveHint')}</p></Dialog>}
    {reportDialog && <ReportExportDialog t={t} onExport={exportReport} onClose={() => setReportDialog(false)} />}
    {settings === 'existing' && <ProjectSettings draft={draft} t={t} onSave={saveSettings} onClose={() => setSettings(null)} />}
    {settings === 'new' && <NewProjectDialog t={t} onCreate={createNewProject} onClose={() => setSettings(null)} />}
    {environmentSettings && <EnvironmentSettings draft={draft} t={t} onClose={() => setEnvironmentSettings(false)} onSave={(environment, count) => { if (commitResult(editProject(draft, t).environment.update(environment, count))) setEnvironmentSettings(false); }} />}
    {environmentPreview && <EnvironmentImportDialog preview={environmentPreview} current={draft.environment} t={t} onClose={() => setEnvironmentPreview(null)} onApply={() => { const result = project.environment.import(environmentPreview.data); if (!result.ok) { setOperationIssues(result.errors); setNotice({ key: 'environmentImportInvalid', error: true }); return; } setDirty(true); setSimulation((previous) => previous ? { ...previous, result: null } : previous); setOperationIssues([]); setEnvironmentPreview(null); setEditorViews({}); setNotice({ key: 'environmentImported' }); }} />}
    {cellDialog && <SlotDialog draft={draft} day={draft.days.find((day) => day.id === cellDialog.dayId)} index={cellDialog.index} t={t} onCommit={commit} onClose={() => setCellDialog(null)} />}
    {weekCellDialog && <WeekSlotDialog draft={draft} {...weekCellDialog} t={t} onCommit={commit} onClose={() => setWeekCellDialog(null)} />}
    {daySelector && <DaySelector draft={draft} week={draft.weeks.find((week) => week.id === daySelector.weekId)} weekday={daySelector.weekday} t={t} onCommit={commit} onClose={() => setDaySelector(null)} />}
  </div></TaskContext.Provider></TaskMacrosContext.Provider></EngineKeysContext.Provider></BuiltinTasksContext.Provider></EventCatalogContext.Provider></EnumDefinitionsContext.Provider></ScheduleDraftContext.Provider></ProjectConnectionContext.Provider></NavigationContext.Provider>;
}
