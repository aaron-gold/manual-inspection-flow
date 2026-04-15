/**
 * UVeye Production API client
 * Endpoint: https://us.api.uveye.app/v1/inspection/
 * API Key: P4CTPXN9morxPO2Qcr1ODjLsp6wJ7Frp
 *
 * NOTE: In production, proxy this through an edge function to keep the key server-side.
 * For now we call the API directly since no backend is available.
 */

const UVEYE_ORIGIN = 'https://us.api.uveye.app';
/** Dev-only path prefix — must match `vite.config.ts` `server.proxy` */
export const UVEYE_DEV_PROXY_PREFIX = '/uveye-api';

function getInspectionPostUrl(): string {
  return import.meta.env.DEV ? `${UVEYE_DEV_PROXY_PREFIX}/v1/inspection` : `${UVEYE_ORIGIN}/v1/inspection`;
}

/**
 * In dev, route API calls through the Vite proxy (same origin → no CORS).
 * In production, call UVeye directly (still subject to CORS unless you deploy a real backend proxy).
 */
export function resolveUveyeRequestUrl(url: string): string {
  const u = url.trim();
  if (!import.meta.env.DEV) return u;
  try {
    const parsed = new URL(u.startsWith('//') ? `https:${u}` : u);
    if (parsed.hostname === 'us.api.uveye.app') {
      return `${UVEYE_DEV_PROXY_PREFIX}${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* ignore */
  }
  return u;
}

export const UVEYE_API_HOST = 'us.api.uveye.app';
/** @internal — only for authenticated image fetch; prefer server-side proxy in production */
export const UVEYE_API_KEY = 'P4CTPXN9morxPO2Qcr1ODjLsp6wJ7Frp';

export function isUveyeApiImageUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  if (import.meta.env.DEV && u.startsWith(UVEYE_DEV_PROXY_PREFIX) && /\/v1\/image/i.test(u)) return true;
  return u.includes(UVEYE_API_HOST) && /\/v1\/image/i.test(u);
}

/** In-memory blob URL cache (session lifetime; speeds up revisiting frames). */
const imageBlobUrlCache = new Map<string, string>();

/** Fetch a UVeye image URL with API key; returns a blob: URL (cached; do not revoke — shared across viewers). */
export async function fetchUveyeImageBlobUrl(url: string): Promise<string> {
  const reqUrl = resolveUveyeRequestUrl(url);
  const hit = imageBlobUrlCache.get(reqUrl);
  if (hit) return hit;
  const res = await fetch(reqUrl, {
    headers: { 'uveye-api-key': UVEYE_API_KEY },
  });
  if (!res.ok) {
    throw new Error(`Image request failed ${res.status}`);
  }
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  imageBlobUrlCache.set(reqUrl, blobUrl);
  return blobUrl;
}

/** Warm the cache for nearby frames (non-blocking). */
export function prefetchUveyeImages(urls: (string | undefined)[]): void {
  for (const u of urls) {
    if (!u?.trim()) continue;
    if (!isUveyeApiImageUrl(u)) continue;
    const reqUrl = resolveUveyeRequestUrl(u);
    if (imageBlobUrlCache.has(reqUrl)) continue;
    fetchUveyeImageBlobUrl(u).catch(() => {});
  }
}

export interface UveyeRequestBody {
  inspectionId: string;
  alertsOnly?: boolean;
  showTreadPolygons?: boolean;
}

// Raw response types — extend as we learn the actual shape
export interface UveyeAlert {
  id?: string;
  part?: string;
  type?: string;
  severity?: string;
  location?: { x?: number; y?: number };
  imageUrl?: string;
  confidence?: number;
  /** Atlas camera id (e.g. `at_front_00`) for portal links / frame matching */
  cameraId?: string;
  /** 0-based or API-native frame index — used with `cameraId` */
  frameIndex?: number;
  /** Optional display name from API (`name`, `damageName`, `displayName`, …) */
  damageName?: string;
  [key: string]: unknown;
}

export interface UveyeInspectionResponse {
  inspectionId?: string;
  vin?: string;
  vehicle?: {
    make?: string;
    model?: string;
    year?: number;
    color?: string;
    [key: string]: unknown;
  };
  alerts?: UveyeAlert[];
  images?: { url?: string; camera?: string; frameNum?: number; [key: string]: unknown }[];
  [key: string]: unknown;
}

/** Keys commonly used by APIs for image URLs (UVeye may vary). */
const IMAGE_URL_KEYS = [
  'url',
  'imageUrl',
  'imageURL',
  'ImageUrl',
  'src',
  'link',
  'uri',
  'Uri',
  'path',
  'thumbnailUrl',
  'cropUrl',
  'publicUrl',
  'signedUrl',
  'frameUrl',
  'image',
  'croppedImage',
  'croppedWallImage',
  'treadImage',
  'wallImage',
] as const;

function pickUrlFromRecord(obj: Record<string, unknown>): string {
  for (const k of IMAGE_URL_KEYS) {
    const v = obj[k];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.startsWith('data:image/') && t.length > 32) {
        return t;
      }
      if (t.length > 4 && (t.startsWith('http') || t.startsWith('/') || t.startsWith('//'))) {
        return t;
      }
    }
  }
  return '';
}

/** Prefer cropped assets for damage / pin views (full frame still used from gallery `pickUrlFromRecord`). */
const DAMAGE_IMAGE_CROP_KEYS = [
  'croppedImage',
  'croppedWallImage',
  'croppedTreadImage',
] as const;

export function pickDamageImageUrl(obj: Record<string, unknown>): string {
  for (const k of DAMAGE_IMAGE_CROP_KEYS) {
    const v = obj[k];
    if (typeof v === 'string') {
      const t = v.trim();
      if (t.startsWith('data:image/') && t.length > 32) return t;
      if (t.length > 4 && (t.startsWith('http') || t.startsWith('/') || t.startsWith('//'))) return t;
    }
  }
  return pickUrlFromRecord(obj);
}

function normalizeCameraKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, '_');
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getPortalInspectionUuid(root: Record<string, unknown>): string {
  const keys = ['inspectionUuid', 'uuid', 'scanUuid', 'id'] as const;
  for (const k of keys) {
    const v = root[k];
    if (typeof v === 'string' && UUID_RE.test(v)) return v;
  }
  const id = root.inspectionId;
  if (typeof id === 'string' && UUID_RE.test(id)) return id;
  return '';
}

/**
 * Deep link to the UVeye web app for a specific Atlas frame.
 * Pattern: https://us.uveye.app/{organizationId}/inspections/{siteId}/{uuid}/Atlas/{cameraId}/{frameIndex}
 */
export function buildUveyePortalAtlasFrameUrl(
  response: UveyeInspectionResponse,
  cameraId: string,
  frameIndex: number,
): string | undefined {
  const root = response as Record<string, unknown>;
  const org = typeof root.organizationId === 'string' ? root.organizationId.trim() : '';
  const site = typeof root.siteId === 'string' ? root.siteId.trim() : '';
  const uuid = getPortalInspectionUuid(root);
  const cam = cameraId.trim();
  if (!org || !site || !uuid || !cam) return undefined;
  const fi = Number.isFinite(frameIndex) ? Math.max(0, Math.floor(frameIndex)) : 0;
  return `https://us.uveye.app/${encodeURIComponent(org)}/inspections/${encodeURIComponent(site)}/${encodeURIComponent(uuid)}/Atlas/${encodeURIComponent(cam)}/${fi}`;
}

/**
 * Web app inspection summary (same base path as Atlas, ends with `/summary`).
 * Pattern: https://us.uveye.app/{organizationId}/inspections/{siteId}/{uuid}/summary
 */
export function buildUveyePortalSummaryUrl(response: UveyeInspectionResponse): string | undefined {
  const root = response as Record<string, unknown>;
  const org = typeof root.organizationId === 'string' ? root.organizationId.trim() : '';
  const site = typeof root.siteId === 'string' ? root.siteId.trim() : '';
  const uuid = getPortalInspectionUuid(root);
  if (!org || !site || !uuid) return undefined;
  return `https://us.uveye.app/${encodeURIComponent(org)}/inspections/${encodeURIComponent(site)}/${encodeURIComponent(uuid)}/summary`;
}

/** Human-readable detection title from payload (atlas `detections[]` item). */
function pickDetectionDisplayName(o: Record<string, unknown>): string {
  const keys = ['damageName', 'name', 'displayName', 'detectionName', 'label', 'title'] as const;
  for (const k of keys) {
    const v = o[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/** Map UVeye `bodyPart` / display strings to UI part names used in AssistedInspectionV3. */
const UVeye_DISPLAY_TO_UI: Record<string, string> = {
  'front bumper': 'Front Bumper',
  'rear bumper': 'Rear Bumper',
  hood: 'Hood',
  windshield: 'Windshield',
  roof: 'Roof',
  trunk: 'Trunk/Liftgate',
  'quarterpanel rear left': 'Left Quarter Panel',
  'quarterpanel rear right': 'Right Quarter Panel',
  'driver rear door': 'Left Rear Door',
  'rear right door': 'Right Rear Door',
  'driver front door': 'Left Front Door',
  'front right door': 'Right Front Door',
  'fender front left': 'Left Fender',
  'fender front right': 'Right Fender',
  'fender rear left': 'Left Quarter Panel',
  'fender rear right': 'Right Quarter Panel',
  'left headlight': 'Headlights',
  'right headlight': 'Headlights',
  'right mirror cover': 'Right Mirror',
  'left mirror cover': 'Left Mirror',
};

const UVeye_CODE_TO_UI: Record<string, string> = {
  bumperfront: 'Front Bumper',
  bumperrear: 'Rear Bumper',
  hood: 'Hood',
  windshield: 'Windshield',
  doorrearright: 'Right Rear Door',
  doorrearleft: 'Left Rear Door',
  doorfrontright: 'Right Front Door',
  doorfrontleft: 'Left Front Door',
  fenderfrontleft: 'Left Fender',
  fenderfrontright: 'Right Fender',
  fenderrearleft: 'Left Quarter Panel',
  fenderrearright: 'Right Quarter Panel',
  headlightleft: 'Headlights',
  headlightright: 'Headlights',
  mirrorcoverright: 'Right Mirror',
  mirrorcoverleft: 'Left Mirror',
  trunk: 'Trunk/Liftgate',
  roof: 'Roof',
};

export function mapUveyePartToUiPartName(displayName: string, bodyPartCode: string): string {
  const d = displayName.trim().toLowerCase();
  const c = bodyPartCode.replace(/\s/g, '').toLowerCase();
  if (UVeye_DISPLAY_TO_UI[d]) return UVeye_DISPLAY_TO_UI[d];
  if (UVeye_CODE_TO_UI[c]) return UVeye_CODE_TO_UI[c];
  return displayName.trim() || bodyPartCode.trim() || 'Unknown';
}

function rectangleToPinPercent(rect: unknown): { x: number; y: number } {
  if (!rect || typeof rect !== 'object') return { x: 50, y: 50 };
  const r = rect as Record<string, unknown>;
  const left = typeof r.left === 'number' ? r.left : 0;
  const top = typeof r.top === 'number' ? r.top : 0;
  const w = typeof r.width === 'number' ? r.width : 0;
  const h = typeof r.height === 'number' ? r.height : 0;
  return {
    x: Math.min(100, Math.max(0, (left + w / 2) * 100)),
    y: Math.min(100, Math.max(0, (top + h / 2) * 100)),
  };
}

function humanizeDetectionType(raw: string): string {
  if (!raw) return 'Damage';
  return raw
    .replace(/^Body/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || raw;
}

function atlasDetectionsToAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const root = response as Record<string, unknown>;
  const atlas = root.atlas;
  if (!atlas || typeof atlas !== 'object') return [];
  const detections = (atlas as Record<string, unknown>).detections;
  if (!Array.isArray(detections)) return [];

  const out: UveyeAlert[] = [];
  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const full = typeof o.image === 'string' ? o.image.trim() : '';
    const crop = typeof o.croppedImage === 'string' ? o.croppedImage.trim() : '';
    const url = crop || full;
    const display = String(o.bodyPartDisplayName ?? o.bodyPart ?? 'Unknown');
    const code = String(o.bodyPart ?? '');
    const part = mapUveyePartToUiPartName(display, code);
    const { x, y } = rectangleToPinPercent(o.rectangle);
    const high = o.isHighSeverity === true;
    const med = o.isMediumSeverity === true;
    const cameraId =
      (typeof o.cameraId === 'string' && o.cameraId.trim()) ||
      (typeof o.camera === 'string' && o.camera.trim()) ||
      (typeof o.cameraName === 'string' && o.cameraName.trim()) ||
      '';
    const frameRaw =
      typeof o.frameIndex === 'number'
        ? o.frameIndex
        : typeof o.frameNumber === 'number'
          ? o.frameNumber
          : typeof o.frameNum === 'number'
            ? o.frameNum
            : typeof o.imageIndex === 'number'
              ? o.imageIndex
              : undefined;
    const damageName = pickDetectionDisplayName(o);
    out.push({
      id: String(o.id ?? `atlas_${i}`),
      part,
      type: humanizeDetectionType(String(o.type ?? 'Damage')),
      severity: high ? 'High' : med ? 'Medium' : 'Low',
      imageUrl: url,
      location: { x, y },
      cameraId: cameraId || undefined,
      frameIndex: frameRaw,
      damageName: damageName || undefined,
    });
  }
  return out;
}

const ARTEMIS_CORNER_LABEL: Record<string, string> = {
  leftFront: 'Left Front Wheel',
  rightFront: 'Right Front Wheel',
  leftRear: 'Left Rear Wheel',
  rightRear: 'Right Rear Wheel',
};

function artemisTireAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const root = response as Record<string, unknown>;
  const artemis = root.artemis;
  if (!artemis || typeof artemis !== 'object') return [];
  const out: UveyeAlert[] = [];
  let idx = 0;
  for (const corner of Object.keys(ARTEMIS_CORNER_LABEL)) {
    const wheel = (artemis as Record<string, unknown>)[corner];
    if (!wheel || typeof wheel !== 'object') continue;
    const w = wheel as Record<string, unknown>;
    const part = ARTEMIS_CORNER_LABEL[corner] ?? corner;
    const lists: unknown[] = [];
    if (Array.isArray(w.wallDetections)) lists.push(...w.wallDetections);
    if (Array.isArray(w.treadDetections)) lists.push(...w.treadDetections);
    for (const det of lists) {
      if (!det || typeof det !== 'object') continue;
      const o = det as Record<string, unknown>;
      const url =
        (typeof o.croppedImage === 'string' && o.croppedImage.trim()) ||
        (typeof o.croppedWallImage === 'string' && o.croppedWallImage.trim()) ||
        (typeof o.croppedTreadImage === 'string' && o.croppedTreadImage.trim()) ||
        '';
      if (!url) continue;
      const { x, y } = rectangleToPinPercent(o.rectangle);
      const high = o.isHighSeverity === true;
      const med = o.isMediumSeverity === true;
      const damageName = pickDetectionDisplayName(o);
      out.push({
        id: String(o.id ?? `tire_${corner}_${idx}`),
        part,
        type: humanizeDetectionType(String(o.type ?? 'Tire damage')),
        severity: high ? 'High' : med ? 'Medium' : 'Low',
        imageUrl: url,
        location: { x, y },
        damageName: damageName || undefined,
      });
      idx += 1;
    }
  }
  return out;
}

/** Legacy `alerts` plus production `atlas.detections` and Artemis tire findings. */
export function getCombinedAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const legacy = response.alerts ?? [];
  return [...legacy, ...atlasDetectionsToAlerts(response), ...artemisTireAlerts(response)];
}

/**
 * Walk the entire JSON tree and collect http(s) and data:image URLs (UVeye may nest images deeply).
 */
function collectMediaUrlsFromTree(value: unknown, depth: number, out: string[], seen: Set<string>): void {
  if (depth > 12 || out.length >= 400) return;
  if (typeof value === 'string') {
    const t = value.trim();
    if (
      (t.startsWith('http://') || t.startsWith('https://')) &&
      t.length > 15 &&
      t.length < 8000 &&
      !seen.has(t)
    ) {
      seen.add(t);
      out.push(t);
      return;
    }
    if (t.startsWith('data:image/') && t.length > 64 && t.length < 6_000_000 && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectMediaUrlsFromTree(item, depth + 1, out, seen);
    return;
  }
  if (value && typeof value === 'object') {
    for (const v of Object.values(value)) collectMediaUrlsFromTree(v, depth + 1, out, seen);
  }
}

/**
 * Some responses wrap the inspection in `data`, `result`, or `inspection`.
 */
export function normalizeUveyeInspectionResponse(raw: unknown): UveyeInspectionResponse {
  if (raw === null || typeof raw !== 'object') {
    return raw as UveyeInspectionResponse;
  }
  let cur = raw as Record<string, unknown>;
  const unwrapKeys = ['data', 'result', 'inspection', 'payload', 'scan', 'report'] as const;
  for (let depth = 0; depth < 5; depth++) {
    let advanced = false;
    for (const key of unwrapKeys) {
      const inner = cur[key];
      if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
        const inn = inner as Record<string, unknown>;
        if (
          inn.alerts !== undefined ||
          inn.images !== undefined ||
          inn.inspectionId !== undefined ||
          inn.vehicle !== undefined ||
          inn.vin !== undefined ||
          inn.atlas !== undefined ||
          inn.organizationId !== undefined ||
          inn.siteId !== undefined
        ) {
          cur = inn;
          advanced = true;
          break;
        }
      }
    }
    if (!advanced) break;
  }
  return cur as UveyeInspectionResponse;
}

function collectImageObjectArrays(r: UveyeInspectionResponse): unknown[][] {
  const root = r as Record<string, unknown>;
  const names = [
    'images',
    'Images',
    'frames',
    'Frames',
    'cameraImages',
    'pictures',
    'Photos',
    'imageList',
    'scanImages',
  ];
  const out: unknown[][] = [];
  for (const n of names) {
    const a = root[n];
    if (Array.isArray(a)) out.push(a);
  }
  return out;
}

export async function fetchUveyeInspection(
  body: UveyeRequestBody,
): Promise<UveyeInspectionResponse> {
  const res = await fetch(getInspectionPostUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'uveye-api-key': UVEYE_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`UVeye API error ${res.status}: ${text}`);
  }

  const rawJson = await res.json();
  const data = normalizeUveyeInspectionResponse(rawJson);

  if (import.meta.env.DEV) {
    const built = buildCameraFramesFromResponse(data);
    const n = getCombinedAlerts(data).length;
    console.info(
      '[UVeye] inspection loaded — combined alerts/detections:',
      n,
      'image frames:',
      built.frames.length,
      'top-level keys:',
      Object.keys(data),
    );
  }

  return data;
}

/** Frame row used by the assisted inspection viewport (matches prior CameraFrame shape). */
export interface UveyeCameraFrame {
  id: string;
  camera: string;
  frameNum: number;
}

/**
 * Build ordered camera frames and a frameId → image URL map from a UVeye payload.
 * Deduplicates by URL; merges `images[]` and alert `imageUrl` values.
 */
export function buildCameraFramesFromResponse(response: UveyeInspectionResponse): {
  frames: UveyeCameraFrame[];
  frameImages: Record<string, string>;
} {
  const frames: UveyeCameraFrame[] = [];
  const frameImages: Record<string, string> = {};
  const seenUrls = new Set<string>();

  const add = (url: string, camera?: string, frameNum?: number) => {
    const u = url.trim();
    if (!u || seenUrls.has(u)) return;
    seenUrls.add(u);
    const id = `f_${frames.length}`;
    frames.push({
      id,
      camera: camera ?? `cam_${frames.length}`,
      frameNum: frameNum ?? 1,
    });
    frameImages[id] = u;
  };

  for (const arr of collectImageObjectArrays(response)) {
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const rec = item as Record<string, unknown>;
      const url = pickUrlFromRecord(rec);
      if (!url) continue;
      const cam =
        typeof rec.camera === 'string'
          ? rec.camera
          : typeof rec.cameraName === 'string'
            ? rec.cameraName
            : typeof rec.Camera === 'string'
              ? rec.Camera
              : undefined;
      const fn =
        typeof rec.frameNum === 'number'
          ? rec.frameNum
          : typeof rec.frameNumber === 'number'
            ? rec.frameNumber
            : typeof rec.FrameNum === 'number'
              ? rec.FrameNum
              : undefined;
      add(url, cam, fn);
    }
  }

  for (const alert of getCombinedAlerts(response)) {
    const rec = alert as Record<string, unknown>;
    const url = pickDamageImageUrl(rec);
    if (url) {
      const cam =
        (typeof rec.cameraId === 'string' && rec.cameraId.trim()) ||
        (typeof alert.cameraId === 'string' && alert.cameraId.trim()) ||
        undefined;
      const fn =
        typeof rec.frameIndex === 'number'
          ? rec.frameIndex
          : typeof rec.frameNumber === 'number'
            ? rec.frameNumber
            : typeof rec.frameNum === 'number'
              ? rec.frameNum
              : undefined;
      add(url, cam, fn);
    }
  }

  if (frames.length === 0) {
    const harvested: string[] = [];
    collectMediaUrlsFromTree(response, 0, harvested, new Set());
    for (const u of harvested) {
      add(u, undefined, undefined);
    }
  }

  return { frames, frameImages };
}

