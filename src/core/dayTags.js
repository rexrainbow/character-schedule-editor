export const dayTags = (day) => day.tags ?? [];
export const tagFilterValue = (tag) => `tag:${tag}`;
export function matchesDayTag(day, filter) {
  return !filter || (filter === 'untagged' ? !dayTags(day).length : dayTags(day).includes(filter.slice(4)));
}
export function availableDayTags(days) {
  const counts = new Map();
  for (const day of days) for (const tag of new Set(dayTags(day))) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
}
