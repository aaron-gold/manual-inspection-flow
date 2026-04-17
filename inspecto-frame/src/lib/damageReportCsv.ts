/**
 * Vehicle-level damage table — shared model for CSV export and in-app preview.
 */
import {
  ALL_AREAS,
  areaLabelForDamageReport,
  CAR_PARTS,
  partNameMatches,
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
  module: string;
  part: string;
  damage: string;
  diagonalMm: string;
  widthMm: string;
  heightMm: string;
};

function escapeCsvCell(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function fmtMm(n: number | undefined): string {
  if (n === undefined || !Number.isFinite(n)) return '';
  return String(Math.round(n * 10) / 10);
}

function moduleLabelForDamage(d: Damage): string {
  if (d.ai === false) return 'Manual';
  const m = d.inspectionModule;
  if (m && INSPECTION_MODULE_LABELS[m]) return INSPECTION_MODULE_LABELS[m];
  return '';
}

function damageDisplayLabel(d: Damage): string {
  return [d.damageName, d.type].filter(Boolean).join(' — ') || d.type;
}

/** Same order as the vehicle map: Front → Left → Top → Right → Rear → Undercarriage → Interior. */
function areaOrderIndexForPart(partName: string): number {
  const p = CAR_PARTS.find((cp) => partNameMatches(cp.name, partName));
  if (!p) return ALL_AREAS.length;
  const i = ALL_AREAS.indexOf(p.area);
  return i === -1 ? ALL_AREAS.length : i;
}

function partOrderIndexForPart(partName: string): number {
  const i = CAR_PARTS.findIndex((cp) => partNameMatches(cp.name, partName));
  return i === -1 ? 9999 : i;
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
    module: moduleLabelForDamage(d),
    part: d.part,
    damage: damageDisplayLabel(d),
    diagonalMm: fmtMm(d.sizeDiagonalMm),
    widthMm: fmtMm(d.sizeWidthMm),
    heightMm: fmtMm(d.sizeHeightMm),
  }));

  return {
    meta: { vin, make, model, year: yearStr, inspectionId, uveyeLink },
    rows,
  };
}

export function buildDamageReportCsv(
  payload: UveyeInspectionResponse,
  damages: Damage[],
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
  lines.push('');
  lines.push(
    [
      'Area',
      'Module',
      'Car part',
      'Damage',
      'Diagonal (mm)',
      'Width (mm)',
      'Height (mm)',
    ]
      .map(escapeCsvCell)
      .join(','),
  );

  for (const r of rows) {
    lines.push(
      [
        escapeCsvCell(r.area),
        escapeCsvCell(r.module),
        escapeCsvCell(r.part),
        escapeCsvCell(r.damage),
        escapeCsvCell(r.diagonalMm),
        escapeCsvCell(r.widthMm),
        escapeCsvCell(r.heightMm),
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
