import { useEffect, useId, useMemo, useRef } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { continuousTrendSeries, continuousTrendEvents } from '../../simulation/trends.js';
import { nodePath } from '../../core/operandModel.js';
import { colorIcons, iconLabel } from '../../icons/catalog.js';
import SlotIcon from './SlotIcon.jsx';

function ValueTooltip({ active, payload, label, name, weekdays, markers, activeDay, t, format }) {
  useEffect(() => { if (active && Number.isSafeInteger(Number(label))) activeDay.current = Number(label); }, [active, label, activeDay]);
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const weekday = weekdays.get(Number(label));
  return <div className="continuous-trend-tooltip" role="tooltip"><strong>{t('sequenceDayNumber', { count: label })}</strong>{weekday ? <div>{t(weekday)}</div> : Number(label) === 0 && <div>{t('initialValue')}</div>}<div>{name}: {typeof value === 'number' ? format(value) : '—'}</div>{(markers.get(Number(label)) ?? []).map((event) => <div className="trend-tooltip-event" key={event.id}><span className="trend-event-swatch" style={{ background: event.color }} />{event.name}</div>)}</div>;
}

export default function ContinuousTrendCharts({ result, draft, nodes, selectedIds, onSelectChange, selectedEvents = [], eventColors = {}, onEventsChange, onColorChange, onOpenDay, t }) {
  const prefix = useId();
  const activeDay = useRef(0);
  const numericIds = Object.keys(result.initialValues ?? result.days[0]?.after ?? {}).filter((id) => nodes[id]?.value_type === 'number' && nodes[id]?.source !== 'computed');
  const series = useMemo(() => continuousTrendSeries(result, nodes, selectedIds), [result, nodes, selectedIds]);
  const weekdays = useMemo(() => new Map(result.days.map((day) => [day.dayNumber, day.weekday])), [result.days]);
  const events = useMemo(() => continuousTrendEvents(result), [result.days]);
  const locale = document.documentElement.lang || 'en';
  const eventColor = (event, index) => colorIcons.find((color) => color.id === eventColors[event.id]) ?? colorIcons[index % colorIcons.length];
  const markers = new Map();
  events.forEach((event, index) => {
    if (!selectedEvents.includes(event.id)) return;
    for (const day of event.days) markers.set(day, [...(markers.get(day) ?? []), { ...event, color: eventColor(event, index).color }]);
  });
  const numberFormat = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 8 }), [locale]);
  const format = (value) => numberFormat.format(value);
  const endDay = result.days.at(-1)?.dayNumber ?? 0;
  return <section className="continuous-trends" aria-label={t('continuousTrends')}>
    <p className="field-hint">{t('trendHint')}</p>
    <fieldset className="continuous-trend-options"><legend>{t('trendVariables')}</legend>{numericIds.map((id) => <label key={id}><input type="checkbox" checked={selectedIds.includes(id)} onChange={(event) => onSelectChange(event.target.checked ? [...selectedIds, id] : selectedIds.filter((item) => item !== id))} />{nodePath(nodes, id)}</label>)}</fieldset>
    <details className="trend-event-options" open><summary>{t('trendMarkEvents')}</summary>{!events.length && <p className="field-hint">{t('trendNoEvents')}</p>}{events.map((event, index) => {
      const color = eventColor(event, index), group = draft.sequences.flatMap((sequence) => sequence.eventGroups ?? []).find((item) => item.id === event.id);
      return <div className="trend-event-option" key={event.id}><label><input type="checkbox" aria-label={t('trendMarkEvent', { name: event.name })} checked={selectedEvents.includes(event.id)} onChange={(input) => onEventsChange(input.target.checked ? [...selectedEvents, event.id] : selectedEvents.filter((id) => id !== event.id))} /><SlotIcon name={group?.icon ?? draft.days.find((item) => item.id === event.dayRef)?.icon} /><span>{event.name} ({event.days.length})</span></label><span className="trend-event-swatch" style={{ background: color.color }} /><select aria-label={t('trendEventColor', { name: event.name })} value={color.id} onChange={(input) => onColorChange(event.id, input.target.value)}>{colorIcons.map((item) => <option key={item.id} value={item.id}>{iconLabel(item, locale)}</option>)}</select></div>;
    })}</details>
    {!numericIds.length ? <p className="field-hint">{t('trendNoNumericVariables')}</p> : !series.length ? <p className="field-hint">{t('trendChooseVariables')}</p> : <p className="field-hint">{t('trendInteractionHint')}</p>}
    {series.map(({ id, points }) => {
      const name = nodePath(nodes, id), heading = `${prefix}-${id}`;
      const values = points.map((point) => point.value).filter((value) => typeof value === 'number');
      const constant = values.length > 0 && values.every((value) => value === values[0]);
      const padding = Math.max(1, Math.abs(values[0] ?? 0) * .05);
      const constantDomain = [values[0] - padding, values[0] + padding];
      const domain = constant && constantDomain.every(Number.isFinite) ? constantDomain : ['auto', 'auto'];
      return <figure className="continuous-trend-figure" key={id} aria-labelledby={heading} data-variable-id={id} onKeyDownCapture={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); const day = Number(event.target.closest?.('.continuous-trend-point')?.dataset.day ?? activeDay.current); if (day > 0) onOpenDay(day); } }}>
        <figcaption id={heading}><strong>{name}</strong><span>{t('continuousDayRange', { first: 0, last: endDay })}</span></figcaption>
        <ResponsiveContainer width="100%" height={224} minWidth={1} initialDimension={{ width: 320, height: 224 }}>
          <LineChart data={points} syncId={prefix} syncMethod="value" accessibilityLayer aria-label={t('trendChartLabel', { name })} margin={{ top: 12, right: 20, bottom: 12, left: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
            <XAxis type="number" dataKey="day" domain={[0, Math.max(1, endDay)]} allowDecimals={false} minTickGap={30} tickFormatter={(day) => t('sequenceDayNumber', { count: day })} tick={{ fill: 'var(--muted)', fontSize: 11 }} stroke="var(--border)" />
            <YAxis domain={domain} width={64} tickFormatter={format} tick={{ fill: 'var(--muted)', fontSize: 11 }} stroke="var(--border)" />
            <Tooltip content={<ValueTooltip name={name} weekdays={weekdays} markers={markers} activeDay={activeDay} t={t} format={format} />} cursor={{ stroke: 'var(--muted)', strokeDasharray: '3 3' }} isAnimationActive={false} />
            <Line type="linear" dataKey="value" name={name} stroke="var(--accent)" strokeWidth={2} dot={({ key, ...props }) => <TrendPoint key={key} {...props} markers={markers} onOpenDay={onOpenDay} t={t} />} activeDot={({ key, ...props }) => <TrendPoint key={key} {...props} active markers={markers} onOpenDay={onOpenDay} t={t} />} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </figure>;
    })}
  </section>;
}

