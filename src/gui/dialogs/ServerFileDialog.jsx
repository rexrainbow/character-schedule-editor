import { useState } from 'react';
import { Dialog, Issues } from '../components/ui.jsx';

export default function ServerFileDialog({ kind, project, connection, onOpened, onClose, t }) {
  const [path, setPath] = useState(kind === 'save' ? connection.file ?? '' : '');
  const [overwrite, setOverwrite] = useState(false), [busy, setBusy] = useState(false), [errors, setErrors] = useState([]);
  async function apply() {
    if (kind === 'open' && (connection.dirty || connection.localChanges) && !window.confirm(t('importConfirm'))) return;
    setBusy(true); setErrors([]);
    const method = kind === 'save' ? 'saveProject' : /\.ya?ml$/i.test(path) ? 'importBlueprint' : 'openProject';
    const result = await project.serverAction(method, { path, ...(kind === 'save' ? { overwrite } : { discardChanges: true }) }, kind === 'open');
    setBusy(false);
    if (!result.ok) { setErrors(result.errors); return; }
    if (kind === 'open') onOpened(); onClose();
  }
  return <Dialog title={t(kind === 'save' ? 'remoteSave' : 'remoteOpen')} t={t} onClose={() => { if (!busy) onClose(); }} footer={<><button className="button secondary" disabled={busy} onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!path.trim() || busy} onClick={apply}>{t(busy ? 'remoteSubmitting' : kind === 'save' ? 'remoteSave' : 'remoteOpen')}</button></>}>
    <p className="field-hint">{t('remotePathHint', { root: connection.root ?? '' })}</p>
    {kind === 'open' && <p className="field-hint">{t('projectImportFormats')}</p>}
    <label className="server-file-path">{t('remotePath')}<input autoFocus aria-label={t('remotePath')} value={path} disabled={busy} onChange={(event) => setPath(event.target.value)} placeholder="project.json" /></label>
    {kind === 'save' && <label className="checkbox-field"><input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />{t('remoteOverwrite')}</label>}
    {errors.length > 0 && <div role="alert"><Issues errors={errors} t={t} /></div>}
  </Dialog>;
}
