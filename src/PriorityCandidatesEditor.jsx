import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { IconButton } from './ui.jsx';
import TaskUseEditor from './TaskUseEditor.jsx';
import { TASK_MACRO_MODES } from './operandModel.js';
import { createCandidate } from './taskMacroModel.js';

export default function PriorityCandidatesEditor({ candidates, onChange, tasks, nodes, parameters = [], ownerMacroId, onOpenMacro, t }) {
  function move(index, offset) { const next = [...candidates]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange(next); }
  return <section className="task-steps priority-candidates-editor"><div className="section-heading"><h2>{t('priorityCandidates')}<span className="count">{candidates.length}</span></h2><button className="button secondary" onClick={() => onChange([...candidates, createCandidate()])}><Plus size={16} />{t('addCandidate')}</button></div><p className="field-hint">{t('priorityCandidatesHint')}</p>
    {!candidates.length && <p className="field-hint">{t('emptyCandidatesHint')}</p>}
    {candidates.map((candidate, index) => <article className="branch-card task-step" key={candidate.id} aria-label={t('candidateNumber', { count: index + 1 })}><div className="branch-header"><strong>{t('candidateNumber', { count: index + 1 })}</strong><div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move(index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === candidates.length - 1} onClick={() => move(index, 1)} /><IconButton icon={Copy} label={t('duplicateCandidate')} onClick={() => { const next = [...candidates], copy = structuredClone(candidate); copy.id = crypto.randomUUID(); next.splice(index + 1, 0, copy); onChange(next); }} /><IconButton icon={Trash2} label={t('deleteCandidate')} danger onClick={() => onChange(candidates.filter((item) => item.id !== candidate.id))} /></div></div><div className="branch-body"><TaskUseEditor ownerMacroId={ownerMacroId} macrosOnly showConditionSummary onOpenMacro={onOpenMacro} allowedMacroModes={TASK_MACRO_MODES} parameters={parameters} branch={candidate} tasks={tasks} nodes={nodes} t={t} onChange={(values) => onChange(candidates.map((item) => item.id === candidate.id ? { ...item, ...values } : item))} /></div></article>)}
    {candidates.length > 0 && <button className="button add-branch" onClick={() => onChange([...candidates, createCandidate()])}><Plus size={16} />{t('addCandidate')}</button>}
  </section>;
}
