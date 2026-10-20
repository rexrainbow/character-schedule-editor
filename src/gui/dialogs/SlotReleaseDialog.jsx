import { useState } from 'react';
import { Dialog } from '../components/ui.jsx';
import ConditionEditor from '../editors/ConditionEditor.jsx';
import { conditionErrors } from '../../core/operandModel.js';
import { comparison } from '../../core/model.js';
import { createRelease } from '../../core/builtinTaskModel.js';

export default function SlotReleaseDialog({ value, index, nodes, onApply, onRemove, onClose, t }) {
  const [release, setRelease] = useState(() => structuredClone(value ?? createRelease()));
  const errors = release.condition == null ? [] : conditionErrors(release.condition, nodes);
  return <Dialog title={t('releaseSlotFor', { count: index + 1 })} t={t} wide onClose={onClose} footer={<>
    {value && <button className="button secondary danger" onClick={() => { onRemove(); onClose(); }}>{t('removeSlotRelease')}</button>}
    <button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!!errors.length} onClick={() => { onApply(release); onClose(); }}>{t('apply')}</button>
  </>}>
    <p className="field-hint">{t('slotReleaseHint')}</p>
    <label className="slot-release-condition-toggle"><input type="checkbox" checked={release.condition != null} onChange={(event) => setRelease({ ...release, condition: event.target.checked ? comparison() : null })} />{t('releaseConditional')}</label>
    {release.condition == null ? <p>{t('releaseUnconditional')}</p> : <ConditionEditor value={release.condition} nodes={nodes} onChange={(condition) => setRelease({ ...release, condition })} t={t} />}
  </Dialog>;
}
