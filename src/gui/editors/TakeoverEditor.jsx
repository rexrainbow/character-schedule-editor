import ConditionEditor from './ConditionEditor.jsx';
import { useBuiltinTaskDefinitions } from '../hooks/builtinTasks.js';
import { taskUseErrors } from '../../core/operandModel.js';

export default function TakeoverEditor({ value, nodes, parameters = [], onChange, t }) {
  const definition = useBuiltinTaskDefinitions(t).find((item) => item.id === 'builtin:schedule_takeover');
  const names = Object.fromEntries(definition.parameters.map((p) => [p.id, p.display_name]));
  return <div className="takeover-editor"><p className="field-hint">{t('takeoverHint')}</p><span className="field-label">{names.condition}</span>
    {value.condition && <ConditionEditor value={value.condition} nodes={nodes} parameters={parameters} onChange={(condition) => onChange({ ...value, condition })} t={t} />}
    <div className="takeover-options">{['scope', 'target'].map((key) => <label key={key}>{names[key]}<select aria-label={names[key]} value={value[key]} onChange={(event) => onChange({ ...value, [key]: event.target.value })}>{(key === 'scope' ? ['slot', 'day'] : ['main', 'lower_priority']).map((option) => <option key={option} value={option}>{t(`takeover_${option}`)}</option>)}</select></label>)}</div>
    <p className="field-hint">{t(value.scope === 'slot' ? 'takeoverSlotHint' : 'takeoverDayHint')}</p>
    {taskUseErrors(value, [], nodes, '', parameters).filter((error) => !error.path.startsWith('/condition/')).map((error, index) => <p key={index} className="inline-error" role="alert">{t(error.key)}</p>)}
  </div>;
}