export type UveyeMappedDamage = {
  id: number;
  part: string;
  type: string;
  severity: string;
  ai: boolean;
  x: number;
  y: number;
  frameId: string;
  confirmed: null;
  /** Open this detection in the UVeye web app (Atlas frame). */
  portalUrl?: string;
  /** API detection display name when present */
  damageName?: string;
  /** Stable id from payload (`atlas.detections[].id` etc.) */
  reportId?: string;
};

/** Normalize URL for matching alert image to frame (trim, strip trailing slash on path). */
function normalizeUrlKey(u: string): string {
  try {
    const x = u.trim();
    if (x.startsWith('data:')) return x;
    const url = new URL(x.startsWith('//') ? `https:${x}` : x);
    let path = url.pathname.replace(/\/$/, '');
    return `${url.origin}${path}${url.search}`;
  } catch {
    return u.trim();
  }
}

function findFrameIdForAlert(
  alert: UveyeAlert,
  frames: UveyeCameraFrame[],
  urlToFrameId: Map<string, string>,
): string | undefined {
  const rec = alert as Record<string, unknown>;
  const url = pickDamageImageUrl(rec);
  if (url) {
    if (urlToFrameId.has(url)) return urlToFrameId.get(url);
    const n = normalizeUrlKey(url);
    if (urlToFrameId.has(n)) return urlToFrameId.get(n);
  }
  const cam =
    (typeof rec.cameraId === 'string' && rec.cameraId.trim()) ||
    (typeof alert.cameraId === 'string' && alert.cameraId.trim()) ||
    '';
  const fi = typeof rec.frameIndex === 'number' ? rec.frameIndex : undefined;
  if (!cam || !frames.length) return undefined;
  const camN = normalizeCameraKey(cam);
  const matches = frames.filter((f) => normalizeCameraKey(f.camera) === camN);
  if (matches.length === 1) return matches[0].id;
  if (matches.length > 1 && fi !== undefined) {
    const byNum = matches.find(
      (f) => f.frameNum === fi || f.frameNum === fi + 1 || f.frameNum === fi - 1,
    );
    if (byNum) return byNum.id;
  }
  if (matches.length) return matches[0].id;
  return undefined;
}

