import { Dialog, Issues } from './ui.jsx';

export default function EnvironmentImportDialog({ preview, current, t, onApply, onClose }) {
  return <Dialog title={t('reviewEnvironment')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={preview.result.errors.length > 0} onClick={() => onApply(preview.result.draft)}>{t('apply')}</button></>}>
    <div className="environment-summary"><p>{t('currentEnvironment')}: {current?.display_name ?? t('noEnvironment')}</p><h3>{preview.data.environment.display_name}</h3><p>{t('environmentVersion')}: {preview.data.environment.version}</p><p>{t('slotsPerDay')}: {preview.data.settings.slots_per_day}</p>
      <p>{t('environmentCounts', { variables: Object.keys(preview.data.operand_nodes).length, expressions: Object.keys(preview.data.expression_macros ?? {}).length, tasks: Object.keys(preview.data.tasks).length })}</p><p>{t('environmentReconnected', preview.result.stats)}</p><p className="field-hint">{t('environmentReplaceHint')}</p>
    </div>{!!preview.result.errors.length && <Issues errors={preview.result.errors} t={t} />}
  </Dialog>;
}
