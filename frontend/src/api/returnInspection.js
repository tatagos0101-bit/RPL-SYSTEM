export const returnConditions = { good: 'Good — return to shelf', worn: 'Normal wear — return to shelf',
  damaged: 'Damaged — withhold from borrowing', lost: 'Reported lost — close loan, keep copy unavailable' };
export const inspectionRemarks = {
  good: { no_issues: 'No issues found' }, worn: { wear_and_tear: 'Normal wear and tear' },
  damaged: { water_damage: 'Water damage', torn_pages: 'Torn pages', missing_pages: 'Missing pages',
    binding_damage: 'Binding damage', marked_pages: 'Marked pages', other: 'Other damage' },
  lost: { reported_lost: 'Borrower reported the copy lost' },
};
export function inspectionError(value = {}) {
  if (!value.return_condition || !Object.hasOwn(inspectionRemarks[value.return_condition] || {}, value.inspection_reason)) return 'Select a condition and inspection remark for every book.';
  if (!value.inspection_confirmed) return 'Confirm the inspection or reported loss for every book.';
  const fee = String(value.condition_fee ?? '0');
  if (!/^\d+(\.\d{1,2})?$/.test(fee) || Number(fee) > 999999.99) return 'Enter a valid assessment with up to two decimal places.';
  if (Number(fee) && !['damaged', 'lost'].includes(value.return_condition)) return 'Damage/loss charges only apply to damaged or lost books.';
  if (value.inspection_reason === 'other' && !value.inspection_notes?.trim()) return 'Describe the damage when choosing Other.';
  return '';
}
