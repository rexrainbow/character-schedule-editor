import introductionZh from '../../../docs/INTRODUCTION.md?raw';
import introductionEn from '../../../docs/INTRODUCTION.en.md?raw';
import { Dialog } from '../components/ui.jsx';

// These two short documents intentionally use only headings, paragraphs and a table.
// Render text through React, without evaluating HTML or fetching remote content.
function blocks(markdown) {
  return markdown.trim().replaceAll('\r\n', '\n').split(/\n\s*\n/).map((text) => {
    if (text.startsWith('# ')) return { type: 'title', text: text.slice(2) };
    if (text.startsWith('## ')) return { type: 'heading', text: text.slice(3) };
    if (text.startsWith('|')) {
      const rows = text.split('\n').map((row) => row.split('|').slice(1, -1).map((cell) => cell.trim()));
      return { type: 'table', header: rows[0], rows: rows.slice(2) };
    }
    return { type: 'paragraph', text: text.replaceAll('\n', ' ') };
  });
}

export default function HelpDialog({ locale, t, onClose }) {
  const [title, ...content] = blocks(locale === 'zh-TW' ? introductionZh : introductionEn);
  return <Dialog title={title.text} wide className="introduction-dialog" t={t} onClose={onClose}
    footer={<button type="button" className="button secondary" onClick={onClose}>{t('close')}</button>}>
    <article className="introduction-content">
      {content.map((block, index) => block.type === 'heading' ? <h3 key={index}>{block.text}</h3>
        : block.type === 'table' ? <table key={index} aria-label={t('helpLevels')}><thead><tr>{block.header.map((cell) => <th key={cell} scope="col">{cell}</th>)}</tr></thead>
          <tbody>{block.rows.map((row) => <tr key={row[0]}>{row.map((cell, column) => column === 0 ? <th key={column} scope="row">{cell}</th> : <td key={column}>{cell}</td>)}</tr>)}</tbody></table>
          : <p key={index}>{block.text}</p>)}
    </article>
  </Dialog>;
}
