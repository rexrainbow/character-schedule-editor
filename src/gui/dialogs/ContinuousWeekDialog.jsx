import { Dialog } from '../components/ui.jsx';
import SlotIcon from '../components/SlotIcon.jsx';
import { showValue, deltaText } from './ContinuousDayDialog.jsx';
import { nodePath } from '../../core/operandModel.js';

export default function ContinuousWeekDialog({ draft, week, onClose, onInspect, t }) {
  return <Dialog title={t('continuousWeekTitle', { week: week.weekNumber })} subtitle={`${t('continuousDayRange', { first: week.firstDay, last: week.lastDay })}${week.partial ? ` · ${t('continuousPartialWeek')}` : ''}`} t={t} wide onClose={onClose} footer={<><button className="button secondary" onClick={onInspect}>{t('continuousInspectWeekEnd')}</button><button className="button secondary" onClick={onClose}>{t('close')}</button></>}>
    <p>{t('continuousTotals', { events: week.events, tasks: week.tasks })}</p>
    <h3>{t('eventGroups')}</h3><ul className="continuous-source-list">{Object.values(week.eventCounts).map(({ event, count }) => <li key={event.eventRef}><SlotIcon name={draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []).find((item) => item.id === event.eventRef)?.icon ?? draft.days.find((item) => item.id === event.dayRef)?.icon} /><span>{event.name} ×{count}</span></li>)}</ul>
    <h3>{t('continuousExecutionSummary')}</h3><ul>{Object.entries(week.slots).map(([id, count]) => <li key={id}>{draft.slots.find((slot) => slot.id === id)?.name} ×{count}</li>)}</ul>
    <h3>{t('continuousWeekSnapshot')}</h3><table className="simulation-change-table"><thead><tr><th>{t('nodeName')}</th><th>{t('simulationBefore')}</th><th>{t('simulationAfter')}</th><th>{t('continuousDelta')}</th></tr></thead><tbody>{Object.keys(week.after).map((id) => <tr key={id}><td>{nodePath(draft.operandNodes, id)}</td><td>{showValue(week.before[id])}</td><td>{showValue(week.after[id])}</td><td>{deltaText(week.before[id], week.after[id])}</td></tr>)}</tbody></table>
  </Dialog>;
}
