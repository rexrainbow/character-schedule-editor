import { useContext, useState } from 'react';
import { EnumDefinitionsContext } from '../contexts/TaskContext.js';
import { resolveEnumParameter } from '../../core/enumParameters.js';
import { enumPath, enumScope } from '../../core/enumDefinitions.js';
import EnumOptionsEditor from '../editors/EnumOptionsEditor.jsx';
import SlotIcon from './SlotIcon.jsx';
import IconField from './IconField.jsx';
import OperandTree from './OperandTree.jsx';
import SelectionDialog from '../dialogs/SelectionDialog.jsx';

export default function ParameterContractFields({ parameter: p, locked = false, scope = 'application', onChange, onOptionIcon, t }) {
  const definitions = useContext(EnumDefinitionsContext), [referenceMode, setReferenceMode] = useState(p.enum_id !== undefined), [picker, setPicker] = useState(false), [search, setSearch] = useState('');
  const referenced = p.enum_id !== undefined, referenceView = referenced || referenceMode;
  const available = Object.fromEntries(Object.entries(definitions).filter(([, node]) => scope === 'application' || enumScope(node) === 'environment'));
  const resolved = resolveEnumParameter(p, definitions), source = definitions[p.enum_id];
  function changeSource(value) {
    if (value === 'reference') { setReferenceMode(true); return; }
    onChange({ options: structuredClone(resolved.options ?? [{ display_name: '', value: '' }]) }); setReferenceMode(false);
  }
  return <div className="parameter-contract-fields"><label>{t('parameterType')}<select aria-label={t('parameterType')} disabled={locked} value={p.type} onChange={(event) => { setReferenceMode(false); onChange(event.target.value); }}>{(locked ? [p.type] : ['number', 'string', 'boolean', 'enum', 'variable_reference', 'event_reference']).map((type) => <option key={type} value={type}>{t('type_' + type)}</option>)}</select></label>
    {p.type === 'enum' && (locked ? <fieldset className="enum-options-editor"><legend>{t('enumOptions')}</legend><ul className="enum-options-preview">{(resolved.options ?? []).map((option) => <li key={option.value}><span className="enum-option-name"><IconField value={option.icon} onChange={(icon) => onOptionIcon?.(option.value, icon)} t={t} />{option.display_name}</span><code>{option.value}</code></li>)}</ul></fieldset> : <fieldset className="enum-options-editor" disabled={locked}><legend>{t('enumOptions')}</legend><label>{t('enumOptionSource')}<select aria-label={t('enumOptionSource')} value={referenceView ? 'reference' : 'inline'} onChange={(event) => changeSource(event.target.value)}><option value="inline">{t('enumSourceInline')}</option><option value="reference">{t('enumSourceReference')}</option></select></label>
      {referenceView ? <><button type="button" className="button secondary enum-source-trigger" aria-label={t('chooseEnumDefinition')} onClick={() => { setSearch(''); setPicker(true); }}>{source && <SlotIcon name={source.icon} />}{source ? enumPath(definitions, p.enum_id) : t('chooseEnumDefinition')}</button>{!source && <p className="inline-error">{t('missingEnumDefinition')}</p>}<ul className="enum-options-preview">{(resolved.options ?? []).map((option, index) => <li key={index}><span className="enum-option-name"><SlotIcon name={option.icon} />{option.display_name}</span><code>{option.value}</code></li>)}</ul></> : <EnumOptionsEditor options={p.options} onChange={(options) => onChange({ options })} t={t} />}
    </fieldset>)}
    {picker && <SelectionDialog title={t('chooseEnumDefinition')} onClose={() => setPicker(false)} t={t} footer={<button className="button secondary" onClick={() => setPicker(false)}>{t('cancel')}</button>}><input type="search" autoFocus aria-label={t('searchEnums')} placeholder={t('searchEnums')} value={search} onChange={(event) => setSearch(event.target.value)} />{(scope === 'application' ? ['application', 'environment'] : ['environment']).map((layer) => <section key={layer}><h3>{t(layer === 'application' ? 'applicationEnumSource' : 'environmentEnumSource')}</h3><OperandTree nodes={Object.fromEntries(Object.entries(available).filter(([, node]) => enumScope(node) === layer))} selected={p.enum_id} selectable="enum" collection="enums" treeLabel="enumTree" emptyLabel="noEnums" search={search} onSelect={(enum_id) => { onChange({ enum_id }); setPicker(false); }} t={t} /></section>)}</SelectionDialog>}
    {p.type === 'event_reference' && <label>{t('eventKindConstraint')}<select aria-label={t('eventKindConstraint')} disabled={locked} value={p.event_kind ?? 'any'} onChange={(event) => onChange({ event_kind: event.target.value })}>{['any', 'probability'].map((kind) => <option key={kind} value={kind}>{t(`eventConstraint_${kind}`)}</option>)}</select></label>}
    {!locked && p.type === 'variable_reference' && <div className="reference-constraints"><label>{t('referenceValueType')}<select aria-label={t('referenceValueType')} value={p.value_type} onChange={(event) => onChange({ value_type: event.target.value })}>{['number', 'string', 'boolean', 'any'].map((type) => <option key={type} value={type}>{t(type === 'any' ? 'anyVariableType' : 'type_' + type)}</option>)}</select></label><label>{t('referenceAccess')}<select aria-label={t('referenceAccess')} value={p.access} onChange={(event) => onChange({ access: event.target.value })}>{['read', 'write', 'read_write'].map((access) => <option key={access} value={access}>{t('access_' + access)}</option>)}</select></label></div>}
  </div>;
}