function TrendPoint({ cx, cy, payload, active = false, markers, onOpenDay, t }) {
  if (!Number.isFinite(cx) || !Number.isFinite(cy) || payload.value === null) return null;
  const day = payload.day, events = markers.get(day) ?? [];
  const open = (event) => { event.stopPropagation(); if (day > 0) onOpenDay(day); };
  return <g className="continuous-trend-point" data-day={day} data-events={events.length} role={day > 0 ? 'button' : undefined} aria-label={day > 0 ? t('continuousDayTitle', { day }) : t('initialValue')} tabIndex={day > 0 && active ? 0 : -1} onClick={open} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event); } }}>
    {day > 0 && <circle cx={cx} cy={cy} r={12} fill="transparent" className="trend-point-hit" />}
    <circle className="recharts-line-dot" cx={cx} cy={cy} r={events.length || active ? 4 : 2} fill={events[0]?.color ?? 'var(--accent)'} />
    {events.slice(1, 3).map((item, index) => <circle key={item.id} cx={cx} cy={cy} r={6 + index * 2.5} fill="none" stroke={item.color} strokeWidth={2} className="trend-event-ring" />)}
    {events.length > 3 && <text x={cx + 8} y={cy - 8} className="trend-event-count">+{events.length - 3}</text>}
  </g>;
}
