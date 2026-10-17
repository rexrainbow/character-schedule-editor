import OperandTree from './OperandTree.jsx';
import { scopedVariables } from './operandModel.js';

export default function ScopedVariableTree({ nodes, t, ...props }) {
  const layers = ['environment', 'application'].map((scope) => ({ scope, nodes: scopedVariables(nodes, scope) })).filter((layer) => Object.keys(layer.nodes).length);
  if (!layers.length) return <OperandTree nodes={{}} t={t} {...props} />;
  return <div className="scope-tree-list">{layers.map((layer) => <section className="variable-scope" key={layer.scope}><h3>{t(layer.scope === 'environment' ? 'environmentVariables' : 'applicationVariables')}</h3><OperandTree nodes={layer.nodes} t={t} {...props} /></section>)}</div>;
}
