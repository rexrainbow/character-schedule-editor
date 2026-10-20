import SelectionDialog from './SelectionDialog.jsx';
import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { Dialog, SlotInfo } from '../components/ui.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import { eventDayCandidates, eventDaySourceMode } from '../../core/eventDaySource.js';
import { eventGroupName } from '../../core/sequenceEvents.js';
import { dayAssignments, assignmentLabel } from '../../core/dayEvents.js';
import { formatCondition } from '../../core/operandModel.js';
import useVisibleRows from '../hooks/useVisibleRows.js';

function EventCandidatesContent({ draft, group, view, onViewChange, onOpenDay, onOpenSlot, t }) {
  const candidates = eventDayCandidates(group), mode = eventDaySourceMode(group);
  const days = new Map(draft.days.map((day) => [day.id, day])), slots = new Map(draft.slots.map((slot) => [slot.id, slot]));
  const selectedId = candidates.some((item) => item.dayId === view.selectedId) ? view.selectedId : candidates[0]?.dayId;
  const day = days.get(selectedId), listRef = useRef(null);
  const entries = useMemo(() => day ? dayAssignments(day).flatMap((entry) => [
    ...(view.showAll || typeof entry.target === 'number' || entry.id != null ? [entry] : []),
    ...(typeof entry.target === 'object' && entry.target.edge === 'start' && (view.showAll || day.slotReleases?.[entry.target.index]) ? [{ release: day.slotReleases?.[entry.target.index], releaseIndex: entry.target.index, path: `/slot_releases/${entry.target.index}` }] : []),
  ]) : [], [day, view.showAll]);
  const heights = useMemo(() => entries.map((entry) => entry.releaseIndex !== undefined ? 86 : typeof entry.target === 'number' ? 110 : 66), [entries]);
  const { ref, first, end, offsets, totalHeight, onScroll } = useVisibleRows(entries.length, heights, 0, `${selectedId}:${!!view.showAll}`);
  useEffect(() => {
    if (ref.current) { ref.current.scrollTop = view.scrollTop ?? 0; onScroll({ currentTarget: ref.current }); }
    if (listRef.current) listRef.current.scrollTop = view.listScrollTop ?? 0;
  }, [selectedId, view.showAll]);
  const maxWeight = candidates.reduce((max, item) => Math.max(max, item.weight || 0), 1);
  const weightTotal = candidates.reduce((total, item) => total + (item.weight || 0) / maxWeight, 0);
  function navigate(kind, item) {
    onViewChange({ ...view, selectedId, scrollTop: ref.current?.scrollTop ?? 0, listScrollTop: listRef.current?.scrollTop ?? 0, open: false, returning: true });
    if (kind === 'day') onOpenDay(item); else onOpenSlot(item);
  }
  return <div className="event-candidates-content">
      <div className="event-candidates-heading"><span className="entity-name"><SlotIcon name={group.icon} /><strong>{eventGroupName(group, draft.days)}</strong></span><span>{t(`eventSource_${mode}`)}</span><span className="field-hint">{t('readOnly')}</span></div>
      <div className="event-candidates-layout">
        <aside className="event-candidates-sidebar">
          {candidates.length > 8 && <label className="search-field"><Search size={15} /><input type="search" aria-label={t('searchEventCandidates')} placeholder={t('searchEventCandidates')} value={view.search ?? ''} onChange={(e) => onViewChange({ ...view, search: e.target.value })} /></label>}
          <div className="event-candidates-list" ref={listRef} aria-label={t('eventCandidateDays')}>
            {candidates.map((item, index) => ({ item, index, day: days.get(item.dayId) })).filter(({ day }) => (day?.name ?? '').toLocaleLowerCase().includes((view.search ?? '').trim().toLocaleLowerCase())).map(({ item, index, day }) => <button type="button" key={item.dayId} className={`event-candidate-choice ${item.dayId === selectedId ? 'selected' : ''}`} aria-label={day?.name || t('unassigned')} aria-pressed={item.dayId === selectedId} onClick={() => onViewChange({ ...view, selectedId: item.dayId, scrollTop: 0 })}>
              <span className="entity-name">{mode === 'sequential' && <span>{index + 1}.</span>}<SlotIcon name={day?.icon} /><strong>{day?.name || t('unassigned')}</strong></span>
              {mode === 'random' && <small>{t('eventWeight')}: {item.weight} · {Number.isFinite(item.weight) && item.weight > 0 && Number.isFinite(weightTotal) && weightTotal > 0 ? `${(item.weight / maxWeight / weightTotal * 100).toFixed(1)}%` : '\u2014'}</small>}
            </button>)}
            {view.search && !candidates.some((item) => days.get(item.dayId)?.name.toLocaleLowerCase().includes(view.search.trim().toLocaleLowerCase())) && <p className="field-hint">{t('noDayResults')}</p>}
          </div>
        </aside>
        <section className="event-candidate-detail" aria-label={t('eventCandidateDetails')}>
          {day ? <><div className="event-candidate-day-heading"><span className="entity-name"><SlotIcon name={day.icon} /><strong>{day.name}</strong></span>{onOpenDay && <button type="button" className="icon-button" aria-label={t('openDayEditor')} title={t('openDayEditor')} onClick={() => navigate('day', day)}><ExternalLink size={16} /></button>}</div>
            {day.engine_key && <p className="field-hint">{day.engine_key}</p>}
            <button className="button secondary event-visibility" aria-expanded={!!view.showAll} onClick={() => onViewChange({ ...view, showAll: !view.showAll, scrollTop: 0 })}>{view.showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />}{t(view.showAll ? 'showConfiguredPositions' : 'showAllPositions')}</button>
            <div className="event-candidate-rows" ref={ref} onScroll={onScroll}><div style={{ height: totalHeight, position: 'relative' }}>
              {entries.slice(first, end).map((entry, offset) => {
                const index = first + offset, slot = slots.get(entry.id), release = entry.releaseIndex !== undefined;
                return <div key={entry.path} className={`event-candidate-row ${release ? 'release' : typeof entry.target === 'number' ? 'main' : 'boundary'}`} style={{ position: 'absolute', top: offsets[index], height: heights[index] - 8 }}>
                  <span className="event-candidate-position">{release ? t('releaseSlotFor', { count: entry.releaseIndex + 1 }) : assignmentLabel(entry.target, t)}</span>
                  <div className="event-candidate-value">{release ? entry.release ? entry.release.condition == null ? t('releaseUnconditional') : formatCondition(entry.release.condition, draft.operandNodes) : t('unassigned') : slot ? <SlotInfo slot={slot} t={t} /> : t('unassigned')}</div>
                  {slot && onOpenSlot && <button className="icon-button" aria-label={typeof entry.target === 'number' ? t('openSlotFor', { count: entry.target + 1, name: slot.name }) : t('openEventSlot', { event: assignmentLabel(entry.target, t), name: slot.name })} title={t('openSlotEditor')} onClick={() => navigate('slot', slot)}><ExternalLink size={16} /></button>}
                </div>;
              })}
            </div></div>
          </> : <p>{t('unassigned')}</p>}
        </section>
      </div>
    </div>;
}

export default function EventCandidatesDialog({ embedded = false, returnLabel, onClose, t, ...props }) {
  const Container = embedded ? SelectionDialog : Dialog;
  return <Container title={t('eventCandidatesViewer')} wide className="event-candidates-dialog" onClose={onClose} t={t} footer={<button className="button secondary" onClick={onClose}>{returnLabel ?? t(embedded ? 'returnEventManager' : 'close')}</button>}>
    <EventCandidatesContent {...props} t={t} />
  </Container>;
}
