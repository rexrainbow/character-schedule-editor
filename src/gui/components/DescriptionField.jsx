import { useLayoutEffect, useRef } from 'react';

export default function DescriptionField({ value, onChange, t }) {
  const input = useRef(null);
  useLayoutEffect(() => {
    const element = input.current;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, parseFloat(getComputedStyle(element).maxHeight))}px`;
  }, [value]);
  return <label className="description-field">{t('description')}<textarea className="resize-none" ref={input} rows={2} style={{ resize: 'none', maxHeight: '12rem', overflowY: 'auto' }} aria-label={t('description')} placeholder={t('descriptionHint')} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}
