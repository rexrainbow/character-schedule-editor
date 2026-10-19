import { editProject } from '../../core/projectApi.js';
import SlotDialog from './SlotDialog.jsx';
import { weekDay } from '../../core/weekModel.js';
import { assignmentLabel } from '../../core/dayEvents.js';

export default function WeekSlotDialog({ draft, weekId, weekday, index, onCommit, onClose, t }) {
  const week = draft.weeks.find((item) => item.id === weekId);
  const day = weekDay(draft, weekId, weekday) ?? { name: t('unassigned'), slotIds: Array(draft.project.settings.slots_per_day).fill(null) };
  return <SlotDialog draft={draft} day={day} index={index} onClose={onClose} t={t} weekContext
    contextSubtitle={`${week.name} / ${t(weekday)} / ${assignmentLabel(index, t)}`}
    onApplySlot={(slotId, editedSlot) => onCommit(editProject(draft, t).weeks.assignSlot(weekId, weekday, index, slotId, editedSlot).draft)} />;
}
