import { Icon } from '@iconify/react';
import data from '../../icons/data.json';
import { parseIcon, contrastColor } from '../../icons/appearance.js';

export function resolveIconName(name) {
  return parseIcon(name).foreground;
}

export default function SlotIcon({ name, label, decorative = true }) {
  const appearance = parseIcon(name), key = appearance.foreground;
  let hash = 0;
  for (const character of key) hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  // Always pass bundled data, never an API-resolved string.
  return <span className="slot-icon" data-icon={appearance.value || key} role={decorative ? undefined : 'img'} aria-hidden={decorative || undefined} aria-label={decorative ? undefined : label} style={{ '--icon-hue': hash % 360, ...(appearance.background ? { background: appearance.background, borderColor: appearance.background, color: contrastColor(appearance.background) } : {}) }}>{key && data[key] && <Icon icon={data[key]} aria-hidden="true" />}</span>;
}
