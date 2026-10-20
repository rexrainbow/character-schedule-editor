import { DAY_USES, DAY_PURPOSES, dayPurposes, dayUseReason } from '../../core/dayUses.js';
import { DayTagFilter } from './DayTags.jsx';

export function DayPurposeEditor({ day, onChange, t }) {
  const purposes = dayPurposes(day);
  return <section className="day-purpose-editor" aria-label={t('dayUses')}><fieldset title={t('dayUsesHint')} aria-description={t('dayUsesHint')}><legend>{t('dayUses')}</legend><div>{DAY_PURPOSES.map((role) => <label key={role}><input type="checkbox" aria-label={t(`dayUse_${role}`)} checked={purposes.includes(role)} onChange={(event) => onChange({ ...day, purposes: DAY_PURPOSES.filter((key) => key === role ? event.target.checked : purposes.includes(key)) })} />{t(`dayUse_${role}`)}</label>)}</div></fieldset></section>;
}

export function DayPurposeFilter({ value, onChange, t }) {
  return <label className="day-purpose-filter"><span>{t('filterDayUses')}</span><select aria-label={t('filterDayUses')} value={value} onChange={(event) => onChange(event.target.value)}><option value="">{t('allDayUses')}</option>{DAY_USES.map((role) => <option key={role} value={role}>{t(`dayUse_${role}`)}</option>)}</select></label>;
}

export function DayUseChips({ use, onFilter, hideSingle = false, t }) {
  if (!use || hideSingle && use.roles.length === 1) return null;
  return <span className="day-use-chips">{use.roles.map((role) => {
    const label = t(`dayUse_${role}`), reason = dayUseReason(use, role, t);
    return onFilter ? <button type="button" key={role} className={`day-use day-use-${role}`} title={reason} aria-label={t('filterDayUse', { name: label })} onClick={() => onFilter(role)}>{label}</button> : <span key={role} className={`day-use day-use-${role}`} title={reason}>{label}</span>;
  })}</span>;
}

export function DayUseControls({ days, uses, role, onRoleChange, view, onViewChange, tag, onTagChange, t }) {
  return <div className="day-list-controls"><DayTagFilter days={days} value={tag} onChange={onTagChange} t={t} />
    <label><span>{t('filterDayUses')}</span><select aria-label={t('filterDayUses')} value={role} onChange={(event) => onRoleChange(event.target.value)}><option value="">{t('allDayUses')} ({days.length})</option>{DAY_USES.map((key) => <option key={key} value={key}>{t(`dayUse_${key}`)} ({days.filter((day) => uses[day.id]?.roles.includes(key)).length})</option>)}</select></label>
    <label><span>{t('dayListView')}</span><select aria-label={t('dayListView')} value={view} onChange={(event) => onViewChange(event.target.value)}><option value="flat">{t('dayListFlat')}</option><option value="grouped">{t('dayListGrouped')}</option></select></label>
  </div>;
}
