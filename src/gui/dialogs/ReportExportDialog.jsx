import { useState } from 'react';
import { Dialog, Issues } from '../components/ui.jsx';

export default function ReportExportDialog({ onExport, onClose, t }) {
  const [includeUnreferenced, setIncludeUnreferenced] = useState(false);
  const [errors, setErrors] = useState([]);
  function download() {
    const issues = onExport({ includeUnreferenced });
    setErrors(issues);
    if (!issues.length) onClose();
  }
  return <Dialog title={t('exportReport')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" onClick={download}>{t('reportDownload')}</button></>}>
    <p>{t('reportScopeHint')}</p>
    <p className="field-hint">{t('reportStaticHint')}</p>
    <label className="readonly-field report-export-options"><input type="checkbox" checked={includeUnreferenced} onChange={(event) => setIncludeUnreferenced(event.target.checked)} /><span>{t('reportIncludeUnreferenced')}</span></label>
    {!!errors.length && <div role="alert"><p>{t('reportExportInvalid')}</p><Issues errors={errors} t={t} /></div>}
  </Dialog>;
}
