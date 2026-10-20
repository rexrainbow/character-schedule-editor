export const DAY_PURPOSES = ['main', 'overlay', 'interrupt'];
export const DAY_USES = [...DAY_PURPOSES, 'unclassified'];
export const dayPurposes = (day) => day?.purposes === undefined ? ['main'] : day.purposes;
export const matchesDayPurpose = (day, purpose) => !purpose || (purpose === 'unclassified' ? dayPurposes(day).length === 0 : dayPurposes(day).includes(purpose));

/** Editor-authored intended uses, independent of actual assignment references. */
export function dayUses(draft) {
  return Object.fromEntries((draft.days ?? []).map((day) => {
    const purposes = dayPurposes(day);
    return [day.id, { roles: purposes.length ? [...purposes] : ['unclassified'] }];
  }));
}
export const dayUseReason = (use, role, t) => role === 'unclassified' ? t('dayPurposeUnclassifiedHint') : t('dayPurposeReason', { name: t(`dayUse_${role}`) });
export const matchesDayUse = (use, role) => !role || !!use?.roles.includes(role);
