import JSZip from "jszip";
import type { InspectionRecord } from "@/components/InspectionDashboard";
import type { UveyeInspectionResponse } from "@/services/uveyeApi";
import type { CapturedPhotoEntry } from "@/types/capturedPhoto";

function escapeCsvCell(s: string): string {
  const t = String(s ?? "");
  if (/[",\n\r]/.test(t)) return `"${t.replace(/"/g, '""')}"`;
  return t;
}

function startOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

function endOfLocalDay(d: Date): number {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

type ReviewDamage = {
  confirmed?: boolean | null;
  isDuplicate?: boolean;
  /** false = inspector-added (non-AI) */
  ai?: boolean;
};

function damageRollup(
  review: Record<string, unknown> | undefined,
  fallbackApiDamageCount: number,
): {
  aviDamages: number;
  approved: number;
  rejected: number;
  duplicated: number;
  added: number;
} {
  const damages = review?.damages as ReviewDamage[] | undefined;
  if (!Array.isArray(damages) || damages.length === 0) {
    return {
      aviDamages: fallbackApiDamageCount,
      approved: 0,
      rejected: 0,
      duplicated: 0,
      added: 0,
    };
  }
  let avi = 0;
  let approved = 0;
  let rejected = 0;
  let duplicated = 0;
  let added = 0;
  for (const d of damages) {
    if (d.ai === false) added++;
    else avi++;
    if (d.confirmed === true) approved++;
    if (d.confirmed === false) rejected++;
    if (d.isDuplicate) duplicated++;
  }
  return {
    aviDamages: avi,
    approved,
    rejected,
    duplicated,
    added,
  };
}

function extractSiteId(payload: UveyeInspectionResponse | undefined): string {
  if (!payload) return "";
  const r = payload as Record<string, unknown>;
  const v = r.siteId;
  if (v == null) return "";
  return typeof v === "string" ? v : String(v);
}

/** UVeye org / group identifier (portal URLs use `organizationId`). */
function extractGroupId(payload: UveyeInspectionResponse | undefined): string {
  if (!payload) return "";
  const r = payload as Record<string, unknown>;
  if (typeof r.groupId === "string" && r.groupId.trim()) return r.groupId.trim();
  if (typeof r.group_id === "string" && r.group_id.trim()) return r.group_id.trim();
  if (typeof r.organizationId === "string" && r.organizationId.trim()) return r.organizationId.trim();
  return "";
}

function dataUrlToUint8Array(dataUrl: string): Uint8Array {
  const i = dataUrl.indexOf(",");
  if (i < 0) throw new Error("Invalid data URL");
  const b64 = dataUrl.slice(i + 1).trim();
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let j = 0; j < bin.length; j++) out[j] = bin.charCodeAt(j);
  return out;
}

export interface DailyExportInput {
  inspectorName: string;
  /** Which calendar day (local timezone) to include. */
  day: Date;
  inspections: InspectionRecord[];
  payloads: Record<string, UveyeInspectionResponse>;
  reviewById: Record<string, Record<string, unknown>>;
  capturesById: Record<string, CapturedPhotoEntry[]>;
}

export const DAILY_EXPORT_HEADERS = [
  "inspector_name",
  "export_generated_at_iso",
  "inspection_retrieved_local",
  "uveye_inspection_id",
  "vehicle_year",
  "vehicle_make",
  "vehicle_model",
  "vin",
  "color",
  "status",
  "avi_damages",
  "approved",
  "rejected",
  "duplicated",
  "added",
  "site_id",
  "group_id",
  "capture_count",
] as const;

export type DailyActivityRow = string[];

/** Same rows as `daily-activity.csv` (for UI preview and ZIP). */
export function buildDailyActivityRows(input: DailyExportInput): {
  exportedAt: string;
  headers: string[];
  rows: DailyActivityRow[];
} {
  const t0 = startOfLocalDay(input.day);
  const t1 = endOfLocalDay(input.day);

  const filtered = input.inspections.filter((i) => {
    const t = i.createdAt.getTime();
    return t >= t0 && t <= t1;
  });

  const exportedAt = new Date().toISOString();
  const headers = [...DAILY_EXPORT_HEADERS];
  const rows: DailyActivityRow[] = [];

  for (const ins of filtered) {
    const payload = input.payloads[ins.id];
    const review = input.reviewById[ins.id];
    const caps = input.capturesById[ins.id] ?? [];
    const roll = damageRollup(review, ins.damageCount);
    const siteId = extractSiteId(payload);
    const groupId = extractGroupId(payload);

    rows.push([
      input.inspectorName || "",
      exportedAt,
      ins.createdAt.toLocaleString(),
      ins.uveyeInspectionId,
      String(ins.year),
      ins.make,
      ins.model,
      ins.vin,
      ins.color,
      ins.status,
      String(roll.aviDamages),
      String(roll.approved),
      String(roll.rejected),
      String(roll.duplicated),
      String(roll.added),
      siteId,
      groupId,
      String(caps.length),
    ]);
  }

  return { exportedAt, headers, rows };
}

/**
 * CSV columns + `captured-photos/` in the ZIP.
 */
export async function buildDailyExportZip(input: DailyExportInput): Promise<Blob> {
  const zip = new JSZip();
  const { exportedAt, headers, rows: dataRows } = buildDailyActivityRows(input);

  const lines: string[] = [headers.map(escapeCsvCell).join(",")];
  const capRoot = zip.folder("captured-photos");

  const t0 = startOfLocalDay(input.day);
  const t1 = endOfLocalDay(input.day);
  const forZip = input.inspections.filter((i) => {
    const t = i.createdAt.getTime();
    return t >= t0 && t <= t1;
  });

  let rowIdx = 0;
  for (const ins of forZip) {
    lines.push(dataRows[rowIdx].map(escapeCsvCell).join(","));
    rowIdx += 1;

    const caps = input.capturesById[ins.id] ?? [];
    const safeFolder = ins.uveyeInspectionId.replace(/[^a-z0-9-_]/gi, "_").slice(0, 48) || "inspection";

    caps.forEach((cap, idx) => {
      if (!cap.dataUrl?.trim()) return;
      const ext = cap.dataUrl.includes("image/png") ? "png" : "jpg";
      const fileName = `capture_${idx + 1}_${cap.partName.replace(/[^a-z0-9-_]+/gi, "_").slice(0, 32)}.${ext}`;
      try {
        const u8 = dataUrlToUint8Array(cap.dataUrl);
        capRoot?.folder(safeFolder)?.file(fileName, u8);
      } catch {
        /* skip bad data urls */
      }
    });
  }

  zip.file("daily-activity.csv", lines.join("\r\n"));
  zip.file(
    "README.txt",
    [
      "Inspecto — daily export pack",
      "",
      "- daily-activity.csv: columns match the in-app daily summary (damage rollups from review state when present).",
      "- captured-photos/: manual captures; filenames listed align with capture_count.",
      "- avi_damages: AI-sourced detection rows; added: inspector-added (non-AI) rows.",
      "- site_id / group_id: from UVeye payload when present (group_id uses organizationId or groupId).",
      "",
      `Inspector: ${input.inspectorName || "(not set)"}`,
      `Generated: ${exportedAt}`,
      "",
    ].join("\r\n"),
  );

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
