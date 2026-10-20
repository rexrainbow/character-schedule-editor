import { CornerUpRight, TriangleAlert } from 'lucide-react';
import { formatCondition } from '../../core/operandModel.js';

// Presentation only: release still runs after start tasks, in interrupt events.
export default function SlotReleasePreview({ release, assigned, nodes = {}, active = true, children, t }) {
  if (!release) return children;
  const conditional = release.condition != null, unreachable = active && assigned && !conditional;
  return <div className={`slot-release-preview ${assigned ? 'has-assignment' : 'release-only'} ${unreachable ? 'unreachable' : ''} ${active ? '' : 'inactive'}`}>
    {assigned && <div className="release-assignment">{children}</div>}
    <div className="release-state" title={t(active ? 'slotReleaseHint' : 'releaseInactive')}>
      <span className="release-state-heading"><CornerUpRight size={16} aria-hidden="true" /><strong>{t(conditional ? 'releaseConditionalPreview' : 'releaseSlot')}</strong></span>
      <span className="release-state-condition" title={conditional ? formatCondition(release.condition, nodes) : undefined}>{conditional ? formatCondition(release.condition, nodes) : t('releaseUnconditional')}</span>
      {!active && <small>{t('releaseInactivePreview')}</small>}
      {unreachable && <span className="release-unreachable-warning"><TriangleAlert size={14} aria-hidden="true" />{t('releaseAssignmentUnreachable')}</span>}
    </div>
  </div>;
}
