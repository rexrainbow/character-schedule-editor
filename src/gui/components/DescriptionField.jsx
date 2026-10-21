export default function DescriptionField({ value, onChange, t }) {
  return <label className="description-field">{t('description')}<textarea rows={2} aria-label={t('description')} placeholder={t('descriptionHint')} value={value ?? ''} onChange={(event) => onChange(event.target.value)} /></label>;
}
