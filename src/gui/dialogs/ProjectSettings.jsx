import { useState } from 'react';
import { Dialog, FieldError } from '../components/ui.jsx';

export default function ProjectSettings({ draft, onSave, onClose, t }) {
  const [name, setName] = useState(draft.project.name);
  const [count, setCount] = useState(String(draft.project.settings.slots_per_day));
  const locked = draft.days.length > 0 || !!draft.environment;
  const validCount = Number.isSafeInteger(Number(count)) && Number(count) >= 1 && count.trim() !== '';
  const valid = name.length > 0 && validCount;
  const save = () => { if (valid) onSave({ ...draft.project, name, settings: { slots_per_day: Number(count) } }); };
  return <Dialog title={t('settings')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!valid} onClick={save}>{t('save')}</button></>}>
    <form noValidate className="settings-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
      <label><span className="field-label">{t('projectName')}</span><input autoFocus aria-label={t('projectName')} value={name} aria-invalid={!name.length} onChange={(e) => setName(e.target.value)} /><FieldError show={!name.length} t={t} /></label>
      <label><span className="field-label">{t('slotsPerDay')}</span><input aria-label={t('slotsPerDay')} type="number" min="1" step="1" readOnly={locked} value={count} aria-invalid={!validCount} onChange={(e) => setCount(e.target.value)} /><span className="field-hint">{t(draft.environment ? 'environmentCountLocked' : locked ? 'settingsLocked' : 'slotsPerDayHint')}</span><FieldError show={!validCount} t={t} message="positiveInteger" /></label>
    </form>
  </Dialog>;
}
