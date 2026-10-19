import { useState } from 'react';
import { createEnvironmentInfo } from '../../core/environmentModel.js';
import { Dialog } from '../components/ui.jsx';

export default function EnvironmentSettings({ draft, t, onSave, onClose }) {
  const [info, setInfo] = useState(() => draft.environment ?? createEnvironmentInfo(t('newEnvironment')));
  const [count, setCount] = useState(String(draft.project.settings.slots_per_day));
  const valid = info.display_name.trim() && info.version.trim() && Number.isSafeInteger(Number(count)) && Number(count) >= 1;
  return <Dialog title={t('environmentSettings')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!valid} onClick={() => onSave(info, Number(count))}>{t('save')}</button></>}>
    <div className="settings-form"><label><span className="field-label">{t('environmentName')}</span><input autoFocus aria-label={t('environmentName')} value={info.display_name} onChange={(event) => setInfo({ ...info, display_name: event.target.value })} /></label>
      <label><span className="field-label">{t('environmentId')}</span><input aria-label={t('environmentId')} readOnly value={info.id} /></label>
      <label><span className="field-label">{t('environmentVersion')}</span><input aria-label={t('environmentVersion')} value={info.version} onChange={(event) => setInfo({ ...info, version: event.target.value })} /></label>
      <label><span className="field-label">{t('slotsPerDay')}</span><input aria-label={t('slotsPerDay')} type="number" min="1" step="1" value={count} readOnly={draft.days.length > 0} onChange={(event) => setCount(event.target.value)} /><span className="field-hint">{t(draft.days.length ? 'settingsLocked' : 'slotsPerDayHint')}</span></label>
    </div>
  </Dialog>;
}