/**
 * Map alerts to damages, resolving frameId from alert imageUrl when possible.
 */
export function mapUveyeAlertsToDamages(
  response: UveyeInspectionResponse,
  frames: UveyeCameraFrame[],
  frameImages: Record<string, string>,
): UveyeMappedDamage[] {
  const alerts = getCombinedAlerts(response);
  const urlToFrameId = new Map<string, string>();
  for (const f of frames) {
    const u = frameImages[f.id];
    if (u) {
      urlToFrameId.set(u, f.id);
      urlToFrameId.set(normalizeUrlKey(u), f.id);
    }
  }

  return alerts.map((alert, index) => {
    const rec = alert as Record<string, unknown>;
    const resolved = findFrameIdForAlert(alert, frames, urlToFrameId);
    let frameId =
      resolved ??
      (frames.length === 0 ? 'f_0' : frames[index % frames.length].id);

    const frame = frames.find((f) => f.id === frameId);
    const cam =
      (typeof rec.cameraId === 'string' && rec.cameraId.trim()) ||
      (typeof alert.cameraId === 'string' && alert.cameraId.trim()) ||
      frame?.camera ||
      '';
    const portalFrameIndex =
      typeof rec.frameIndex === 'number'
        ? rec.frameIndex
        : frame && frame.frameNum > 0
          ? frame.frameNum - 1
          : 0;
    const portalUrl =
      cam && buildUveyePortalAtlasFrameUrl(response, cam, portalFrameIndex);

    const apiName =
      typeof alert.damageName === 'string' && alert.damageName.trim()
        ? alert.damageName.trim()
        : pickDetectionDisplayName(rec);
    const reportId = alert.id != null ? String(alert.id) : undefined;

    return {
      id: Date.now() + index,
      part: alert.part || 'Unknown',
      type: alert.type || 'Detected Damage',
      severity: alert.severity || 'Medium',
      ai: true,
      x: alert.location?.x ?? 50,
      y: alert.location?.y ?? 50,
      frameId,
      confirmed: null,
      portalUrl: portalUrl ?? undefined,
      damageName: apiName || undefined,
      reportId,
    };
  });
}

