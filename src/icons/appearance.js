import { catalog, canonicalIconName, colorIcons } from './catalog.js';

export const backgrounds = colorIcons.map((item) => ({ ...item, id: item.id.replace(/^color:/, '') }));
const foregrounds = new Set(catalog.filter((item) => item.id.startsWith('tabler:')).map((item) => item.id));
export function backgroundColor(value) {
  return backgrounds.find((item) => item.id === value)?.color ?? (/^#[0-9a-f]{6}$/i.test(value ?? '') ? value.toUpperCase() : null);
}

/** Cosmetic identifiers never trigger a network request or prevent data import. */
export function parseIcon(value) {
  const source = typeof value === 'string' ? value.trim() : '';
  if (!source) return { value: '', foreground: 'tabler:calendar-event', background: null, warnings: [] };
  const parts = source.split('|').map((part) => part.trim()), warnings = [];
  let foreground = '', background = null;
  if (parts.length > 2) warnings.push('iconInvalidFormat');
  else if (parts.length === 2) {
    if (parts[0] && foregrounds.has(canonicalIconName(parts[0]))) foreground = canonicalIconName(parts[0]);
    else if (parts[0]) warnings.push('iconUnknownForeground');
    background = backgroundColor(parts[1]);
    if (!background) warnings.push('iconUnknownBackground');
  } else if (foregrounds.has(canonicalIconName(source))) foreground = canonicalIconName(source);
  else {
    background = backgroundColor(source);
    if (!background) warnings.push('iconUnknownValue');
  }
  return { value: parts.length === 1 && foreground ? foreground : source, foreground, background, warnings };
}

export function composeIcon(foreground, background = '') {
  return foreground ? `${foreground}${background ? `|${background}` : ''}` : background || '';
}

export function contrastColor(hex) {
  const channels = hex.slice(1).match(/../g).map((part) => parseInt(part, 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return (luminance + 0.05) / 0.056 > 1.05 / (luminance + 0.05) ? '#101218' : '#FFFFFF';
}
