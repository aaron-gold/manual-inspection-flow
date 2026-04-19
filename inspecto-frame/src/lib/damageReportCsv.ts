/**
 * Vehicle-level damage table — shared model for CSV export and in-app preview.
 */
import {
  ALL_AREAS,
  areaLabelForDamageReport,
  CAR_PARTS,
  partNameMatches,
  partWalkRankForPartName,
  type Damage,
} from '@/lib/assistedInspectionModel';
import {
  buildUveyePortalSummaryUrl,
  type UveyeInspectionResponse,
} from '@/services/uveyeApi';

export const INSPECTION_MODULE_LABELS: Record<string, string> = {
  artemis: 'Artemis (tires/wheels)',
  atlas: 'Atlas (body)',
  helios: 'Helios (undercarriage)',
  legacy: 'Legacy',
};

export type DamageReportMeta = {
  vin: string;
  make: string;
  model: string;
  year: string;
  inspectionId: string;
  uveyeLink: string;
};

export type DamageReportTableRow = {
  area: string;
  /** AI pipeline (Atlas, Artemis, …) or Manual for inspector-added / camera rows. */
  source: string;
  status: string;
  part: string;
  damage: string;
  diagonalMm: string;
  widthMm: string;
  heightMm: string;
  notes: string;
};

function escapeCsvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtMm(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  return String(Math.round(n * 10) / 10);
}

function hasCaptureEvidence(d: Damage): boolean {
  const cid = d.captureId?.trim();
  return Boolean(cid || d.captureDataUrl || d.captureImageUrl);
}

/** AI / pipeline label or Manual for inspector-added rows (CSV, PDF, preview). Never blank for AI rows. */
export function sourceLabelForDamage(d: Damage): string {
  if (d.ai === false) return hasCaptureEvidence(d) ? 'Manual · camera' : 'Manual';
  const m = d.inspectionModule;
  if (m && INSPECTION_MODULE_LABELS[m]) return INSPECTION_MODULE_LABELS[m];
  return 'AI (UVeye)';
}

function damageDisplayLabel(d: Damage): string {
  return [d.damageName, d.type].filter(Boolean).join(' — ') || d.type;
}

/**
 * Match daily-style rollups: any wording that includes "dent" → Dent, "scratch" → Scratch; otherwise unchanged.
 * Dent is checked before scratch so mixed phrases classify as Dent.
 */
export function generalizeDamageTypeText(raw: string): string {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const lower = t.toLowerCase();
  if (lower.includes('dent')) return 'Dent';
  if (lower.includes('scratch')) return 'Scratch';
  return t;
}

/** Combined display name for a row, then dent/scratch generalization (exports / PDF). */
export function damageLabelForExport(d: Damage): string {
  return generalizeDamageTypeText(damageDisplayLabel(d));
}

export function reviewStatusForDamage(d: Damage): string {
  if (d.confirmed === true) return 'Approved';
  if (d.confirmed === false) return 'Reject';
  return 'Pending';
}

function notesForDamage(d: Damage): string {
  const bits: string[] = [];
  if (d.isDuplicate) bits.push('Duplicate');
  if (d.flagged) bits.push('Flagged');
  return bits.join('; ');
}

