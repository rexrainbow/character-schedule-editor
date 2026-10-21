import { createContext, useContext, useId } from 'react';
import { TriangleAlert } from 'lucide-react';
import { engineKeyConflicts } from '../../core/engineKeyModel.js';

export const EngineKeysContext = createContext([]);
export function EngineKeyWarning({ kind, id, value, t }) {
  const conflicts = engineKeyConflicts(useContext(EngineKeysContext), kind, id, value);
  if (!conflicts.length) return null;
  const label = t('engineKeyDuplicate') + '\n' + conflicts.map((item) => `${t(item.kind)}: ${item.name} (${item.id})`).join('\n');
  return <span className="engine-key-warning" role="img" aria-label={label} title={label}><TriangleAlert size={16} /></span>;
}
export default function EngineKeyField({ kind, item, onChange, t }) {
  const id = useId();
  return <label className="engine-key-field" htmlFor={id}><span className="sr-only">{t('engineKey')}</span><input id={id} aria-label={t('engineKey')} title={t('engineKey')} placeholder={t('engineKeyPlaceholder')} value={item.symbol ?? ''} onChange={(event) => onChange(event.target.value)} required pattern="[A-Za-z_][A-Za-z0-9_]*" aria-invalid={!/^[A-Za-z_][A-Za-z0-9_]*$/.test(item.symbol ?? '')} spellCheck={false} /><EngineKeyWarning kind={kind} id={item.id} value={item.symbol} t={t} /></label>;
}
