import { scheduleEventUses } from './scheduledEvents.js';
import { eventDayIds, eventDaySourceMode, eventDaySourceFromData } from './eventDaySource.js';
import { eventExecutionMode } from './slotRelease.js';
import { compileProject } from './model.js';
import { WEEKDAYS } from './scheduleConstants.js';
import { sequenceRange, sequenceDate } from './sequenceRange.js';
import { resolveSequenceDay } from './sequenceModel.js';
import { eventsOnDate, eventCounts, eventGroupName, eventDateLabel } from './sequenceEvents.js';
import { eventCatalog, eventKind } from './eventReferences.js';
import { dayAssignments, assignmentLabel } from './dayEvents.js';
import { dayUses } from './dayUses.js';
import { dayTags } from './dayTags.js';
import { slotEntries } from './operandModel.js';
import { slotLogicText } from './logicOverviewModel.js';
import { translator } from '../i18n/index.js';

// All user-authored Markdown prose is escaped; task logic uses indented code.
const escape = (value) => String(value ?? '').replace(/\r\n|[\r\n]/g, ' ').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/[\\`*_{}\[\]()#!|~]/g, '\\$&');
const link = (name, anchor) => `[${escape(name)}](#${anchor})`;
function names(items, name, t) {
  const counts = new Map();
  for (const item of items) counts.set(name(item), (counts.get(name(item)) ?? 0) + 1);
  return new Map(items.map((item, index) => [item.id, counts.get(name(item)) > 1 ? `${name(item)} (${t('reportObjectIndex', { count: index + 1 })})` : name(item)]));
}

/** Static, deterministic Markdown. Does not run tasks, conditions or probability. */
export function compileReport(draft, { includeUnreferenced = false, t = translator('en') } = {}) {
  const { errors } = compileProject(draft);
  if (errors.length) return { data: null, errors };
  const lines = [], push = (...text) => lines.push(...text);
  const sequences = draft.sequences, catalog = eventCatalog(draft);
  const sequenceNames = names(sequences, (sequence) => sequence.name, t);
  const dayNames = names(draft.days, (day) => day.scope === 'week_private' ? t('reportPrivateDayName', { name: draft.weeks.find((week) => week.id === day.owner.week_schedule_id)?.name, weekday: t(day.owner.weekday) }) : day.name, t);
  const slotNames = names(draft.slots, (slot) => slot.name, t);
  const eventNameCounts = new Map();
  for (const event of catalog) eventNameCounts.set(event.name, (eventNameCounts.get(event.name) ?? 0) + 1);
  const eventKey = (sequence, group) => `${sequence.id}-${group.id}`;
  const eventNames = new Map(sequences.flatMap((sequence) => (sequence.eventGroups ?? []).map((group, index) => {
    const name = eventGroupName(group, draft.days);
    return [eventKey(sequence, group), eventNameCounts.get(name) > 1 ? `${name} (${sequenceNames.get(sequence.id)} / ${index + 1})` : name];
  })));
  const dayLink = (day) => day ? link(dayNames.get(day.id), `day-${day.id}`) : escape(t('unassigned'));
  const eventLink = (sequence, group) => link(eventNames.get(eventKey(sequence, group)), `event-${eventKey(sequence, group)}`);
  const priority = (group) => `${group.priority >= 0 ? '+' : ''}${group.priority}`;
  const candidate = (group) => eventKind(group) === 'probability' ? ` [${escape(t('reportProbabilityCandidate'))}]` : '';
  const referencedDays = new Set(sequences.flatMap((sequence) => (sequence.eventGroups ?? []).flatMap((group) => eventDayIds(group))));
  function heading(level, anchor, name) { push(`<a id="${anchor}"></a>`, '', `${'#'.repeat(level)} ${escape(name)}`, ''); }
  function field(label, value) { push(`- ${escape(t(label))}: ${value}`); }
  push(`# ${escape(t('reportTitle', { name: draft.project.name }))}`, '', escape(t('reportStaticHint')), '', `- ${escape(t('slotsPerDay'))}: ${draft.project.settings.slots_per_day}`, '');
  push(`## ${escape(t('reportSequences'))}`, '');
  if (!sequences.length) push(escape(t('reportNoSequences')), '');
  for (const sequence of sequences) {
    heading(3, `sequence-${sequence.id}`, sequenceNames.get(sequence.id));
    const range = sequenceRange(sequence);
    if (!sequence.rows.length) { push(escape(t('emptySequence')), ''); continue; }
    field('eventStart', escape(eventDateLabel({ week: 1, weekday: range.startWeekday }, t)));
    field('eventEnd', escape(eventDateLabel({ week: sequence.rows.length, weekday: range.endWeekday }, t)));
    field('reportActiveDays', String(range.totalDays)); push('');
    sequence.rows.forEach((row, index) => {
      const week = draft.weeks.find((item) => item.id === row.weekId);
      push(`#### ${escape(t('weekNumber', { count: index + 1 }))}: ${escape(week.name)}`, '', `| ${['reportDate', 'reportMainDay', 'reportAssignmentSource', 'reportEvents', 'reportSourceOrder'].map((key) => escape(t(key))).join(' | ')} |`, '| --- | --- | --- | --- | --- |');
      for (const weekday of WEEKDAYS) {
        const date = sequenceDate(sequence, index, weekday);
        if (!date.active) { push(`| ${escape(t(weekday))} (${escape(t('reportOutsideRange'))}) | — | — | — | — |`); continue; }
        const { day, overridden } = resolveSequenceDay(draft, row, weekday);
        if (day) referencedDays.add(day.id);
        const original = draft.days.find((item) => item.id === week.days[weekday]);
        const source = overridden ? `${escape(t(day ? 'reportOverridden' : 'reportOverrideEmpty'))}; ${escape(t('reportOriginalDay'))}: ${dayLink(original)}` : escape(t('reportInherited'));
        // A replaced original is shown as a reference, so include its definition too.
        if (overridden && original) referencedDays.add(original.id);
        const events = eventsOnDate(sequence, index * 7 + WEEKDAYS.indexOf(weekday), draft);
        const eventText = events.map((group) => `${eventLink(sequence, group)} (${priority(group)})${candidate(group)}`).join(', ') || '—';
        const order = [...events.filter((group) => group.priority >= 0).map((group) => eventLink(sequence, group) + candidate(group)), ...(day ? [`${escape(t('reportMainDay'))}: ${dayLink(day)}`] : []), ...events.filter((group) => group.priority < 0).map((group) => eventLink(sequence, group) + candidate(group))].join(' → ') || '—';
        push(`| ${escape(t('sequenceDayNumber', { count: date.dayNumber }))} / ${escape(t(weekday))} | ${dayLink(day)} | ${source} | ${eventText} | ${order} |`);
      }
      push('');
    });
  }
  push(`## ${escape(t('reportEvents'))}`, '', escape(t('reportPhaseOrderHint')), '');
  if (!catalog.length) push(escape(t('eventNoGroups')), '');
  for (const sequence of sequences) for (const group of sequence.eventGroups ?? []) {
    heading(3, `event-${eventKey(sequence, group)}`, eventNames.get(eventKey(sequence, group)));
    field('reportOwnerSequence', link(sequenceNames.get(sequence.id), `sequence-${sequence.id}`));
    field('eventDaySource', escape(t(`eventSource_${eventDaySourceMode(group)}`)));
    field('eventDay', eventDayIds(group).map((id, i) => dayLink(draft.days.find((day) => day.id === id)) + (eventDaySourceMode(group) === 'random' ? ` (${group.dayCandidates[i].weight})` : '')).join(' / '));
    field('eventType', escape(t(`eventType_${eventKind(group)}`)));
    field('eventStart', escape(eventDateLabel(group.start, t)));
    if (eventKind(group) !== 'once') {
      field('eventEnd', escape(eventDateLabel(group.end, t)));
      const filter = group.countFilter ?? { kind: 'all' };
      field('reportCountBasis', filter.kind === 'day' ? dayLink(draft.days.find((day) => day.id === filter.day_schedule_id)) : escape(filter.kind === 'tag' ? t('reportCountTag', { tag: filter.tag }) : t('reportAllDates')));
      if (filter.kind === 'day') referencedDays.add(filter.day_schedule_id);
      if (eventKind(group) === 'probability') {
        field('reportProbability', `${group.probability_percent}%`);
        field('reportCooldown', escape(t('reportCooldownDays', { count: group.cooldown_days })));
      } else field('reportInterval', escape(t('reportEveryEligibleDays', { count: group.interval })));
    }
    field('eventPriority', `${priority(group)}; ${escape(t(group.priority >= 0 ? 'eventBeforeMain' : 'eventAfterMain'))}`);
    field('eventExecutionMode', escape(t(`executionMode_${eventExecutionMode(group)}`)));
    const count = eventCounts(sequence, group, draft);
    field('reportActiveOccurrences', `${count.active}${eventKind(group) === 'probability' ? ` (${escape(t('reportProbabilityCandidate'))})` : ''}`);
    push('');
  }
  for (const { task } of scheduleEventUses(draft)) for (const id of eventDayIds(eventDaySourceFromData(task))) referencedDays.add(id);
  const referencedSlots = new Set(draft.days.filter((day) => referencedDays.has(day.id)).flatMap((day) => dayAssignments(day).map((entry) => entry.id).filter(Boolean)));
  const days = draft.days.filter((day) => includeUnreferenced || referencedDays.has(day.id));
  const slots = draft.slots.filter((slot) => includeUnreferenced || referencedSlots.has(slot.id));
  const uses = dayUses(draft);
  push(`## ${escape(t('reportDays'))}`, '');
  if (!days.length) push(escape(t('reportNoReferencedDays')), '');
  for (const day of days) {
    heading(3, `day-${day.id}`, `${dayNames.get(day.id)}${referencedDays.has(day.id) ? '' : ` [${t('reportUnreferenced')}]`}`);
    field('dayTags', dayTags(day).length ? dayTags(day).map(escape).join(', ') : '—');
    field('dayUses', uses[day.id].roles.map((role) => escape(t(`dayUse_${role}`))).join(', '));
    for (const entry of dayAssignments(day)) {
      const slot = draft.slots.find((item) => item.id === entry.id);
      if (entry.id !== null || typeof entry.target === 'number') push(`- ${escape(assignmentLabel(entry.target, t))}: ${slot ? link(slotNames.get(slot.id), `slot-${slot.id}`) : escape(t('unassigned'))}`);
      const release = typeof entry.target === 'object' && entry.target.edge === 'start' ? day.slotReleases?.[entry.target.index] : null;
      if (release) {
        push(`- ${escape(t('releaseSlotFor', { count: entry.target.index + 1 }))}:`);
        const logic = slotLogicText({ branches: [{ condition: null, task: release }] }, { nodes: draft.operandNodes, tasks: draft.tasks, macros: draft.taskMacros, builtinTasks: draft.builtinTasks, events: catalog, depth: 'all', days: draft.days, t });
        push(...logic.split(/\r\n|[\r\n]/).map((line) => `    ${line}`), '');
      }
    }
    push('');
  }
  push(`## ${escape(t('reportSlotLogic'))}`, '');
  if (!slots.length) push(escape(t('reportNoReferencedSlots')), '');
  const events = catalog.map((group) => ({ ...group, name: eventNames.get(`${group.sequenceId}-${group.id}`) }));
  for (const slot of slots) {
    heading(3, `slot-${slot.id}`, `${slotNames.get(slot.id)}${referencedSlots.has(slot.id) ? '' : ` [${t('reportUnreferenced')}]`}`);
    const logic = slotEntries(slot).length ? slotLogicText(slot, { nodes: draft.operandNodes, tasks: draft.tasks, macros: draft.taskMacros, builtinTasks: draft.builtinTasks, events, depth: 'all', days: draft.days, t }) : t('reportNoTaskAssignment');
    push(...logic.split(/\r\n|[\r\n]/).map((line) => `    ${line}`), '');
  }
  return { data: lines.join('\n'), errors: [] };
}
