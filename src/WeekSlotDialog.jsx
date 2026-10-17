import SlotDialog from './SlotDialog.jsx';
import { changeWeekCell, weekDay } from './weekModel.js';

export default function WeekSlotDialog({ draft, weekId, weekday, index, onCommit, onClose, t }) {
  const week = draft.weeks.find((item) => item.id === weekId);
  const day = weekDay(draft, weekId, weekday) ?? { name: t('unassigned'), slotIds: Array(draft.project.settings.slots_per_day).fill(null) };
  return <SlotDialog draft={draft} day={day} index={index} onClose={onClose} t={t} weekContext
    contextSubtitle={t('weekCellSource', { name: week.name, weekday: t(weekday), count: index + 1 })}
    onApplySlot={(slotId, editedSlot) => onCommit(changeWeekCell(draft, weekId, weekday, index, slotId, editedSlot))} />;
}
