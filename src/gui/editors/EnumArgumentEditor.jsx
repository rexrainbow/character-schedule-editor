import { enumAccepts, resolveEnumParameter, resolveEnumParameters } from '../../core/enumParameters.js';
import { useContext } from 'react';
import { EnumDefinitionsContext } from '../contexts/TaskContext.js';

export default function EnumArgumentEditor({ value, parameter, parameters = [], label = parameter.display_name, literal = false, onChange, t }) {
  const definitions = useContext(EnumDefinitionsContext);
  parameter = resolveEnumParameter(parameter, definitions); parameters = resolveEnumParameters(parameters, definitions);
  const locals = parameters.filter((item) => enumAccepts(parameter, item));
  const selected = value?.type === 'parameter_reference' ? `parameter:${value.parameter_id}` : literal && typeof value === 'string' ? value : value?.type === 'constant' && typeof value.value === 'string' ? `option:${value.value}` : '';
  const choices = [...parameter.options.map((option) => literal ? option.value : `option:${option.value}`), ...locals.map((item) => `parameter:${item.id}`)];
  return <label className="enum-argument-field">{label}<select aria-label={label} value={choices.includes(selected) ? selected : ''} aria-invalid={!choices.includes(selected)} onChange={(event) => { const next = event.target.value; onChange(next.startsWith('parameter:') ? { type: 'parameter_reference', parameter_id: next.slice(10) } : literal ? next : { type: 'constant', value: next.slice(7) }); }}><option value="" disabled>{t('chooseEnumOption')}</option><optgroup label={t('enumFixedOptions')}>{parameter.options.map((option) => <option key={option.value} value={literal ? option.value : `option:${option.value}`}>{option.display_name}</option>)}</optgroup>{!!locals.length && <optgroup label={t('enumParameterOptions')}>{locals.map((item) => <option key={item.id} value={`parameter:${item.id}`}>{item.display_name}</option>)}</optgroup>}</select></label>;
}
