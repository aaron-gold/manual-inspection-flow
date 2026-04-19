import type { Damage } from '@/lib/assistedInspectionModel';

/** Every damage row must have approve or reject (duplicates still need confirmed). */
export function allDamageRowsReviewed(damages: Damage[]): boolean {
  if (damages.length === 0) return true;
  return damages.every((d) => d.confirmed === true || d.confirmed === false);
}

/** Seconds → display like 3:42 or 1:05:02 */
export function formatDurationSeconds(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`;
  return `${m}:${String(r).padStart(2, '0')}`;
}

export function inspectionHasManualDamage(damages: Damage[] | undefined): boolean {
  if (!damages?.length) return false;
  return damages.some((d) => d.ai === false);
}
