import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from 'lucide-react';
import { useContext } from 'react';
import { TaskMacrosContext } from '../contexts/TaskContext.js';
import { IconButton } from '../components/ui.jsx';
import DescriptionField from '../components/DescriptionField.jsx';
import TaskUseEditor from './TaskUseEditor.jsx';
import { OperandEditor } from './ConditionEditor.jsx';
import { createRandomCandidate } from '../../core/taskMacroModel.js';
import { randomWeightErrors } from '../../core/operandModel.js';

export default function WeightedCandidatesEditor({ macro, onChange, tasks, nodes, onOpenMacro, t }) {
  const candidates = macro.candidates, macros = useContext(TaskMacrosContext);
  const update = (index, change) => onChange({ candidates: candidates.map((item, i) => i === index ? { ...item, ...change } : item) });
  const add = () => onChange({ candidates: [...candidates, createRandomCandidate()] });
  function move(index, offset) { const next = [...candidates]; [next[index], next[index + offset]] = [next[index + offset], next[index]]; onChange({ candidates: next }); }
  const staticWeights = candidates.every((item) => item.weight?.type === 'constant' && typeof item.weight.value === 'number' && Number.isFinite(item.weight.value) && item.weight.value >= 0 && !macros.find((other) => other.id === item.task?.task_macro_id)?.eligibility);
  const maximum = candidates.reduce((max, item) => Math.max(max, typeof item.weight?.value === 'number' ? item.weight.value : 0), 0);
  const total = maximum > 0 ? candidates.reduce((sum, item) => sum + (item.weight?.value ?? 0) / maximum, 0) : 0;
  return <section className="task-steps weighted-candidates-editor">
    <div className="section-heading"><h2>{t('weightedCandidates')}<span className="count">{candidates.length}</span></h2><button type="button" className="button secondary" onClick={add}><Plus size={16} />{t('addCandidate')}</button></div>
    {!candidates.length && <p className="field-hint">{t('weightedEmptyHint')}</p>}
    {candidates.map((candidate, index) => <article className="branch-card task-step" key={candidate.id} aria-label={t('candidateNumber', { count: index + 1 })}>
      <div className="branch-header"><strong>{t('candidateNumber', { count: index + 1 })}</strong><div className="row-actions">
        <IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => move(index, -1)} /><IconButton icon={ArrowDown} label={t('down')} disabled={index === candidates.length - 1} onClick={() => move(index, 1)} />
        <IconButton icon={Copy} label={t('duplicateCandidate')} onClick={() => { const next = [...candidates], copy = structuredClone(candidate); copy.id = crypto.randomUUID(); next.splice(index + 1, 0, copy); onChange({ candidates: next }); }} />
        <IconButton icon={Trash2} label={t('deleteCandidate')} danger onClick={() => onChange({ candidates: candidates.filter((_, i) => i !== index) })} />
      </div></div><div className="branch-body">
        <TaskUseEditor showConditionSummary conditionSummaryFirst beforeTask={<div className="candidate-weight"><span className="field-label">{t('randomWeight')}</span><OperandEditor label={t('randomWeight')} numericOnly expectedType="number" value={candidate.weight} nodes={nodes} parameters={macro.parameters} t={t} onChange={(weight) => update(index, { weight })} /><p className="field-hint">{staticWeights && total > 0 ? t('weightedChance', { value: (candidate.weight.value / maximum / total * 100).toFixed(1) }) : t('weightedWeightHint')}</p></div>} branch={candidate} tasks={tasks} nodes={nodes} parameters={macro.parameters} ownerMacroId={macro.id} onOpenMacro={onOpenMacro} onChange={(change) => update(index, change)} t={t} />
        <DescriptionField value={candidate.description} onChange={(description) => update(index, { description })} t={t} />
        {randomWeightErrors(candidate.weight, nodes, '', macro.parameters).map((error, i) => <p key={i} className="inline-error" role="alert">{t(error.key)}</p>)}
      </div></article>)}
    {candidates.length > 0 && <button type="button" className="button add-branch" onClick={add}><Plus size={16} />{t('addCandidate')}</button>}
    <section className="weighted-fallback"><div className="section-heading"><h2>{t('weightedFallback')}</h2>{macro.fallback && <IconButton icon={Trash2} label={t('removeFallback')} onClick={() => onChange({ fallback: null })} />}</div><p className="field-hint">{t('weightedFallbackHint')}</p>
      {macro.fallback ? <><TaskUseEditor showConditionSummary branch={macro.fallback} tasks={tasks} nodes={nodes} parameters={macro.parameters} ownerMacroId={macro.id} onOpenMacro={onOpenMacro} onChange={(change) => onChange({ fallback: { ...macro.fallback, ...change } })} t={t} /><DescriptionField value={macro.fallback.description} onChange={(description) => onChange({ fallback: { ...macro.fallback, description } })} t={t} /></> : <button type="button" className="button add-branch" onClick={() => onChange({ fallback: { task: { task_id: '', arguments: {} } } })}><Plus size={16} />{t('addFallback')}</button>}
    </section>
  </section>;
}
