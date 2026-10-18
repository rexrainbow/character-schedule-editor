import { useContext, useId, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { TaskMacrosContext, BuiltinTasksContext } from './TaskContext.js';
import { slotLogicText } from './logicOverviewModel.js';

const preferenceKey = 'schedule-editor-logic-overview';
function preferences() { try { return JSON.parse(localStorage.getItem(preferenceKey)) ?? {}; } catch { return {}; } }
export default function LogicOverview({ slot, nodes, tasks, t }) {
  const macros = useContext(TaskMacrosContext), builtinTasks = useContext(BuiltinTasksContext), id = useId();
  const [view, setView] = useState(() => { const saved = preferences(); return { open: saved.open === true, depth: ['summary', 'one', 'all'].includes(saved.depth) ? saved.depth : 'summary' }; });
  function change(patch) { const next = { ...view, ...patch }; setView(next); try { localStorage.setItem(preferenceKey, JSON.stringify(next)); } catch { /* Optional UI preference. */ } }
  return <section className="logic-overview"><button type="button" className="button secondary logic-overview-toggle" aria-expanded={view.open} aria-controls={id} onClick={() => change({ open: !view.open })}>{view.open ? <ChevronDown size={16} /> : <ChevronRight size={16} />}{t('logicOverview')}</button>
    {view.open && <div id={id} className="logic-overview-body"><label>{t('logicDepth')}<select aria-label={t('logicDepth')} value={view.depth} onChange={(event) => change({ depth: event.target.value })}>{['summary', 'one', 'all'].map((depth) => <option key={depth} value={depth}>{t(`logicDepth_${depth}`)}</option>)}</select></label><p className="field-hint">{t('logicStaticHint')}</p><pre aria-label={t('logicOverview')}>{slotLogicText(slot, { nodes, tasks, macros, builtinTasks, depth: view.depth, t })}</pre></div>}
  </section>;
}
