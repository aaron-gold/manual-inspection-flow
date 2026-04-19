import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Damage } from '@/lib/assistedInspectionModel';
import {
  buildDamageReportData,
  damageInspectionSummaryCounts,
  type DamageReportTimingMeta,
} from '@/lib/damageReportCsv';
import { appendUveyeApiKeyToImageUrl, isUveyeApiImageUrl, type UveyeInspectionResponse } from '@/services/uveyeApi';

interface PdfParams {
  vehicleLabel: string;
  damages: Damage[];
  payload: UveyeInspectionResponse;
  capturedPhotos?: {
    partName: string;
    damageType: string;
    dataUrl?: string;
    imageUrl?: string;
    timestamp: Date;
    captureId?: string;
  }[];
  timing?: DamageReportTimingMeta | null;
}

async function photoToDataUrl(photo: {
  dataUrl?: string;
  imageUrl?: string;
}): Promise<string | null> {
  if (photo.dataUrl) return photo.dataUrl;
  if (!photo.imageUrl) return null;
  const fetchUrl =
    isUveyeApiImageUrl(photo.imageUrl) ? appendUveyeApiKeyToImageUrl(photo.imageUrl) : photo.imageUrl;
  const res = await fetch(fetchUrl);
  if (!res.ok) return null;
  const blob = await res.blob();
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
    r.readAsDataURL(blob);
  });
}

export async function generateInspectionPdf({
  vehicleLabel,
  damages,
  payload,
  capturedPhotos = [],
  timing = null,
}: PdfParams) {
  const doc = new jsPDF();
  const pageW = doc.internal.pageSize.getWidth();
  let y = 20;

  // Title
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Vehicle Inspection Report', pageW / 2, y, { align: 'center' });
  y += 10;

  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(vehicleLabel, pageW / 2, y, { align: 'center' });
  y += 6;

  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageW / 2, y, { align: 'center' });
  doc.setTextColor(0);
  y += 12;

  // Summary stats (aligned with summary page + CSV header)
  const s = damageInspectionSummaryCounts(damages);
  const decided = s.approved + s.rejected;
  const reviewProgressStr =
    s.totalDamages > 0
      ? `${Math.round((decided / s.totalDamages) * 1000) / 10}% (${decided} of ${s.totalDamages} approve or reject — includes camera / manual rows)`
      : '—';
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const timingLines =
    timing == null
      ? []
      : [
          timing.durationSeconds == null
            ? `Review time (this browser): in progress — timer started ${timing.timerStartedAtIso ?? '—'}`
            : `Review time (this browser): ${timing.durationSeconds}s from timer start to local complete${
                timing.completedAtIso ? ` (${timing.completedAtIso})` : ''
              }`,
          `Local inspection status: ${timing.inspectionStatus}`,
        ];
  const stats = [
    `Total damages: ${s.totalDamages} (AI + camera / manual)`,
    `By source: ${s.aiRows} AI (pipelines or unspecified)  ·  ${s.manualRows} manual (inspector-added)`,
    `Detection review progress: ${reviewProgressStr}`,
    `Precision (approved ÷ total): ${s.precisionPctStr}`,
    `Recall: ${s.recallPctStr}  (100% with no inspector-added rows; else approved AI ÷ (approved AI + manual))`,
    `Approved: ${s.approved}  |  Reject: ${s.rejected}  |  Pending: ${s.pending}`,
    `Marked duplicates: ${s.markedDuplicates}  |  Flagged: ${s.flagged}`,
    ...timingLines,
  ];
  stats.forEach(s => { doc.text(s, 14, y); y += 5; });
  y += 5;

  // Damage table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Damage Details', 14, y);
  y += 4;

  const { rows } = buildDamageReportData(payload, damages);
  const tableData = rows.map((r) => [
    r.area,
    r.source,
    r.status,
    r.part,
    r.damage,
    r.notes.trim() ? r.notes : '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Area', 'Source', 'Status', 'Part', 'Damage', 'Notes']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
    bodyStyles: { fontSize: 8, overflow: 'linebreak' },
    margin: { left: 14, right: 14 },
    /** Keep Source readable (was often blank before module fallback; column must not collapse). */
    columnStyles: {
      0: { cellWidth: 22 },
      1: { cellWidth: 36 },
      2: { cellWidth: 20 },
      3: { cellWidth: 28 },
      4: { cellWidth: 32 },
      5: { cellWidth: 'auto' },
    },
  });

  const lastY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  y = (typeof lastY === "number" ? lastY : y) + 10;

  const appendixPhotos = capturedPhotos.filter((p) => {
    const cid = typeof p.captureId === 'string' ? p.captureId.trim() : '';
    if (!cid) return true;
    return !damages.some((d) => d.captureId === cid);
  });

  // Photos section (legacy captures not linked to a damage row)
  if (appendixPhotos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Additional captures (not linked to a detection row)', 14, y);
    y += 6;

    const imgW = 55;
    const imgH = 40;
    let x = 14;

    for (let i = 0; i < appendixPhotos.length; i++) {
      const photo = appendixPhotos[i];
      if (x + imgW > pageW - 14) {
        x = 14;
        y += imgH + 12;
      }
      if (y + imgH > 280) {
        doc.addPage();
        y = 20;
        x = 14;
      }
      try {
        const dataUrl = await photoToDataUrl(photo);
        if (!dataUrl) continue;
        const fmt = dataUrl.includes("image/png") ? "PNG" : "JPEG";
        doc.addImage(dataUrl, fmt, x, y, imgW, imgH);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(`${photo.partName} — ${photo.damageType ?? "Photo"}`, x, y + imgH + 3);
      } catch {
        /* skip if image can't be embedded */
      }
      x += imgW + 8;
    }
  }

  doc.save(`inspection-${vehicleLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}
