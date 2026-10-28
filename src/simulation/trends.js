// Plain chart data; neither the runtime nor stored history depends on a chart library.
// Day numbers remain stable coordinates for future event markers.
export function continuousTrendSeries(result, nodes, selectedIds) {
  const initial = result.initialValues ?? result.days[0]?.checkpoint?.state.variables ?? result.days[0]?.before ?? {};
  const finite = (value) => typeof value === 'number' && Number.isFinite(value) ? value : null;
  return [...new Set(selectedIds)].filter((id) => nodes[id]?.value_type === 'number' && nodes[id]?.source !== 'computed' && Object.hasOwn(initial, id)).map((id) => ({
    id,
    points: [{ day: 0, value: finite(initial[id]) }, ...result.days.map((day) => ({ day: day.dayNumber, value: finite(day.after[id]) }))],
  }));
}

export function continuousTrendEvents(result) {
  const events = new Map();
  for (const day of result.days) for (const event of day.events) {
    const item = events.get(event.eventRef) ?? { id: event.eventRef, name: event.name, dayRef: event.dayRef, days: [] };
    if (!item.days.includes(day.dayNumber)) item.days.push(day.dayNumber);
    events.set(item.id, item);
  }
  return [...events.values()];
}