/** Counts for summary UI, PDF intro, and CSV header metrics (AI + manual rows). */
export function damageInspectionSummaryCounts(damages: Damage[]): {
  totalDamages: number;
  approved: number;
  rejected: number;
  pending: number;
  markedDuplicates: number;
  flagged: number;
  /** Rows from UVeye / AI (`ai !== false`). */
  aiRows: number;
  /** Inspector-added rows (`ai === false`), incl. camera-linked. */
  manualRows: number;
  /** Approved rows that are AI-sourced (for recall denominator split). */
  approvedAi: number;
  /** `approved ÷ total` — percent string e.g. `89.5%`, or `—` when there are no rows. */
  precisionPctStr: string;
  /**
   * `100%` when there are no manual (inspector-added) rows; otherwise
   * `approvedAi ÷ (approvedAi + manualRows)` so manual adds are not double-counted with approved manual rows.
   */
  recallPctStr: string;
} {
  const totalDamages = damages.length;
  const approved = damages.filter((d) => d.confirmed === true).length;
  const rejected = damages.filter((d) => d.confirmed === false).length;
  const pending = damages.filter((d) => d.confirmed == null).length;
  const markedDuplicates = damages.filter((d) => d.isDuplicate).length;
  const flagged = damages.filter((d) => d.flagged).length;
  const manualRows = damages.filter((d) => d.ai === false).length;
  const aiRows = totalDamages - manualRows;
  const approvedAi = damages.filter((d) => d.ai !== false && d.confirmed === true).length;
  const precisionPctStr =
    totalDamages > 0 ? `${Math.round((approved / totalDamages) * 1000) / 10}%` : '—';
  const recallPctStr =
    manualRows === 0
      ? '100%'
      : `${Math.round((approvedAi / (approvedAi + manualRows)) * 1000) / 10}%`;
  return {
    totalDamages,
    approved,
    rejected,
    pending,
    markedDuplicates,
    flagged,
    aiRows,
    manualRows,
    approvedAi,
    precisionPctStr,
    recallPctStr,
  };
}

/** Same order as the vehicle map: Front → Left → Top → Right → Rear → Undercarriage → Interior. */
function areaOrderIndexForPart(partName: string): number {
  const p = CAR_PARTS.find((cp) => partNameMatches(cp.name, partName));
  if (!p) return ALL_AREAS.length;
  const i = ALL_AREAS.indexOf(p.area);
  return i === -1 ? ALL_AREAS.length : i;
}

function partOrderIndexForPart(partName: string): number {
  const p = CAR_PARTS.find((cp) => partNameMatches(cp.name, partName));
  if (!p) return 99999;
  return partWalkRankForPartName(p.name);
}

function compareDamagesForReport(a: Damage, b: Damage): number {
  const areaCmp = areaOrderIndexForPart(a.part) - areaOrderIndexForPart(b.part);
  if (areaCmp !== 0) return areaCmp;
  const partCmp = partOrderIndexForPart(a.part) - partOrderIndexForPart(b.part);
  if (partCmp !== 0) return partCmp;
  const nameCmp = a.part.localeCompare(b.part, undefined, { sensitivity: 'base' });
  if (nameCmp !== 0) return nameCmp;
  return a.id - b.id;
}

/** Vehicle info + one row per damage (same data as CSV body). */
export function buildDamageReportData(
  payload: UveyeInspectionResponse,
  damages: Damage[],
): { meta: DamageReportMeta; rows: DamageReportTableRow[] } {
  const root = payload as Record<string, unknown>;
  const vin = String(root.vin ?? (payload.vehicle as { vin?: string } | undefined)?.vin ?? '');
  const make = String(payload.vehicle?.make ?? root.make ?? '');
  const model = String(payload.vehicle?.model ?? root.model ?? '');
  const yearRaw = payload.vehicle?.year ?? root.year;
  const yearStr = yearRaw != null ? String(yearRaw) : '';
  const inspectionId = String(root.inspectionId ?? '');
  const uveyeLink = buildUveyePortalSummaryUrl(payload) ?? '';

  const sortedDamages = [...damages].sort(compareDamagesForReport);

  const rows: DamageReportTableRow[] = sortedDamages.map((d) => ({
    area: areaLabelForDamageReport(d.part),
    source: sourceLabelForDamage(d),
    status: reviewStatusForDamage(d),
    part: d.part,
    damage: damageLabelForExport(d),
    diagonalMm: fmtMm(d.sizeDiagonalMm),
    widthMm: fmtMm(d.sizeWidthMm),
    heightMm: fmtMm(d.sizeHeightMm),
    notes: notesForDamage(d),
  }));

  return {
    meta: { vin, make, model, year: yearStr, inspectionId, uveyeLink },
    rows,
  };
}

