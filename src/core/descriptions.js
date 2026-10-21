// Explanatory metadata is never executable. Prefix every line, including blank lines.
export function descriptionComments(value) {
  return typeof value === 'string' && value.trim() ? value.trim().split(/\r\n|[\r\n]/).map((line) => `// ${line}`) : [];
}
