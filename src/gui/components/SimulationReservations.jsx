import SlotIcon from './SlotIcon.jsx';
import { eventDateLabel } from '../../core/sequenceEvents.js';
import { reservationSourceText } from '../../core/scheduledEvents.js';

export default function SimulationReservations({ reservations, days, t }) {
  if (!reservations?.length) return null;
  return <section className="simulation-reservations"><h3>{t('simulationReservations')}</h3><p className="field-hint">{t('simulationReservationsHint')}</p>{reservations.map((item) => <article key={item.id}><span className="entity-name"><SlotIcon name={item.icon} /><strong>{item.display_name}</strong></span><p>{eventDateLabel({ week: item.start.week_number, weekday: item.start.weekday }, t)}</p><p>{reservationSourceText(item, days, t)}</p><p>{t(`executionMode_${item.execution_mode}`)} · {t('eventPriority')}: {item.priority}</p></article>)}</section>;
}