/** Optional footer metrics for vehicle CSV / PDF alignment. */
export type DamageReportTimingMeta = {
  timerStartedAtIso?: string | null;
  completedAtIso?: string | null;
  /** `null` while in progress; integer seconds once marked complete in this browser. */
  durationSeconds: number | null;
  inspectionStatus: 'in_progress' | 'completed';
};

export function buildDamageReportCsv(
  payload: UveyeInspectionResponse,
  damages: Damage[],
  timing?: DamageReportTimingMeta | null,
): string {
  const { meta, rows } = buildDamageReportData(payload, damages);

  const lines: string[] = [];
  lines.push(['Field', 'Value'].map(escapeCsvCell).join(','));
  lines.push(['VIN', escapeCsvCell(meta.vin)].join(','));
  lines.push(['Make', escapeCsvCell(meta.make)].join(','));
  lines.push(['Model', escapeCsvCell(meta.model)].join(','));
  lines.push(['Year', escapeCsvCell(meta.year)].join(','));
  if (meta.inspectionId) lines.push(['Inspection ID', escapeCsvCell(meta.inspectionId)].join(','));
  lines.push(['UVeye inspection link', escapeCsvCell(meta.uveyeLink)].join(','));
  if (timing) {
    lines.push(['Timer started (ISO)', escapeCsvCell(timing.timerStartedAtIso ?? '')].join(','));
    lines.push(['Completed at (ISO)', escapeCsvCell(timing.completedAtIso ?? '')].join(','));
    lines.push(
      [
        'Duration (seconds)',
        escapeCsvCell(
          timing.durationSeconds == null ? 'In progress' : String(timing.durationSeconds),
        ),
      ].join(','),
    );
    lines.push(
      ['Local inspection status', escapeCsvCell(timing.inspectionStatus)].join(','),
    );
  }
  const s = damageInspectionSummaryCounts(damages);
  lines.push(['Total damages', escapeCsvCell(String(s.totalDamages))].join(','));
  lines.push(['Approved count', escapeCsvCell(String(s.approved))].join(','));
  lines.push(['Reject count', escapeCsvCell(String(s.rejected))].join(','));
  lines.push(['Pending count', escapeCsvCell(String(s.pending))].join(','));
  lines.push(['Precision (approved ÷ total damages)', escapeCsvCell(s.precisionPctStr)].join(','));
  lines.push(
    [
      'Recall (100% if no manual rows; else approved AI ÷ (approved AI + manual rows))',
      escapeCsvCell(s.recallPctStr),
    ].join(','),
  );
  lines.push(['Marked duplicates', escapeCsvCell(String(s.markedDuplicates))].join(','));
  lines.push(['Flagged', escapeCsvCell(String(s.flagged))].join(','));
  lines.push(['AI-sourced rows', escapeCsvCell(String(s.aiRows))].join(','));
  lines.push(['Manual rows', escapeCsvCell(String(s.manualRows))].join(','));
  lines.push('');
  lines.push(
    [
      'Area',
      'Source',
      'Status',
      'Car part',
      'Damage',
      'Diagonal (mm)',
      'Width (mm)',
      'Height (mm)',
      'Notes',
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(r.area),
        escapeCsvCell(r.source),
        escapeCsvCell(r.status),
        escapeCsvCell(r.part),
        escapeCsvCell(r.damage),
        escapeCsvCell(r.diagonalMm),
        escapeCsvCell(r.widthMm),
        escapeCsvCell(r.heightMm),
        escapeCsvCell(r.notes),
      ].join(','),
    );
  }

  return '\uFEFF' + lines.join('\r\n');
}

export function downloadDamageReportCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function damageReportFilename(payload: UveyeInspectionResponse): string {
  const root = payload as Record<string, unknown>;
  const vin = String(root.vin ?? '');
  const safe = vin.replace(/[^\w-]+/g, '_').slice(0, 32) || 'inspection';
  return `damage-report-${safe}-${new Date().toISOString().slice(0, 10)}.csv`;
}
