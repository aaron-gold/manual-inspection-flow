import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { appendUveyeApiKeyToImageUrl, isUveyeApiImageUrl } from '@/services/uveyeApi';

interface Damage {
  id: number;
  part: string;
  type: string;
  severity: string;
  ai: boolean;
  confirmed?: boolean | null;
  isDuplicate?: boolean;
  flagged?: boolean;
}

interface PdfParams {
  vehicleLabel: string;
  damages: Damage[];
  reviewedParts: Set<string>;
  totalParts: number;
  capturedPhotos?: {
    partName: string;
    damageType: string;
    dataUrl?: string;
    imageUrl?: string;
    timestamp: Date;
  }[];
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
  reviewedParts,
  totalParts,
  capturedPhotos = [],
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

  // Summary stats
  const confirmed = damages.filter(d => d.confirmed === true).length;
  const dismissed = damages.filter(d => d.confirmed === false).length;
  const pending = damages.filter(d => d.confirmed == null).length;
  const dup = damages.filter(d => d.isDuplicate).length;
  const flagged = damages.filter(d => d.flagged).length;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Summary', 14, y);
  y += 7;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const stats = [
    `Parts Reviewed: ${reviewedParts.size} / ${totalParts}`,
    `Total Detections: ${damages.length}`,
    `Confirmed: ${confirmed}  |  Dismissed: ${dismissed}  |  Pending: ${pending}`,
    `Marked duplicate: ${dup}  |  Flagged: ${flagged}`,
  ];
  stats.forEach(s => { doc.text(s, 14, y); y += 5; });
  y += 5;

  // Damage table
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Damage Details', 14, y);
  y += 4;

  const tableData = damages.map(d => [
    d.part,
    d.type,
    d.severity,
    d.ai ? 'AI' : 'Manual',
    d.confirmed === true ? 'Confirmed' : d.confirmed === false ? 'Dismissed' : 'Pending',
    [d.isDuplicate ? 'Dup' : '', d.flagged ? 'Flag' : ''].filter(Boolean).join(' ') || '—',
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Part', 'Type', 'Severity', 'Source', 'Status', 'Notes']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: [60, 60, 60], fontSize: 8 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
  });

  const lastY = (doc as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY;
  y = (typeof lastY === "number" ? lastY : y) + 10;

  // Photos section
  if (capturedPhotos.length > 0) {
    if (y > 240) { doc.addPage(); y = 20; }
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Captured Photos', 14, y);
    y += 6;

    const imgW = 55;
    const imgH = 40;
    let x = 14;

    for (let i = 0; i < capturedPhotos.length; i++) {
      const photo = capturedPhotos[i];
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
