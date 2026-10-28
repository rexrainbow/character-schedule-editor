import { childrenOf, nodePath } from '../../core/operandModel.js';

export default function SimulationVariableInputs({ draft, values, errors, onChange, boundIds = new Set(), t }) {
  function tree(parent, scope) {
    return childrenOf(draft.operandNodes, parent, scope).map(([id, node]) => node.node_type === 'group' ? <details open className="simulation-variable-group" key={id}><summary>{node.display_name}</summary>{tree(id, scope)}</details> : <label className="simulation-variable" key={id}>
      <span title={nodePath(draft.operandNodes, id)}>{node.display_name}{node.read_only && <small>{t('readOnly')}</small>}</span>
      {node.value_type === 'boolean' ? <select disabled={boundIds.has(id)} aria-label={nodePath(draft.operandNodes, id)} value={String(values[id])} onChange={(event) => onChange(id, event.target.value === 'true')}><option value="false">false</option><option value="true">true</option></select> : <input disabled={boundIds.has(id)} aria-label={nodePath(draft.operandNodes, id)} type={node.value_type === 'number' ? 'number' : 'text'} step={node.value_type === 'number' ? node.integer_only ? '1' : 'any' : undefined} aria-invalid={errors.some((error) => error.path === `/values/${id}`)} value={typeof values[id] === node.value_type && !Number.isNaN(values[id]) ? values[id] : ''} onChange={(event) => onChange(id, node.value_type === 'number' ? event.target.value === '' ? NaN : event.target.valueAsNumber : event.target.value)} />}
    </label>);
  }
  return ['environment', 'application'].map((scope) => childrenOf(draft.operandNodes, null, scope).length ? <section key={scope}><h3>{t(scope === 'environment' ? 'environmentVariables' : 'applicationVariables')}</h3>{tree(null, scope)}</section> : null);
}
