import { useEffect, useId, useState } from 'react';
import { weekRepeatCount } from '../../core/sequenceExecution.js';

export default function WeekRepeatField({ row, last, onChange, t }) {
  const count = weekRepeatCount(row), mode = count === null ? 'infinite' : count === 1 ? 'once' : 'finite';
  const [text, setText] = useState(String(count ?? 1)), [invalid, setInvalid] = useState(false);
  const errorId = useId();
  useEffect(() => { setText(String(count ?? 1)); setInvalid(false); }, [count]);
  function commit() {
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 1 || value > Math.floor(Number.MAX_SAFE_INTEGER / 7)) { setInvalid(true); return; }
    setInvalid(false); onChange(value);
  }
  return <div className="week-repeat-field"><label>{t('weekExecutions')}<select aria-label={t('weekExecutions')} value={mode} onChange={(event) => onChange(event.target.value === 'infinite' ? null : event.target.value === 'finite' ? 2 : 1)}>
    <option value="once">{t('weekRepeatOnce')}</option><option value="finite">{t('weekRepeatFinite')}</option><option value="infinite" disabled={!last}>{t('weekRepeatInfinite')}</option>
  </select></label>{mode === 'finite' && <input type="number" min="1" max={Math.floor(Number.MAX_SAFE_INTEGER / 7)} step="1" aria-label={t('weekRepeatCount')} aria-invalid={invalid} aria-describedby={invalid ? errorId : undefined} value={text} onChange={(event) => { setText(event.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={(event) => { if (event.key === 'Enter') commit(); }} />}{invalid && <span id={errorId} role="alert" className="inline-error">{t('invalidWeekRepeat')}</span>}</div>;
}
