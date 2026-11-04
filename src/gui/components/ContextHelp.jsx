import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Dialog } from './ui.jsx';

export default function ContextHelp({ title, messages, t }) {
  const [open, setOpen] = useState(false);
  const label = t('sectionHelp', { section: title });
  return <>
    <button type="button" className="icon-button context-help" aria-label={label} title={label} aria-haspopup="dialog" onClick={() => setOpen(true)}><CircleHelp size={17} aria-hidden="true" /></button>
    {open && <Dialog title={label} className="context-help-dialog" onClose={() => setOpen(false)} t={t} footer={<button type="button" className="button secondary" onClick={() => setOpen(false)}>{t('close')}</button>}>
      {messages.map((message) => <p key={message}>{message}</p>)}
    </Dialog>}
  </>;
}
