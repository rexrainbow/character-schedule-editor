import { useRef, useState } from 'react';
import { Dialog, Issues } from '../components/ui.jsx';
import { createEnvironmentInfo, validateEnvironment } from '../../core/environmentModel.js';
import { createProjectWithEnvironment } from '../../core/projectApi.js';

export default function NewProjectDialog({ t, onCreate, onClose }) {
  const [name, setName] = useState(t('defaultProjectName')), [count, setCount] = useState('3');
  const [environment, setEnvironment] = useState(null), [errors, setErrors] = useState([]);
  const [info] = useState(() => createEnvironmentInfo(t('newEnvironment')));
  const input = useRef(null);
  const valid = name.trim() && Number.isSafeInteger(Number(count)) && Number(count) >= 1 && !errors.length;
  async function importEnvironment(event) {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const data = JSON.parse((await file.text()).replace(/^\uFEFF/, '')), issues = validateEnvironment(data);
      setErrors(issues); if (issues.length) return;
      setEnvironment(data); setCount(String(data.settings.slots_per_day));
    } catch { setErrors([{ path: '/', key: 'parseError' }]); }
  }
  return <Dialog navigationDirty={name !== t('defaultProjectName') || count !== '3' || !!environment} title={t('newProject')} t={t} onClose={onClose} footer={<><button className="button secondary" onClick={onClose}>{t('cancel')}</button><button className="button primary" disabled={!valid} onClick={() => onCreate(createProjectWithEnvironment(name, Number(count), environment, info, t))}>{t('createProject')}</button></>}>
    <div className="settings-form"><label><span className="field-label">{t('projectName')}</span><input autoFocus aria-label={t('projectName')} value={name} onChange={(event) => setName(event.target.value)} /></label>
      <section className="environment-summary"><h3>{t('environmentSettings')}</h3>{environment ? <><strong>{environment.environment.display_name}</strong><p>{t('environmentVersion')}: {environment.environment.version}</p><p>{t('environmentCounts', { variables: Object.keys(environment.operand_nodes).length, expressions: Object.keys(environment.expression_macros ?? {}).length, tasks: Object.keys(environment.tasks).length })}</p></> : <p>{t('noEnvironment')}</p>}
        {environment && <p>{t('enumDefinitionCount', { count: Object.values(environment.enum_definitions ?? {}).filter((node) => node.node_type === 'enum').length })}</p>}
        <div className="welcome-actions"><button className="button secondary" onClick={() => input.current.click()}>{t('importEnvironment')}</button><button className="button secondary" disabled={!environment && !errors.length} onClick={() => { setEnvironment(null); setErrors([]); setCount('3'); }}>{t('removeEnvironment')}</button></div>
        <input className="sr-only" ref={input} type="file" accept=".json,application/json" aria-label={t('importEnvironment')} onChange={importEnvironment} />
      </section>
      <label><span className="field-label">{t('slotsPerDay')}</span><input type="number" min="1" step="1" aria-label={t('slotsPerDay')} value={count} readOnly={!!environment} onChange={(event) => setCount(event.target.value)} /><span className="field-hint">{t(environment ? 'environmentCountLocked' : 'slotsPerDayHint')}</span></label>
      {!!errors.length && <Issues errors={errors} t={t} />}
    </div>
  </Dialog>;
}
