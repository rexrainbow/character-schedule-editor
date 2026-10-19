import { ArrowDown, ArrowUp, GitBranch, Plus, Trash2 } from 'lucide-react';
import { addBranch, moveBranch, removeBranch } from '../../core/model.js';
import ConditionEditor from './ConditionEditor.jsx';
import TaskUseEditor from './TaskUseEditor.jsx';
import { IconButton } from '../components/ui.jsx';

export default function BranchRulesEditor({ branches, onChange, nodes = {}, tasks = [], parameters = [], allowedMacroModes = ['sequence', 'branch', 'priority'], ownerMacroId, allowEmpty = false, emptyHint = 'emptyMacroHint', renderResult, onAddBranch, emptyActions, t }) {
  function patchBranch(index, values) { onChange(branches.map((branch, i) => i === index ? { ...branch, ...values } : branch)); }
  return (
    <section className="branch-section">
      <div className="section-heading branch-section-heading"><div><h2><GitBranch size={18} />{t('branches')}<span className="count">{branches.length}</span></h2><p>{t('rulesHint')}</p></div></div>
      {allowEmpty && !branches.length && <p className="field-hint">{t(emptyHint)}</p>}
      <div className="branch-list">{branches.map((branch, index) => {
        const isElse = branch.condition === null;
        return <article className={`branch-card ${isElse ? 'else-card' : ''}`} key={branch.uid} aria-label={t('branchLabel', { count: index + 1 })}>
          <div className="branch-header"><div className="branch-title"><span className="branch-index">{String(index + 1).padStart(2, '0')}</span><strong className="branch-badge">{isElse ? 'ELSE' : index === 0 ? 'IF' : 'ELSE IF'}</strong>{isElse && <span className="else-hint">{t('elseHint')}</span>}</div>
            {!isElse && <div className="row-actions"><IconButton icon={ArrowUp} label={t('up')} disabled={index === 0} onClick={() => onChange(moveBranch(branches, index, -1))} /><IconButton icon={ArrowDown} label={t('down')} disabled={index >= branches.length - 2} onClick={() => onChange(moveBranch(branches, index, 1))} /><IconButton icon={Trash2} label={t('removeBranch')} danger onClick={() => onChange(removeBranch(branches, index))} /></div>}
            {isElse && allowEmpty && branches.length === 1 && <IconButton icon={Trash2} label={t('removeBranch')} danger onClick={() => onChange([])} />}
          </div>
          <div className="branch-body">{!isElse ? <div className="condition-field"><span className="field-label">{t('condition')}</span><ConditionEditor parameters={parameters} nodes={nodes} t={t} value={branch.condition} onChange={(condition) => patchBranch(index, { condition })} /></div> : <p className="else-description">{t('elseBody')}</p>}{renderResult ? renderResult(branch, index, (values) => patchBranch(index, values)) : <TaskUseEditor ownerMacroId={ownerMacroId} parameters={parameters} allowedMacroModes={allowedMacroModes} tasks={tasks} nodes={nodes} t={t} branch={branch} onChange={(values) => patchBranch(index, values)} />}</div>
        </article>;
      })}</div>
      <div className={emptyActions && !branches.length ? 'slot-start-actions' : undefined}>{!branches.length && emptyActions}<button className="button add-branch" onClick={() => onAddBranch ? onAddBranch() : onChange(allowEmpty && !branches.length ? [{ uid: crypto.randomUUID(), condition: null, task: { task_id: '', arguments: {} } }] : addBranch(branches))}><Plus size={17} />{t(allowEmpty && !branches.length ? 'addElseBranch' : 'addBranch')}</button></div>
    </section>
  );
}
