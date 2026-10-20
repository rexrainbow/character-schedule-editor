import { useContext, useRef, useState } from 'react';
import { ScheduleDraftContext } from '../contexts/TaskContext.js';
import { OperandEditor } from './ConditionEditor.jsx';
import IconField from '../components/IconField.jsx';
import EventDaySourceEditor from '../dialogs/EventDaySourceEditor.jsx';
import EventCandidatesDialog from '../dialogs/EventCandidatesDialog.jsx';
import { Issues } from '../components/ui.jsx';
import { eventDaySourceFromData, eventDaySourceToData, eventDaySourceMode, eventDayCandidates, eventFirstDayId, eventDaySourceErrors } from '../../core/eventDaySource.js';
import { taskUseErrors } from '../../core/operandModel.js';
import { WEEKDAYS } from '../../core/scheduleConstants.js';

export default function ScheduleEventEditor({ value, definition, nodes, parameters, onChange, t }) {
  const draft = useContext(ScheduleDraftContext), days = (draft?.days ?? []).filter((day) => !day.scope || day.scope === 'shared');
  const group = { ...eventDaySourceFromData(value), display_name: value.display_name, icon: value.icon, executionMode: value.execution_mode };
  const cache = useRef({}), trigger = useRef(null), [view, setView] = useState(null);
  const label = (id) => definition?.parameters.find((p) => p.id === id)?.display_name ?? t(`scheduleField_${id}`);
  function source(change) {
    const next = { ...group, ...change }, { day_source, day_schedule_id, ...base } = value;
    onChange({ ...base, ...eventDaySourceToData(next), display_name: next.display_name, icon: next.icon });
  }
  const errors = [...taskUseErrors(value, [], nodes, '', parameters), ...eventDaySourceErrors(group, days, '')];
  return <section className="schedule-event-editor">
    <div className="name-with-icon"><IconField value={value.icon} onChange={(icon) => onChange({ ...value, icon })} t={t} /><label>{label('display_name')}<input aria-label={label('display_name')} value={value.display_name} placeholder={days.find((day) => day.id === eventFirstDayId(group))?.name ?? ''} onChange={(e) => onChange({ ...value, display_name: e.target.value })} /></label></div>
    <label>{label('date_mode')}<select aria-label={label('date_mode')} value={value.date.mode} onChange={(e) => onChange({ ...value, date: { mode: e.target.value, offset: value.date.offset, ...(e.target.value === 'weeks_weekday' ? { weekday: value.date.weekday ?? 'mon' } : {}) } })}>{['days', 'weeks_weekday'].map((mode) => <option key={mode} value={mode}>{t(`scheduleDate_${mode}`)}</option>)}</select></label>
    <div className="schedule-event-date"><div><span className="field-label">{label('offset')}</span><OperandEditor label={label('offset')} expectedType="number" value={value.date.offset} nodes={nodes} parameters={parameters} t={t} onChange={(offset) => onChange({ ...value, date: { ...value.date, offset } })} /></div>
      {value.date.mode === 'weeks_weekday' && <label>{label('weekday')}<select aria-label={label('weekday')} value={value.date.weekday} onChange={(e) => onChange({ ...value, date: { ...value.date, weekday: e.target.value } })}>{WEEKDAYS.map((day) => <option key={day} value={day}>{t(day)}</option>)}</select></label>}
    </div>
    <p className="field-hint">{t('scheduleDateHint')}</p>
    <div className="schedule-event-date"><label>{label('execution_mode')}<select aria-label={label('execution_mode')} value={value.execution_mode} onChange={(e) => onChange({ ...value, execution_mode: e.target.value, ...(e.target.value !== 'overlay' && value.priority < 0 ? { priority: 0 } : {}) })}>{['overlay', 'interrupt_main', 'interrupt_lower'].map((mode) => <option key={mode} value={mode}>{t(`executionMode_${mode}`)}</option>)}</select></label><label>{label('priority')}<input type="number" step="1" min={value.execution_mode === 'overlay' ? undefined : 0} aria-label={label('priority')} value={Number.isNaN(value.priority) ? '' : value.priority} onChange={(e) => onChange({ ...value, priority: e.target.value === '' ? NaN : e.target.valueAsNumber })} /></label></div>
    <EventDaySourceEditor defaultPurpose={value.execution_mode === 'overlay' ? 'overlay' : 'interrupt'} group={group} days={days} t={t} allowedModes={['fixed', 'random']} onChange={source} onModeChange={(sourceMode) => {
      cache.current[eventDaySourceMode(group)] = structuredClone(group);
      const saved = cache.current[sourceMode];
      source({ sourceMode, dayId: saved?.dayId ?? eventFirstDayId(group) ?? '', dayCandidates: saved?.dayCandidates ?? eventDayCandidates(group).filter((item) => item.dayId).map((item) => ({ ...item, weight: item.weight ?? 1 })) });
    }} onView={(button) => { trigger.current = button; setView({ selectedId: eventFirstDayId(group), showAll: false }); }} />
    <p className="field-hint">{t('scheduleEventHint')}</p>
    {errors.length > 0 && <Issues errors={errors} t={t} />}
    {view && draft && <EventCandidatesDialog embedded returnLabel={t('returnScheduleEvent')} draft={draft} group={group} view={view} onViewChange={setView} onClose={() => { setView(null); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }} t={t} />}
  </section>;
}
