import localforage from "localforage";
import type { InspectionRecord } from "@/components/InspectionDashboard";
import type { UveyeInspectionResponse } from "@/services/uveyeApi";
import type { CapturedPhotoEntry } from "@/types/capturedPhoto";

const store = localforage.createInstance({
  name: "inspecto-frame",
  storeName: "local_data",
});

const BUNDLE_KEY = "inspecto_bundle_v1";

export type SerializedCapturedPhoto = {
  partName: string;
  damageType: string;
  timestamp: string;
  dataUrl?: string;
  imageUrl?: string;
};

export type PersistedBundle = {
  v: 1;
  /** Optional label for CSV exports (not authentication). */
  inspectorName: string;
  inspections: Array<Omit<InspectionRecord, "createdAt"> & { createdAt: string }>;
  payloads: Record<string, UveyeInspectionResponse>;
  reviewById: Record<string, Record<string, unknown>>;
  capturesById: Record<string, SerializedCapturedPhoto[]>;
};

export function serializeRecord(r: InspectionRecord): PersistedBundle["inspections"][number] {
  const { createdAt, timerStartedAt, completedAt, durationSeconds, ...rest } = r;
  return {
    ...rest,
    createdAt: createdAt.toISOString(),
    ...(timerStartedAt ? { timerStartedAt: timerStartedAt.toISOString() } : {}),
    ...(completedAt ? { completedAt: completedAt.toISOString() } : {}),
    ...(typeof durationSeconds === "number" ? { durationSeconds } : {}),
  } as PersistedBundle["inspections"][number];
}

export function deserializeRecord(
  r: PersistedBundle["inspections"][number],
): InspectionRecord {
  const row = r as PersistedBundle["inspections"][number] & {
    timerStartedAt?: string;
    completedAt?: string;
    durationSeconds?: number;
  };
  return {
    ...row,
    createdAt: new Date(row.createdAt),
    timerStartedAt: row.timerStartedAt ? new Date(row.timerStartedAt) : undefined,
    completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
    durationSeconds: typeof row.durationSeconds === "number" ? row.durationSeconds : undefined,
  };
}

export function toSerializedCaptures(photos: CapturedPhotoEntry[]): SerializedCapturedPhoto[] {
  return photos.map((p) => ({
    partName: p.partName,
    damageType: p.damageType,
    timestamp: p.timestamp.toISOString(),
    dataUrl: p.dataUrl,
    imageUrl: p.imageUrl,
  }));
}

export function fromSerializedCaptures(photos: SerializedCapturedPhoto[]): CapturedPhotoEntry[] {
  return photos.map((p) => ({
    partName: p.partName,
    damageType: p.damageType,
    timestamp: new Date(p.timestamp),
    dataUrl: p.dataUrl,
    imageUrl: p.imageUrl,
  }));
}

export async function loadPersistedBundle(): Promise<PersistedBundle | null> {
  const raw = await store.getItem<PersistedBundle>(BUNDLE_KEY);
  return raw && raw.v === 1 ? raw : null;
}

export async function savePersistedBundle(bundle: PersistedBundle): Promise<void> {
  await store.setItem(BUNDLE_KEY, bundle);
}

/** Removes the saved bundle from this browser (IndexedDB). Next save will recreate storage. */
export async function clearPersistedBundle(): Promise<void> {
  await store.removeItem(BUNDLE_KEY);
}
