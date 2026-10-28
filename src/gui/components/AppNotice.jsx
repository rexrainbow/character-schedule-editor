import { useEffect, useRef } from 'react';
import { Info, X } from 'lucide-react';
import { IconButton } from './ui.jsx';

export default function AppNotice({ notice, onDismiss, t }) {
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => dismiss.current(notice), 1000);
    return () => clearTimeout(timer);
  }, [notice]);
  if (!notice) return null;
  if (notice.error) return <div role="status" className="notice notice-error"><span>{t(notice.key)}</span><IconButton icon={X} label={t('close')} onClick={() => onDismiss(notice)} /></div>;
  return <div role="status" aria-live="polite" aria-atomic="true" className="notice app-toast"><Info size={18} aria-hidden="true" /><span>{t(notice.key)}</span></div>;
}
