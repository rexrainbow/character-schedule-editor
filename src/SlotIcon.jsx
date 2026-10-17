import { Icon } from '@iconify/react';
import data from './icons/data.json';
import { canonicalIconName } from './icons/catalog.js';

export function resolveIconName(name) {
  const key = canonicalIconName(name);
  return Object.hasOwn(data, key) ? key : 'tabler:calendar-event';
}

export default function SlotIcon({ name, label, decorative = true }) {
  const key = resolveIconName(name);
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  // Always pass bundled data, never an API-resolved string.
  return <span className="slot-icon" data-icon={key} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label} style={{ '--icon-hue': hash % 360 }}><Icon icon={data[key]} aria-hidden="true" /></span>;
}
