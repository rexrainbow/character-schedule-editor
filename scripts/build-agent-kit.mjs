import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'agent-kit');
const portable = (value) => value.split(path.sep).join('/');
// Deliberately flat and small. Detailed references/recipes stay in the source docs.
const manifest = new Map([
  ['docs/AGENT_KIT.md', 'README.md'],
  ['docs/BLUEPRINT_GUIDE.md', 'BLUEPRINT_GUIDE.md'],
  ['src/schemas/blueprint.schema.json', 'blueprint.schema.json'],
  ['docs/recipes/examples/life-simulation.yaml', 'example.yaml'],
  ['src/icons/manifest.json', 'icons.json'],
]);

const markdownLink = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;
const isExternal = (target) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target);
const within = (base, absolute) => {
  const relative = path.relative(base, absolute);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function rewriteMarkdown(source, text) {
  const replacements = [];
  for (const match of text.matchAll(markdownLink)) {
    const [, label, target] = match;
    if (isExternal(target)) continue;
    const suffixIndex = target.search(/[?#]/);
    const pathname = suffixIndex < 0 ? target : target.slice(0, suffixIndex);
    const suffix = suffixIndex < 0 ? '' : target.slice(suffixIndex);
    const absolute = path.resolve(root, path.dirname(source), decodeURIComponent(pathname));
    if (!within(root, absolute)) throw new Error(`Link escapes project: ${source}: ${target}`);
    if (!(await stat(absolute)).isFile()) throw new Error(`Link is not a file: ${source}: ${target}`);
    const mapped = manifest.get(portable(path.relative(root, absolute)));
    if (!mapped) throw new Error(`Compact kit link is not included: ${source}: ${target}`);
    replacements.push({ index: match.index, length: match[0].length, replacement: `[${label}](${mapped}${suffix})` });
  }
  for (const { index, length, replacement } of replacements.reverse()) text = text.slice(0, index) + replacement + text.slice(index + length);
  return text;
}

// Only human-readable annotations change. Validation rules and local $refs stay intact.
function compactSchemaAnnotations(value) {
  if (Array.isArray(value)) return value.map(compactSchemaAnnotations);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key,
    ['description', '$comment'].includes(key) && typeof item === 'string'
      ? item.replaceAll('../../docs/ENGINE_SEMANTICS.md', 'BLUEPRINT_GUIDE.md')
        .replace(/ENGINE_SEMANTICS\.md(?: sections? [\d-]+)?/g, 'BLUEPRINT_GUIDE.md')
        .replaceAll('EXPRESSION_FUNCTIONS.md', 'BLUEPRINT_GUIDE.md')
      : compactSchemaAnnotations(item),
  ]));
}

await import('./build-blueprint-schema.mjs');
await import('./build-icon-guide.mjs');
const staging = await mkdtemp(path.join(tmpdir(), 'character-schedule-agent-kit-'));
try {
  for (const [source, destination] of manifest) {
    if (path.basename(destination) !== destination) throw new Error(`Kit must stay flat: ${destination}`);
    let text = await readFile(path.join(root, source), 'utf8');
    if (source.endsWith('.md')) text = await rewriteMarkdown(source, text);
    if (source.endsWith('.schema.json')) text = JSON.stringify(compactSchemaAnnotations(JSON.parse(text)), null, 2) + '\n';
    await writeFile(path.join(staging, destination), text);
  }
  // Verify all relative links in the standalone output before replacing the old kit.
  for (const destination of [...manifest.values()].filter((name) => name.endsWith('.md'))) {
    const text = await readFile(path.join(staging, destination), 'utf8');
    for (const [, , target] of text.matchAll(markdownLink)) {
      if (isExternal(target)) continue;
      const absolute = path.resolve(staging, decodeURIComponent(target.split(/[?#]/)[0]));
      if (!within(staging, absolute) || !(await stat(absolute)).isFile()) throw new Error(`Invalid kit link: ${destination}: ${target}`);
    }
  }
  // Fixed resolved target, independent of cwd/user input; replacement stays in this project.
  if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'agent-kit') throw new Error('Invalid output directory');
  await rm(output, { recursive: true, force: true });
  await cp(staging, output, { recursive: true });
  console.log(`Agent kit: ${output} (${manifest.size} files; flat layout and local links verified)`);
} finally {
  // Only the exact directory allocated by mkdtemp above may be removed.
  if (path.dirname(staging) !== path.resolve(tmpdir()) || !path.basename(staging).startsWith('character-schedule-agent-kit-')) throw new Error('Invalid staging directory');
  await rm(staging, { recursive: true, force: true });
}
