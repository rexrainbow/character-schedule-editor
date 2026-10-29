import { writeFile } from 'node:fs/promises';
import { catalog } from '../src/icons/catalog.js';
import { backgrounds } from '../src/icons/appearance.js';

const labels = (item) => ({ en: item.en, 'zh-TW': item.zh });
const manifest = {
  separator: '|',
  formats: ['tabler:briefcase', 'tabler:briefcase|blue', 'tabler:briefcase|#60A5FA', 'blue', '#60A5FA'],
  foregrounds: catalog.filter((item) => item.id.startsWith('tabler:')).map((item) => ({ id: item.id, category: item.category, labels: labels(item) })),
  backgrounds: backgrounds.map((item) => ({ id: item.id, color: item.color, labels: labels(item) })),
};
await writeFile(new URL('../src/icons/manifest.json', import.meta.url), JSON.stringify(manifest, null, 2) + '\n');
await writeFile(new URL('../docs/ICONS.md', import.meta.url), `# 圖示 / Icons

此文件與圖示清單由本機圖示目錄自動產生，請修改來源目錄後重新執行 \`npm run build:agent-kit\`。

## YAML 格式

所有具名定義的 \`icon\` 都可選填，包括變數／群組、列舉／群組、計算式、任務、任務巨集、參數、列舉選項、時段／日／周／周序列、事件、環境資訊及內建任務的顯示設定。

- \`tabler:briefcase\`：前景圖示＋自動背景。
- \`tabler:briefcase|blue\`：前景圖示＋指定背景色。
- \`tabler:heart|#F87171\`：前景圖示＋六位十六進位背景色。
- \`blue\` 或 \`#60A5FA\`：純色方塊，無前景圖示。
- 不填或空字串：使用該編輯器的預設圖示。

分隔符號固定為 \`|\`；\`tabler:\` 是圖示名稱的一部分。前景線條會自動選擇明暗，以保持對比。圖示只使用隨附的離線 SVG，不會連線下載。

裸字串先查找已知前景，再查背景色；找不到時顯示空白前景與預設背景。組合字串的未知前景或未知背景也會個別回退。編輯器顯示警告、保留原字串，且不因此拒絕匯入。圖示不影響引用與執行，執行資料不輸出 icon。

## 背景色

| 名稱 | 繁體中文 | 色碼 |
| --- | --- | --- |
${backgrounds.map((item) => `| \`${item.id}\` | ${item.zh} | \`${item.color}\` |`).join('\n')}

## 離線清單

[完整機器可讀清單](../src/icons/manifest.json)包含 ${manifest.foregrounds.length} 個前景圖示的精確名稱、分類、繁體中文／英文標籤，以及全部背景色。Agent kit 中同一檔案位於 \`icons.json\`。

\`icon\` 可直接放在 Blueprint 物件、參數及選項中：

\`\`\`yaml
tasks:
  greet:
    display_name: 問候
    icon: tabler:heart|red
    parameters:
      tone:
        type: enum
        icon: tabler:code|purple
        options:
          - { value: warm, display_name: 親切, icon: tabler:heart|red }
          - { value: calm, display_name: 平靜, icon: blue }
\`\`\`

內建任務的頂層圖示同樣使用 \`icon\`；固定參數的圖示使用 \`parameter_icons: { target: 'tabler:code|blue' }\`。固定列舉選項使用 \`parameter_option_icons: { operation: { set: 'tabler:check|green' } }\`，不改變參數或列舉的契約。
`);
