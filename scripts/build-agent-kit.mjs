import { cp, mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'agent-kit');
const portable = (value) => value.split(path.sep).join('/');
const manifest = new Map([
  ...['INTRODUCTION', 'INTRODUCTION.en', 'BLUEPRINT', 'ENGINE_SEMANTICS', 'SYSTEM_SEMANTICS', 'NAMING', 'RECIPES']
    .map((name) => [`docs/${name}.md`, `docs/${name}.md`]),
  ['src/schemas/blueprint.schema.json', 'schemas/blueprint.schema.json'],
  ['docs/recipes/examples/life-simulation.yaml', 'examples/life-simulation.yaml'],
]);

// Recipes are the only directory automatically included; implementation docs stay outside the kit.
for (const entry of (await readdir(path.join(root, 'docs/recipes'), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
  if (entry.isFile() && entry.name.endsWith('.md')) manifest.set(`docs/recipes/${entry.name}`, `docs/recipes/${entry.name}`);
}

const markdownLink = /\[([^\]\n]+)\]\(([^\s)]+)\)/g;
const isExternal = (target) => /^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(target);
const within = (base, absolute) => {
  const relative = path.relative(base, absolute);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
};

async function rewriteMarkdown(source, destination, text) {
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
    const relative = portable(path.relative(root, absolute));
    const mapped = manifest.get(relative);
    const replacement = mapped
      ? `[${label}](${portable(path.relative(path.dirname(destination), mapped))}${suffix})`
      : `${label}（專案路徑：\`${relative}${suffix}\`；未收錄於離線文件包）`;
    replacements.push({ index: match.index, length: match[0].length, replacement });
  }
  for (const { index, length, replacement } of replacements.reverse()) text = text.slice(0, index) + replacement + text.slice(index + length);
  return text;
}

const readme = `# YAML Blueprint Agent Kit

本文件包供人類與 agent 離線閱讀、建立及修改 YAML 藍圖。可以直接複製整個資料夾分享；閱讀不依賴專案原始碼、MCP 或 Node.js。

## 閱讀順序

1. [一頁式工具介紹](docs/INTRODUCTION.md)（[English](docs/INTRODUCTION.en.md)）：先掌握工具目的與由周序列到任務的整體結構。
2. [系統能力總覽](docs/SYSTEM_SEMANTICS.md)：將需求對應到系統構件。
3. [Engine 執行語意](docs/ENGINE_SEMANTICS.md)：確認條件、候選、事件排序、變數更新及中斷規則。
4. [命名規則](docs/NAMING.md)、[Blueprint 格式](docs/BLUEPRINT.md) 與 [JSON Schema](schemas/blueprint.schema.json)：確認命名、引用、宣告與文字運算式寫法。
5. [Recipes](docs/RECIPES.md) 與 [完整 YAML 範例](examples/life-simulation.yaml)：參考具體組合。

## 編輯與驗證

- YAML 使用 mapping key 作為 name；不需要 UUID 或 icon。display_name 與 description 可選填。
- 匯入會從零建立專案，不會合併或更新既有專案。修改前保留原專案備份。
- 先將 YAML 解析為 JSON，再用隨附 Schema 驗證結構。Schema 不能檢查文字運算式語法、引用目標、型別或循環，也不能代替執行語意文件。
- 完整驗證需回到編輯器匯入藍圖，或透過專案提供的 YAML 預覽／匯入 API。確認無錯後，可用行程模擬與連續模擬檢查結果；本包不包含 parser 或驗證執行器。
- 文件中的專案路徑說明指向未收錄的實作或技術文件，屬於補充資料。本包內的相對連結均指向已收錄檔案。MCP URI 需另行連接專案服務才能使用。

## 更新文件包

此資料夾由來源專案的 \`npm run build:agent-kit\` 產生，已加入 .gitignore。請修改原始文件後重新產生，不要直接維護本包中的副本。產生腳本會先更新 Schema，再檢查來源檔案及文件連結；不完整的內容會使產生失敗。
`;

// Reuse the canonical generator so the repository and kit receive the same current schema.
await import('./build-blueprint-schema.mjs');
const staging = await mkdtemp(path.join(tmpdir(), 'character-schedule-agent-kit-'));
try {
  for (const [source, destination] of manifest) {
    let text = await readFile(path.join(root, source), 'utf8');
    if (source.endsWith('.md')) text = await rewriteMarkdown(source, destination, text);
    if (source.endsWith('.schema.json')) {
      // The schema is self-contained; adjust only its human-readable contract path.
      text = text.replaceAll('../../docs/ENGINE_SEMANTICS.md', '../docs/ENGINE_SEMANTICS.md');
      JSON.parse(text);
    }
    const target = path.join(staging, destination);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, text);
  }
  await writeFile(path.join(staging, 'README.md'), readme);
  // Verify generated relative file links before replacing the previous kit.
  for (const destination of ['README.md', ...manifest.values()].filter((name) => name.endsWith('.md'))) {
    const text = await readFile(path.join(staging, destination), 'utf8');
    for (const [, , target] of text.matchAll(markdownLink)) {
      if (isExternal(target)) continue;
      const absolute = path.resolve(staging, path.dirname(destination), decodeURIComponent(target.split(/[?#]/)[0]));
      if (!within(staging, absolute) || !(await stat(absolute)).isFile()) throw new Error(`Invalid kit link: ${destination}: ${target}`);
    }
  }
  // Fixed absolute target, independent of cwd and user input; removal stays inside this project.
  if (path.dirname(output) !== path.resolve(root) || path.basename(output) !== 'agent-kit') throw new Error('Invalid output directory');
  await rm(output, { recursive: true, force: true });
  await cp(staging, output, { recursive: true });
  console.log(`Agent kit: ${output} (${manifest.size + 1} files; local file links verified)`);
} finally {
  await rm(staging, { recursive: true, force: true });
}
