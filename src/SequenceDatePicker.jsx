import { useState } from 'react';
import { WEEKDAYS } from './scheduleConstants.js';
import { sequenceDate } from './sequenceRange.js';
import { resolveSequenceDay } from './sequenceModel.js';
import { datePosition, eventOccurs } from './sequenceEvents.js';

export default function SequenceDatePicker({ draft, sequence, group, field, onPick, t, executionOnly = false }) {
  const [page, setPage] = useState(Math.max(0, Math.min(Math.ceil(sequence.rows.length / 8) - 1, Math.floor((group[field].week - 1) / 8))));
  const first = page * 8, last = Math.min(first + 8, sequence.rows.length);
  return <section className="event-date-picker">
    <p className="field-hint">{t(executionOnly ? 'simulationDateHint' : field === 'start' ? 'eventMoveHint' : 'eventEndHint')}</p>
    <div className="event-calendar-scroll"><div className="event-calendar-grid"><span />{WEEKDAYS.map((weekday) => <strong key={weekday}>{t(weekday)}</strong>)}
      {sequence.rows.slice(first, last).map((row, offset) => {
        const index = first + offset;
        return <div className="event-calendar-week" key={row.uid}><strong>{t('weekNumber', { count: index + 1 })}</strong>{WEEKDAYS.map((weekday, dayIndex) => {
          const date = { week: index + 1, weekday }, position = index * 7 + dayIndex, info = sequenceDate(sequence, index, weekday), { day } = resolveSequenceDay(draft, row, weekday);
          const selected = datePosition(group[field]) === position, disabled = executionOnly ? !info.active : field === 'end' && position < datePosition(group.start);
          return <button key={weekday} className={`event-calendar-date ${info.active ? '' : 'inactive-date'} ${!executionOnly && eventOccurs(group, position) ? 'occurrence-date' : ''}`} aria-label={`${t('weekNumber', { count: index + 1 })} / ${t(weekday)}`} aria-pressed={selected} title={day?.name || t('unassigned')} disabled={disabled} onClick={() => onPick(date)}><span>{info.active ? t('sequenceDayNumber', { count: info.dayNumber }) : t(info.before ? 'sequenceBeforeStart' : 'sequenceAfterEnd')}</span>{!executionOnly && datePosition(group.start) === position && <small>{t('eventStart')}</small>}</button>;
        })}</div>;
      })}</div></div>
    <div className="event-calendar-pagination"><button className="button secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>{t('eventPreviousWeeks')}</button><span>{t('eventWeeksShown', { first: first + 1, last })}</span><button className="button secondary" disabled={last >= sequence.rows.length} onClick={() => setPage(page + 1)}>{t('eventNextWeeks')}</button></div>
  </section>;
}
