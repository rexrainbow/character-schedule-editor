import { useContext, useState } from 'react';
import { EventCatalogContext } from '../contexts/TaskContext.js';
import { eventContractAccepts, eventReferenceErrors } from '../../core/eventReferences.js';
import SlotIcon from '../components/SlotIcon.jsx';
import SelectionDialog from '../dialogs/SelectionDialog.jsx';

export function eventReferenceLabel(value, catalog, parameters, t) {
  if (value?.type === 'current_event_reference') return t('currentEvent');
  if (value?.type === 'parameter_reference') return parameters.find((p) => p.id === value.parameter_id)?.display_name ?? t('chooseEventReference');
  const group = catalog.find((item) => item.id === value?.event_group_id);
  return group ? `${group.name} · ${group.sequenceName}` : t('chooseEventReference');
}
export default function EventReferenceEditor({ value, parameter = { event_kind: 'any' }, parameters = [], label, onChange, t }) {
  const catalog = useContext(EventCatalogContext), [open, setOpen] = useState(false), [search, setSearch] = useState(''), [selected, setSelected] = useState(value);
  const items = catalog.filter((item) => (parameter.event_kind !== 'probability' || item.kind === 'probability') && `${item.name} ${item.sequenceName}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const valid = !eventReferenceErrors(selected, parameter, parameters).length && (selected?.type !== 'event_reference' || items.some((item) => item.id === selected.event_group_id) || catalog.some((item) => item.id === selected.event_group_id && (parameter.event_kind !== 'probability' || item.kind === 'probability')));
  const group = catalog.find((item) => item.id === value?.event_group_id);
  return <><button type="button" className="operand-button event-reference-trigger" aria-label={label ?? t('chooseEventReference')} onClick={() => { setSelected(value); setSearch(''); setOpen(true); }}>{group && <SlotIcon name={group.icon} />}<span>{eventReferenceLabel(value, catalog, parameters, t)}</span></button>
    {open && <SelectionDialog title={t('chooseEventReference')} t={t} onClose={() => setOpen(false)} footer={<><button className="button secondary" onClick={() => setOpen(false)}>{t('cancel')}</button><button className="button primary" disabled={!valid} onClick={() => { onChange(structuredClone(selected)); setOpen(false); }}>{t('apply')}</button></>}>
      <input type="search" autoFocus aria-label={t('searchEvents')} value={search} onChange={(event) => setSearch(event.target.value)} /><p className="field-hint">{t('eventReferenceScopeHint')}</p>
      <div className="selector-list" role="radiogroup" aria-label={t('eventReferences')}><button type="button" className="selector-item" role="radio" aria-checked={selected?.type === 'current_event_reference'} onClick={() => setSelected({ type: 'current_event_reference' })}>{t('currentEvent')}</button>
        {parameters.filter((p) => eventContractAccepts(parameter, p)).map((p) => <button type="button" key={p.id} className="selector-item" role="radio" aria-checked={selected?.parameter_id === p.id} onClick={() => setSelected({ type: 'parameter_reference', parameter_id: p.id })}>{p.display_name}</button>)}
        {items.map((item) => <button type="button" key={item.id} className="selector-item" role="radio" aria-label={`${item.name} · ${item.sequenceName}`} aria-checked={selected?.event_group_id === item.id} onClick={() => setSelected({ type: 'event_reference', event_group_id: item.id })}><SlotIcon name={item.icon} /><span>{item.name}<small>{item.sequenceName} · {t(`eventType_${item.kind}`)}</small></span></button>)}
      </div>
    </SelectionDialog>}
  </>;
}