function inferBodyTypeFromVehicle(v: { [key: string]: unknown } | undefined): 'sedan' | 'truck' {
  if (!v) return 'sedan';
  const raw = v.bodyType ?? v.vehicleType ?? v.type;
  if (typeof raw === 'string' && /truck|pickup(?!s)|\bvan\b|ram|f-?150|silverado|commercial\s*vehicle/i.test(raw)) {
    return 'truck';
  }
  return 'sedan';
}

/** Build a dashboard row from API response after a successful retrieve. */
export function buildInspectionRecordFromResponse(
  requestedId: string,
  response: UveyeInspectionResponse,
): {
  id: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  color: string;
  bodyType: 'sedan' | 'truck';
  createdAt: Date;
  status: 'in_progress';
  damageCount: number;
} {
  const root = response as Record<string, unknown>;
  const v = response.vehicle;
  const make = String(v?.make ?? root.make ?? '—');
  const model = String(v?.model ?? root.model ?? '—');
  const yearRaw = v?.year ?? root.year;
  const yearNum =
    typeof yearRaw === 'number'
      ? yearRaw
      : parseInt(String(yearRaw ?? '').replace(/[^\d]/g, '').slice(0, 4), 10) || new Date().getFullYear();
  const vin = String(response.vin ?? root.vin ?? '—');
  const color = String(v?.color ?? root.exteriorColor ?? '—');
  const vehicleLike = v ?? {
    bodyType: root.bodyType,
    vehicleType: root.bodyType,
  };
  return {
    id: String(response.inspectionId ?? requestedId).trim(),
    vin,
    make,
    model,
    year: yearNum,
    color,
    bodyType: inferBodyTypeFromVehicle(vehicleLike as { [key: string]: unknown }),
    createdAt: new Date(),
    status: 'in_progress',
    damageCount: getCombinedAlerts(response).length,
  };
}
