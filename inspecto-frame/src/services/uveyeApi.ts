import { partNameMatches } from '@/lib/assistedInspectionModel';
import {
  UVeye_BODY_PART_CODE_TO_UI,
  UVeye_BODY_PART_DISPLAY_TO_UI,
} from '@/lib/uveyeBodyPartMap';

/**
 * UVeye Production API client.
 * Default key is embedded for internal deployments; override with `VITE_UVEYE_API_KEY` in `.env` if needed.
 * API and image requests use a same-origin path `/uveye-api` (Vite dev proxy + host rewrites on Netlify/Vercel)
 * so the browser can send `uveye-api-key` without CORS blocking.
 * Lovable Cloud does not apply `public/_redirects`, so on `*.lovable.app` we call UVeye directly (same as `VITE_UVEYE_DIRECT=true`).
 */

const UVEYE_ORIGIN = "https://us.api.uveye.app";

/** Internal default API key (visible in bundle—OK for trusted internal use only). */
const UVEYE_API_KEY_DEFAULT = "P4CTPXN9morxPO2Qcr1ODjLsp6wJ7Frp";
/** Same-origin proxy prefix — must match `vite.config.ts` and `public/_redirects` / `vercel.json`. */
export const UVEYE_DEV_PROXY_PREFIX = '/uveye-api';

/** Lovable’s static host returns the SPA for unknown paths, so `/uveye-api` is not proxied to UVeye. */
function isLovableCloudHostname(): boolean {
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname;
  return h === 'lovable.app' || h.endsWith('.lovable.app');
}

function useUveyeSameOriginProxy(): boolean {
  if (import.meta.env.VITE_UVEYE_DIRECT === 'true') return false;
  /** Rare: Lovable custom domain + your own reverse proxy — force same-origin `/uveye-api`. */
  if (import.meta.env.VITE_UVEYE_FORCE_PROXY === 'true') return true;
  if (isLovableCloudHostname()) return false;
  return true;
}

function getInspectionPostUrl(): string {
  if (!useUveyeSameOriginProxy()) return `${UVEYE_ORIGIN}/v1/inspection`;
  return `${UVEYE_DEV_PROXY_PREFIX}/v1/inspection`;
}

/**
 * Rewrite UVeye host URLs to `/uveye-api/...` so requests stay same-origin (avoids CORS in the browser).
 */
export function resolveUveyeRequestUrl(url: string): string {
  const u = url.trim();
  if (!useUveyeSameOriginProxy()) return u;
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

export const UVEYE_API_HOST = "us.api.uveye.app";

function getUveyeApiKey(): string {
  const k = import.meta.env.VITE_UVEYE_API_KEY;
  if (typeof k === "string" && k.trim()) return k.trim();
  return UVEYE_API_KEY_DEFAULT;
}

export function isUveyeApiImageUrl(url: string): boolean {
  if (typeof url !== 'string' || !url.trim()) return false;
  const u = url.trim();
  if (u.startsWith(UVEYE_DEV_PROXY_PREFIX) && /\/v1\/image/i.test(u)) return true;
  return u.includes(UVEYE_API_HOST) && /\/v1\/image/i.test(u);
}

/** True when requests go through same-origin `/uveye-api` (Netlify/Vercel proxy). False on `*.lovable.app` (direct UVeye). */
export function uveyeUsesSameOriginProxy(): boolean {
  return useUveyeSameOriginProxy();
}

/**
 * Append API key as a query param so cross-origin &lt;img src&gt; works without a credentialed fetch (avoids CORS on Lovable).
 * UVeye image GET accepts auth via `key` query (same value as API key / `uveye-api-key` header).
 */
export function appendUveyeApiKeyToImageUrl(url: string): string {
  const key = getUveyeApiKey();
  try {
    const raw = url.trim();
    const absolute = raw.startsWith('//') ? `https:${raw}` : raw;
    const parsed = new URL(absolute);
    if (parsed.hostname !== UVEYE_API_HOST || !/\/v1\/image/i.test(parsed.pathname)) {
      return url;
    }
    if (parsed.searchParams.has('uveye-api-key') || parsed.searchParams.has('key')) {
      return raw.startsWith('//') ? `//${parsed.host}${parsed.pathname}${parsed.search}` : parsed.toString();
    }
    const qp = import.meta.env.VITE_UVEYE_IMAGE_KEY_QUERY?.trim() || 'key';
    parsed.searchParams.set(qp, key);
    return raw.startsWith('//') ? `//${parsed.host}${parsed.pathname}${parsed.search}` : parsed.toString();
  } catch {
    return url;
  }
}

/** In-memory blob URL cache (session lifetime; speeds up revisiting frames). */
const imageBlobUrlCache = new Map<string, string>();

/** Fetch a UVeye image URL with API key; returns a blob: URL (cached; do not revoke — shared across viewers). */
export async function fetchUveyeImageBlobUrl(url: string): Promise<string> {
  const reqUrl = resolveUveyeRequestUrl(url);
  const hit = imageBlobUrlCache.get(reqUrl);
  if (hit) return hit;

  const key = getUveyeApiKey();
  const res = await fetch(reqUrl, {
    headers: { "uveye-api-key": key },
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
    if (!useUveyeSameOriginProxy()) {
      const img = new Image();
      img.referrerPolicy = 'no-referrer';
      img.src = appendUveyeApiKeyToImageUrl(u);
      continue;
    }
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
  /** Which pipeline produced this alert (for damage reports). */
  inspectionModule?: 'legacy' | 'atlas' | 'helios' | 'artemis';
  /**
   * When the primary `imageUrl` is an annotated crop (arrows/boxes), this is the matching full-frame
   * or base image so reviewers can toggle to a clean view on phones/tablets.
   */
  cleanReviewImageUrl?: string;
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
  'treadImageWithGrooves',
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
  const directImg = typeof obj.imageUrl === 'string' ? obj.imageUrl.trim() : '';
  if (
    directImg.length > 4 &&
    (directImg.startsWith('http') || directImg.startsWith('/') || directImg.startsWith('//'))
  ) {
    return directImg;
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
    if (typeof v === 'string' && UUID_RE.test(v)) return v.trim();
  }
  const id = root.inspectionId;
  if (typeof id === 'string' && UUID_RE.test(id)) return id.trim();
  /** UVeye web app `/…/inspections/{siteId}/{id}/summary` often uses API `inspectionId` even when not RFC-4122. */
  if (typeof id === 'string') {
    const t = id.trim();
    if (t.length > 0) return t;
  }
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
  /** Door handles → same-side door panel */
  'door handle front right': 'Right Front Door',
  'door handle front left': 'Left Front Door',
  'door handle rear right': 'Right Rear Door',
  'door handle rear left': 'Left Rear Door',
  /** Plates → bumper on that end of the vehicle */
  'rear license plate': 'Rear Bumper',
  'front license plate': 'Front Bumper',
  /** Roof rack → single Roof panel in UI */
  'roof rack': 'Roof',
  'roof rack right': 'Roof',
  'roof rack left': 'Roof',
  /** Front badge / emblem — Atlas `SymbolFront` */
  'symbol front': 'Hood',
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
  doorhandlefrontright: 'Right Front Door',
  doorhandlefrontleft: 'Left Front Door',
  doorhandlerearright: 'Right Rear Door',
  doorhandlerearleft: 'Left Rear Door',
  licenseplaterear: 'Rear Bumper',
  licenseplatefront: 'Front Bumper',
  roofrack: 'Roof',
  roofrackright: 'Roof',
  roofrackleft: 'Roof',
  symbolfront: 'Hood',
};

export function mapUveyePartToUiPartName(displayName: string, bodyPartCode: string): string {
  const d = displayName.trim().toLowerCase();
  if (UVeye_DISPLAY_TO_UI[d]) return UVeye_DISPLAY_TO_UI[d];
  if (UVeye_BODY_PART_DISPLAY_TO_UI[d]) return UVeye_BODY_PART_DISPLAY_TO_UI[d];
  const c = bodyPartCode.replace(/\s/g, '').toLowerCase();
  if (UVeye_CODE_TO_UI[c]) return UVeye_CODE_TO_UI[c];
  if (UVeye_BODY_PART_CODE_TO_UI[c]) return UVeye_BODY_PART_CODE_TO_UI[c];
  if (c.startsWith('bodypart')) {
    const stripped = c.slice(8);
    if (stripped) {
      if (UVeye_CODE_TO_UI[stripped]) return UVeye_CODE_TO_UI[stripped];
      if (UVeye_BODY_PART_CODE_TO_UI[stripped]) return UVeye_BODY_PART_CODE_TO_UI[stripped];
    }
  }
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

/** Normalized polygon points [[x,y], …] in 0–1 image space → pin % (matches rectangle convention). */
function polygonToPinPercent(poly: unknown): { x: number; y: number } {
  if (!Array.isArray(poly) || poly.length === 0) return { x: 50, y: 50 };
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const pt of poly) {
    if (!Array.isArray(pt) || pt.length < 2) continue;
    const px = typeof pt[0] === 'number' ? pt[0] : 0;
    const py = typeof pt[1] === 'number' ? pt[1] : 0;
    sx += px;
    sy += py;
    n += 1;
  }
  if (n === 0) return { x: 50, y: 50 };
  return {
    x: Math.min(100, Math.max(0, (sx / n) * 100)),
    y: Math.min(100, Math.max(0, (sy / n) * 100)),
  };
}

/** UVeye sometimes omits groove polygons; spread pins across the tread-with-grooves image. */
function grooveFallbackPinPercent(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 50, y: 50 };
  const t = (index + 1) / (total + 1);
  return {
    x: Math.min(100, Math.max(0, t * 100)),
    y: 52,
  };
}

/** Remaining tread depth at or below 3/32" (legal wear threshold in many US contexts). */
const TREAD_DEPTH_DAMAGE_MAX_MM = (3 / 32) * 25.4;

function parseDepth32ndsFraction(depth32unknown: unknown): number | undefined {
  if (typeof depth32unknown !== 'string') return undefined;
  /** API sometimes appends a stray `"` to values like `1/32"`. */
  const cleaned = depth32unknown.trim().replace(/^["']+|["']+$/g, '');
  const m = cleaned.match(/^(\d+)\s*\/\s*(\d+)/);
  if (!m) return undefined;
  const a = parseInt(m[1], 10);
  const b = parseInt(m[2], 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return undefined;
  return a / b;
}

function isLowTreadGrooveDamage(g: Record<string, unknown>): boolean {
  const mm = typeof g.depthMm === 'number' ? g.depthMm : undefined;
  if (mm !== undefined && Number.isFinite(mm)) {
    return mm <= TREAD_DEPTH_DAMAGE_MAX_MM + 1e-6;
  }
  const frac = parseDepth32ndsFraction(g.depth32ndOfInch);
  if (frac !== undefined) return frac <= 3 / 32 + 1e-9;
  return false;
}

/** Remaining tread depth in mm (lower = more worn). Used to pick one representative groove. */
function grooveRemainingDepthMm(gr: Record<string, unknown>): number | undefined {
  const mm = typeof gr.depthMm === 'number' ? gr.depthMm : undefined;
  if (mm !== undefined && Number.isFinite(mm)) return mm;
  const frac = parseDepth32ndsFraction(gr.depth32ndOfInch);
  if (frac !== undefined) return frac * 25.4;
  return undefined;
}

/** When several grooves are ≤3/32", emit one row: worst = minimum remaining depth (shallowest groove). */
function pickWorstLowGroove(
  lowGrooves: { origIdx: number; rec: Record<string, unknown> }[],
): { origIdx: number; rec: Record<string, unknown> } {
  let best = lowGrooves[0];
  let bestMm = grooveRemainingDepthMm(best.rec);
  for (let i = 1; i < lowGrooves.length; i++) {
    const cur = lowGrooves[i];
    const mm = grooveRemainingDepthMm(cur.rec);
    if (bestMm === undefined || !Number.isFinite(bestMm)) {
      best = cur;
      bestMm = mm;
      continue;
    }
    if (mm === undefined || !Number.isFinite(mm)) continue;
    if (mm < bestMm - 1e-9) {
      best = cur;
      bestMm = mm;
    } else if (Math.abs(mm - bestMm) <= 1e-9) {
      if (cur.rec.isCritical === true && best.rec.isCritical !== true) best = cur;
    }
  }
  return best;
}

export function humanizeDetectionType(raw: string): string {
  if (!raw) return 'Damage';
  const t = raw.trim();
  /**
   * Dent types from Atlas: show **Dent** for paint-free dents; **Dent with paint** when paint damage
   * is involved (e.g. `BodyDentWithPaintDamage`). Other body types still use the generic humanizer below.
   */
  if (/^BodyDent/i.test(t)) {
    if (/WithPaint/i.test(t)) return 'Dent with paint';
    return 'Dent';
  }
  return raw
    .replace(/^Body/, '')
    .replace(/^Undercarriage/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim() || raw;
}

/** True for empty or our synthetic `cam_0`… labels from `buildCameraFramesFromResponse` (not real Atlas ids). */
function isSyntheticPortalCameraId(s: string): boolean {
  return !s.trim() || /^cam_\d+$/i.test(s.trim());
}

/**
 * Match detection `image` / `croppedImage` to `atlas.animatedFrames` and derive UVeye portal ids
 * (`at_cam_04` …), not synthetic `cam_N` from the local frame list.
 * Strips: left → at_cam_04, top → at_cam_05, right → at_cam_06 (0-based index within that strip).
 */
const ANIMATED_STRIP_ORDER = ['left', 'top', 'right'] as const;
const ATLAS_CAM_STRIP_BASE = 4;

function inferAtlasPortalFromAnimatedFrames(
  response: UveyeInspectionResponse,
  imageCandidates: string[],
): { cameraId: string; frameIndex: number } | undefined {
  const atlas = (response as Record<string, unknown>).atlas as Record<string, unknown> | undefined;
  if (!atlas) return undefined;
  const af = atlas.animatedFrames as Record<string, unknown> | undefined;
  if (!af || typeof af !== 'object') return undefined;

  const candidates = imageCandidates.map((s) => s.trim()).filter(Boolean);
  if (candidates.length === 0) return undefined;

  for (let stripIdx = 0; stripIdx < ANIMATED_STRIP_ORDER.length; stripIdx++) {
    const side = ANIMATED_STRIP_ORDER[stripIdx];
    const arr = af[side];
    if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const u = typeof arr[i] === 'string' ? arr[i].trim() : '';
      if (!u) continue;
      const nk = normalizeUrlKey(u);
      for (const cand of candidates) {
        if (normalizeUrlKey(cand) === nk) {
          const camNum = ATLAS_CAM_STRIP_BASE + stripIdx;
          return {
            cameraId: `at_cam_${String(camNum).padStart(2, '0')}`,
            frameIndex: i,
          };
        }
      }
    }
  }
  return undefined;
}

/**
 * Atlas `detections[]` mm fields — diagonal = √(w²+h²) when both exist; else `lengthInMm` (scratches).
 */
function atlasSizesFromDetection(o: Record<string, unknown>): {
  diagonalMm?: number;
  widthMm?: number;
  heightMm?: number;
} {
  const w =
    typeof o.widthInMm === 'number' && Number.isFinite(o.widthInMm) ? o.widthInMm : undefined;
  const h =
    typeof o.heightInMm === 'number' && Number.isFinite(o.heightInMm) ? o.heightInMm : undefined;
  const len =
    typeof o.lengthInMm === 'number' && Number.isFinite(o.lengthInMm) ? o.lengthInMm : undefined;
  let diagonalMm: number | undefined;
  if (w != null && h != null) diagonalMm = Math.sqrt(w * w + h * h);
  else if (len != null) diagonalMm = len;
  return {
    diagonalMm,
    widthMm: w,
    heightMm: h,
  };
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
    const cleanReviewImageUrl =
      crop && full && normalizeUrlKey(crop) !== normalizeUrlKey(full) ? full : undefined;
    const display = String(o.bodyPartDisplayName ?? o.bodyPart ?? 'Unknown');
    const code = String(o.bodyPart ?? '');
    const part = mapUveyePartToUiPartName(display, code);
    const { x, y } = rectangleToPinPercent(o.rectangle);
    const high = o.isHighSeverity === true;
    const med = o.isMediumSeverity === true;
    let cameraId =
      (typeof o.cameraId === 'string' && o.cameraId.trim()) ||
      (typeof o.camera === 'string' && o.camera.trim()) ||
      (typeof o.cameraName === 'string' && o.cameraName.trim()) ||
      '';
    let frameRaw =
      typeof o.frameIndex === 'number'
        ? o.frameIndex
        : typeof o.frameNumber === 'number'
          ? o.frameNumber
          : typeof o.frameNum === 'number'
            ? o.frameNum
            : typeof o.imageIndex === 'number'
              ? o.imageIndex
              : undefined;
    const inferred = inferAtlasPortalFromAnimatedFrames(response, [full, crop, crop || full]);
    if (inferred && !cameraId) {
      cameraId = inferred.cameraId;
      if (frameRaw === undefined) frameRaw = inferred.frameIndex;
    }
    const damageName = pickDetectionDisplayName(o);
    const sizes = atlasSizesFromDetection(o);
    out.push({
      id: String(o.id ?? `atlas_${i}`),
      part,
      type: humanizeDetectionType(String(o.type ?? 'Damage')),
      severity: high ? 'High' : med ? 'Medium' : 'Low',
      imageUrl: url,
      ...(cleanReviewImageUrl ? { cleanReviewImageUrl } : {}),
      location: { x, y },
      cameraId: cameraId || undefined,
      frameIndex: frameRaw,
      damageName: damageName || undefined,
      inspectionModule: 'atlas',
      sizeDiagonalMm: sizes.diagonalMm,
      sizeWidthMm: sizes.widthMm,
      sizeHeightMm: sizes.heightMm,
    });
  }
  return out;
}

/** Helios (undercarriage) — shared `undercarriageImage`, pins from each `detections[]` rectangle. */
function heliosDetectionsToAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const root = response as Record<string, unknown>;
  const helios = root.helios;
  if (!helios || typeof helios !== 'object') return [];
  const h = helios as Record<string, unknown>;
  const imageUrl =
    typeof h.undercarriageImage === 'string' ? h.undercarriageImage.trim() : '';
  if (!imageUrl) return [];
  const detections = h.detections;
  if (!Array.isArray(detections)) return [];

  const part = 'Undercarriage';
  const out: UveyeAlert[] = [];
  for (let i = 0; i < detections.length; i++) {
    const d = detections[i];
    if (!d || typeof d !== 'object') continue;
    const o = d as Record<string, unknown>;
    const { x, y } = rectangleToPinPercent(o.rectangle);
    const high = o.isHighSeverity === true;
    const med = o.isMediumSeverity === true;
    const rawType = String(o.type ?? 'Damage');
    const title = humanizeDetectionType(rawType);
    out.push({
      id: String(o.id ?? `helios_${i}`),
      part,
      type: title,
      severity: high ? 'High' : med ? 'Medium' : 'Low',
      imageUrl,
      location: { x, y },
      frameIndex: 0,
      damageName: title,
      inspectionModule: 'helios',
    });
  }
  return out;
}

const ARTEMIS_CORNER_LABEL: Record<string, string> = {
  leftFront: 'Left Front Tire',
  rightFront: 'Right Front Tire',
  leftRear: 'Left Rear Tire',
  rightRear: 'Right Rear Tire',
};

/** Sidewall / rim / cosmetic — distinct from tread in the vehicle diagram. */
const ARTEMIS_CORNER_TIRE_WALL_LABEL: Record<string, string> = {
  leftFront: 'Left Front Tire Wall',
  rightFront: 'Right Front Tire Wall',
  leftRear: 'Left Rear Tire Wall',
  rightRear: 'Right Rear Tire Wall',
};

const ARTEMIS_CORNER_ORDER = ['leftFront', 'rightFront', 'leftRear', 'rightRear'] as const;

/** Fields that indicate this object is the real tire payload (UVeye may use `left_front` instead of `leftFront`). */
const ARTEMIS_WHEEL_PAYLOAD_KEYS = [
  'treadImage',
  'wallImage',
  'treadImageWithGrooves',
  'grooves',
  'wallDetections',
  'treadDetections',
] as const;

function artemisWheelObjectForCorner(
  artemis: Record<string, unknown>,
  corner: string,
): Record<string, unknown> | null {
  const snake = corner.replace(/([A-Z])/g, '_$1').toLowerCase();
  const keys = snake === corner ? [corner] : [corner, snake];
  const candidates: Record<string, unknown>[] = [];
  for (const k of keys) {
    const w = artemis[k];
    if (w && typeof w === 'object' && !Array.isArray(w)) candidates.push(w as Record<string, unknown>);
  }
  if (candidates.length === 0) return null;
  const rich = candidates.find((o) =>
    ARTEMIS_WHEEL_PAYLOAD_KEYS.some((key) => {
      const v = o[key];
      if (typeof v === 'string') return v.trim().length > 0;
      return Array.isArray(v) && v.length > 0;
    }),
  );
  return rich ?? candidates[0];
}

/** Tire brand / age / pressure: metadata only in API payloads — not emitted as review rows until product defines handling. */
function artemisTireAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const root = response as Record<string, unknown>;
  const artemis = root.artemis;
  if (!artemis || typeof artemis !== 'object') return [];
  const artemisRec = artemis as Record<string, unknown>;
  const out: UveyeAlert[] = [];
  let idx = 0;
  for (const corner of ARTEMIS_CORNER_ORDER) {
    const wheel = artemisWheelObjectForCorner(artemisRec, corner);
    if (!wheel) continue;
    const w = wheel;
    const partWheel = ARTEMIS_CORNER_LABEL[corner] ?? corner;
    const partWall = ARTEMIS_CORNER_TIRE_WALL_LABEL[corner] ?? corner;
    const wallBase =
      typeof w.wallImage === 'string' ? w.wallImage.trim() : '';
    const treadBase =
      typeof w.treadImage === 'string' ? w.treadImage.trim() : '';
    const treadWithGrooves =
      typeof w.treadImageWithGrooves === 'string'
        ? w.treadImageWithGrooves.trim()
        : '';
    const treadGrooveViewUrl = treadWithGrooves || treadBase;

    /** Sidewall / rim: only `wallDetections` — coordinates are on the wall image. */
    if (Array.isArray(w.wallDetections)) {
      for (const det of w.wallDetections) {
        if (!det || typeof det !== 'object') continue;
        const o = det as Record<string, unknown>;
        const cropped =
          (typeof o.croppedImage === 'string' && o.croppedImage.trim()) ||
          (typeof o.croppedWallImage === 'string' && o.croppedWallImage.trim()) ||
          '';
        const url = cropped || wallBase || '';
        const cleanReviewImageUrl =
          cropped &&
          wallBase &&
          normalizeUrlKey(cropped) !== normalizeUrlKey(wallBase)
            ? wallBase
            : undefined;
        if (!url) continue;
        const { x, y } = rectangleToPinPercent(o.rectangle);
        const high = o.isHighSeverity === true;
        const med = o.isMediumSeverity === true;
        /** `wallDetections` → tire wall part only (rim, bulge, cut, cosmetic rim, etc.). */
        const part = partWall;
        const humanType = humanizeDetectionType(String(o.type ?? 'Tire damage'));
        const rawTitle = pickDetectionDisplayName(o);
        const label = rawTitle || humanType;
        const typeStr = `Tire sidewall — ${humanType}`;
        const damageName = `Sidewall: ${label}`;
        out.push({
          id: String(o.id ?? `tire_wall_${corner}_${idx}`),
          part,
          type: typeStr,
          severity: high ? 'High' : med ? 'Medium' : 'Low',
          imageUrl: url,
          ...(cleanReviewImageUrl ? { cleanReviewImageUrl } : {}),
          location: { x, y },
          damageName,
          inspectionModule: 'artemis',
        });
        idx += 1;
      }
    }

    /** Tread surface: foreign objects / tread-only detections — coordinates on tread image. */
    if (Array.isArray(w.treadDetections)) {
      for (const det of w.treadDetections) {
        if (!det || typeof det !== 'object') continue;
        const o = det as Record<string, unknown>;
        const cropped =
          (typeof o.croppedImage === 'string' && o.croppedImage.trim()) ||
          (typeof o.croppedTreadImage === 'string' && o.croppedTreadImage.trim()) ||
          '';
        const url = cropped || treadBase || '';
        const cleanReviewImageUrl =
          cropped &&
          treadBase &&
          normalizeUrlKey(cropped) !== normalizeUrlKey(treadBase)
            ? treadBase
            : undefined;
        if (!url) continue;
        const { x, y } = rectangleToPinPercent(o.rectangle);
        const high = o.isHighSeverity === true;
        const med = o.isMediumSeverity === true;
        /** `treadDetections` → rolling surface / tread only (FOD, tread issues). */
        const part = partWheel;
        const humanType = humanizeDetectionType(String(o.type ?? 'Tire damage'));
        const rawTitle = pickDetectionDisplayName(o);
        const label = rawTitle || humanType;
        const typeStr = `Tire tread — ${humanType}`;
        const damageName = `Tread: ${label}`;
        out.push({
          id: String(o.id ?? `tire_tread_${corner}_${idx}`),
          part,
          type: typeStr,
          severity: high ? 'High' : med ? 'Medium' : 'Low',
          imageUrl: url,
          ...(cleanReviewImageUrl ? { cleanReviewImageUrl } : {}),
          location: { x, y },
          damageName,
          inspectionModule: 'artemis',
        });
        idx += 1;
      }
    }

    /**
     * Low tread from `grooves[]` (remaining depth ≤ 3/32"): **one** damage per tire corner — shallowest
     * groove (minimum mm / 32nds), one `treadImageWithGrooves` frame, one pin (that groove's polygon or center).
     */
    const grooves = w.grooves;
    let grooveWearRowsForCorner = 0;
    if (Array.isArray(grooves) && treadGrooveViewUrl) {
      const lowGrooves: { origIdx: number; rec: Record<string, unknown> }[] = [];
      for (let gi = 0; gi < grooves.length; gi++) {
        const g = grooves[gi];
        if (!g || typeof g !== 'object') continue;
        const gr = g as Record<string, unknown>;
        if (isLowTreadGrooveDamage(gr)) lowGrooves.push({ origIdx: gi, rec: gr });
      }
      const nLow = lowGrooves.length;
      grooveWearRowsForCorner = nLow > 0 ? 1 : 0;
      if (nLow > 0) {
        const { rec: gr } = pickWorstLowGroove(lowGrooves);
        const poly = gr.polygon;
        let pin = polygonToPinPercent(poly);
        if (!Array.isArray(poly) || poly.length === 0) {
          pin = grooveFallbackPinPercent(0, 1);
        }
        const depthLabel =
          typeof gr.depth32ndOfInch === 'string'
            ? gr.depth32ndOfInch.trim()
            : typeof gr.depthMm === 'number'
              ? `${gr.depthMm.toFixed(1)} mm`
              : 'low';
        const high = gr.isCritical === true;
        const med = gr.isMarginal === true && !high;
        const cleanGrooveReview =
          treadWithGrooves &&
          treadBase &&
          normalizeUrlKey(treadGrooveViewUrl) === normalizeUrlKey(treadWithGrooves) &&
          normalizeUrlKey(treadBase) !== normalizeUrlKey(treadWithGrooves)
            ? treadBase
            : undefined;
        out.push({
          id: `groove_low_${corner}`,
          part: partWheel,
          type: 'Tire tread — Low tread depth',
          severity: high ? 'High' : med ? 'Medium' : 'Low',
          imageUrl: treadGrooveViewUrl,
          ...(cleanGrooveReview ? { cleanReviewImageUrl: cleanGrooveReview } : {}),
          location: { x: pin.x, y: pin.y },
          damageName: `Tread: low depth (${depthLabel} — at or below 3/32")`,
          inspectionModule: 'artemis',
        });
        idx += 1;
      }
    }

    /**
     * Only when the API did **not** send per-groove rows: surface one row from `wornTireDetected` / uneven flags.
     * If `grooves[]` exists, we trust only `isLowTreadGrooveDamage` (≤3/32"); e.g. 4/32" must not become a row
     * just because the API says "Marginal".
     */
    const hasGrooveMeasurements = Array.isArray(grooves) && grooves.length > 0;
    if (grooveWearRowsForCorner === 0 && treadGrooveViewUrl && !hasGrooveMeasurements) {
      const wornRaw = String(w.wornTireDetected ?? '').trim().toLowerCase();
      const isBadWear =
        wornRaw === 'critical' ||
        wornRaw === 'marginal' ||
        wornRaw.includes('critical') ||
        wornRaw.includes('marginal');
      if (isBadWear || w.unevenTreadsWearDetected === true) {
        const high = wornRaw.includes('critical') || wornRaw === 'critical';
        const med = wornRaw.includes('marginal') || wornRaw === 'marginal';
        const cleanGrooveReviewWorn =
          treadWithGrooves &&
          treadBase &&
          normalizeUrlKey(treadGrooveViewUrl) === normalizeUrlKey(treadWithGrooves) &&
          normalizeUrlKey(treadBase) !== normalizeUrlKey(treadWithGrooves)
            ? treadBase
            : undefined;
        out.push({
          id: `worn_flag_${corner}`,
          part: partWheel,
          type: 'Tire tread — Wear attention',
          severity: high ? 'High' : med ? 'Medium' : 'Low',
          imageUrl: treadGrooveViewUrl,
          ...(cleanGrooveReviewWorn ? { cleanReviewImageUrl: cleanGrooveReviewWorn } : {}),
          location: { x: 50, y: 50 },
          damageName: `Tread: ${String(w.wornTireDetected ?? 'wear')} — review tire`,
          inspectionModule: 'artemis',
        });
        idx += 1;
      }
    }
  }
  return out;
}

/** Legacy `alerts` plus `atlas.detections`, `helios.detections` (undercarriage), and Artemis tires. */
export function getCombinedAlerts(response: UveyeInspectionResponse): UveyeAlert[] {
  const legacy = Array.isArray(response.alerts) ? response.alerts : [];
  const legacyTagged = (legacy as UveyeAlert[]).map((a) => ({
    ...a,
    inspectionModule: 'legacy' as const,
  }));
  return [
    ...legacyTagged,
    ...atlasDetectionsToAlerts(response),
    ...heliosDetectionsToAlerts(response),
    ...artemisTireAlerts(response),
  ];
}

/**
 * Human-readable damage `type` strings present on this inspection payload (alerts + atlas/helios/artemis).
 * Sorted for stable dropdown order; merge with manual presets in the UI.
 */
export function collectHumanizedDamageTypesFromPayload(response: UveyeInspectionResponse): string[] {
  const alerts = getCombinedAlerts(response);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of alerts) {
    const raw = typeof a.type === 'string' ? a.type.trim() : '';
    if (!raw) continue;
    const h = humanizeDetectionType(raw);
    const key = h.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  out.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  return out;
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
          inn.helios !== undefined ||
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

/** Detect SPA / error HTML returned instead of JSON (common when /uveye-api is not proxied on the host). */
function parseUveyeInspectionResponseBody(text: string, requestUrl: string): unknown {
  const start = text.trimStart();
  if (start.startsWith("<") || start.toLowerCase().startsWith("<!doctype")) {
    throw new Error(
      "The server returned HTML instead of JSON (often the app shell). On Netlify/Vercel, proxy POST /uveye-api/* to https://us.api.uveye.app (see public/_redirects / vercel.json) before the SPA fallback. On Lovable, use a `*.lovable.app` URL (the app calls UVeye directly) or set VITE_UVEYE_DIRECT=true on other hosts. Request URL: " +
        requestUrl,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(
      `Inspection response was not valid JSON (URL: ${requestUrl}). First 240 chars: ${text.slice(0, 240)}`,
    );
  }
}

export async function fetchUveyeInspection(
  body: UveyeRequestBody,
): Promise<UveyeInspectionResponse> {
  const url = getInspectionPostUrl();
  const key = getUveyeApiKey();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "uveye-api-key": key,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text().catch(() => "");

  if (!res.ok) {
    const hint =
      text.trimStart().startsWith("<") || text.trimStart().toLowerCase().startsWith("<!doctype")
        ? " (response looks like HTML — check /uveye-api proxy on your host)"
        : "";
    throw new Error(`UVeye API error ${res.status}${hint}: ${text.slice(0, 800)}`);
  }

  const rawJson = parseUveyeInspectionResponseBody(text, url);
  const data = normalizeUveyeInspectionResponse(rawJson);

  if (import.meta.env.DEV) {
    const built = buildCameraFramesFromResponse(data);
    const n = getCombinedAlerts(data).length;
    console.info(
      "[UVeye] inspection loaded — combined alerts/detections:",
      n,
      "image frames:",
      built.frames.length,
      "top-level keys:",
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

  /** Register tire close-ups early so `findFrameIdForAlert` resolves tread / wall / groove-overlay URLs reliably. */
  const artemisRoot = (response as Record<string, unknown>).artemis;
  if (artemisRoot && typeof artemisRoot === 'object') {
    const artemisRec = artemisRoot as Record<string, unknown>;
    for (const corner of ARTEMIS_CORNER_ORDER) {
      const wheel = artemisWheelObjectForCorner(artemisRec, corner);
      if (!wheel) continue;
      const w = wheel;
      const treadG =
        typeof w.treadImageWithGrooves === 'string' ? w.treadImageWithGrooves.trim() : '';
      const tread = typeof w.treadImage === 'string' ? w.treadImage.trim() : '';
      const wall = typeof w.wallImage === 'string' ? w.wallImage.trim() : '';
      if (treadG) add(treadG, `artemis_${corner}_treadGrooves`, 1);
      if (tread) add(tread, `artemis_${corner}_tread`, 1);
      if (wall) add(wall, `artemis_${corner}_wall`, 1);
    }
  }

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
  /** Atlas camera id from API (e.g. `at_cam_06`); keep when persisting review state for URL rebuild. */
  atlasCameraId?: string;
  /** 0-based frame index passed to Atlas URL (from `frameIndex` or derived from frame). */
  atlasFrameIndex?: number;
  /** API detection display name when present */
  damageName?: string;
  /** Stable id from payload (`atlas.detections[].id` etc.) */
  reportId?: string;
  inspectionModule?: 'legacy' | 'atlas' | 'helios' | 'artemis';
  sizeDiagonalMm?: number;
  sizeWidthMm?: number;
  sizeHeightMm?: number;
  /** Full-frame or base image when the review image is an annotated crop. */
  cleanReviewImageUrl?: string;
};

/**
 * Prefer stored full URL; else rebuild from persisted API camera/index + payload.
 * Pass `frame` so UI frames labeled `cam_0` still resolve when API id differs.
 */
export function resolveDamageAtlasPortalUrl(
  damage: {
    portalUrl?: string;
    atlasCameraId?: string;
    atlasFrameIndex?: number;
  },
  response: UveyeInspectionResponse,
  frame: UveyeCameraFrame | null | undefined,
): string | undefined {
  if (damage.portalUrl?.trim()) return damage.portalUrl.trim();
  const cam = (damage.atlasCameraId?.trim() || frame?.camera?.trim() || '').trim();
  if (!cam) return undefined;
  let fi = 0;
  if (typeof damage.atlasFrameIndex === 'number' && Number.isFinite(damage.atlasFrameIndex)) {
    fi = Math.max(0, Math.floor(damage.atlasFrameIndex));
  } else if (frame && frame.frameNum > 0) {
    fi = frame.frameNum - 1;
  }
  return buildUveyePortalAtlasFrameUrl(response, cam, fi);
}

/**
 * Re-attach viewport + portal fields from a fresh `mapUveyeAlertsToDamages` pass onto persisted rows.
 * Saved rows keep review flags (`confirmed`, `isDuplicate`, `flagged`) but `frameId` / pin position must
 * follow the fresh mapping so `getFramesForPart` still resolves after re-fetch or frame-list reordering.
 * Fresh rows that do not match any saved row (e.g. new groove-depth alerts) are appended so they are not lost.
 */
export function mergePersistedDamagesWithFreshMap<
  T extends {
    part: string;
    frameId: string;
    type: string;
    severity: string;
    reportId?: string;
    damageName?: string;
    portalUrl?: string;
    atlasCameraId?: string;
    atlasFrameIndex?: number;
    x?: number;
    y?: number;
    inspectionModule?: 'legacy' | 'atlas' | 'helios' | 'artemis';
    sizeDiagonalMm?: number;
    sizeWidthMm?: number;
    sizeHeightMm?: number;
    cleanReviewImageUrl?: string;
    captureId?: string;
  },
>(saved: T[], fresh: UveyeMappedDamage[]): T[] {
  const pool = [...fresh];
  const merged = saved.map((d) => {
    const capId = typeof d.captureId === 'string' ? d.captureId.trim() : '';
    if (capId) return d;

    let idx = -1;
    if (d.reportId) {
      idx = pool.findIndex((x) => x.reportId === d.reportId);
    }
    if (idx < 0) {
      idx = pool.findIndex(
        (x) =>
          partNameMatches(x.part, d.part) &&
          x.frameId === d.frameId &&
          (x.damageName || '') === (d.damageName || ''),
      );
    }
    /** Stale `frameId` from an older payload breaks image lookup; fall back to part + labels. */
    if (idx < 0) {
      idx = pool.findIndex(
        (x) =>
          partNameMatches(x.part, d.part) &&
          (x.damageName || '') === (d.damageName || '') &&
          x.type === d.type &&
          x.severity === d.severity,
      );
    }
    if (idx < 0) return d;
    const m = pool[idx];
    pool.splice(idx, 1);
    return {
      ...d,
      /** Fresh mapping is source of truth so diagram highlights match the correct wheel after API / mapping fixes. */
      part: m.part,
      type: m.type,
      severity: m.severity,
      damageName: m.damageName ?? d.damageName,
      frameId: m.frameId,
      x: m.x,
      y: m.y,
      portalUrl: m.portalUrl ?? d.portalUrl,
      atlasCameraId: m.atlasCameraId ?? d.atlasCameraId,
      atlasFrameIndex: m.atlasFrameIndex ?? d.atlasFrameIndex,
      inspectionModule: m.inspectionModule ?? d.inspectionModule,
      sizeDiagonalMm: m.sizeDiagonalMm ?? d.sizeDiagonalMm,
      sizeWidthMm: m.sizeWidthMm ?? d.sizeWidthMm,
      sizeHeightMm: m.sizeHeightMm ?? d.sizeHeightMm,
      cleanReviewImageUrl: m.cleanReviewImageUrl ?? d.cleanReviewImageUrl,
    };
  });
  /** New API rows (e.g. Artemis groove alerts) that had no prior saved row — must not be dropped. */
  return [...merged, ...(pool as unknown as T[])];
}

/** Normalize URL for matching alert image to frame (trim, strip trailing slash on path). */
function normalizeUrlKey(u: string): string {
  try {
    const x = u.trim();
    if (x.startsWith('data:')) return x;
    const url = new URL(x.startsWith('//') ? `https:${x}` : x);
    const path = url.pathname.replace(/\/$/, '');
    return `${url.origin}${path}${url.search}`;
  } catch {
    return u.trim();
  }
}

/** Legacy / raw alerts: full `image` when the primary asset is a `cropped*` URL. */
function pickDamageCleanReviewFromRec(rec: Record<string, unknown>): string | undefined {
  const crop =
    (typeof rec.croppedImage === 'string' && rec.croppedImage.trim()) ||
    (typeof rec.croppedWallImage === 'string' && rec.croppedWallImage.trim()) ||
    (typeof rec.croppedTreadImage === 'string' && rec.croppedTreadImage.trim()) ||
    '';
  const full = typeof rec.image === 'string' ? rec.image.trim() : '';
  if (crop && full && normalizeUrlKey(crop) !== normalizeUrlKey(full)) return full;
  return undefined;
}

function findFrameIdForAlert(
  alert: UveyeAlert,
  frames: UveyeCameraFrame[],
  urlToFrameId: Map<string, string>,
): string | undefined {
  const rec = alert as Record<string, unknown>;
  const url =
    pickDamageImageUrl(rec) ||
    (typeof rec.imageUrl === 'string' && rec.imageUrl.trim()) ||
    '';
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
    const frameId =
      resolved ??
      (frames.length === 0 ? 'f_0' : frames[index % frames.length].id);

    const frame = frames.find((f) => f.id === frameId);
    const fromAlert =
      (typeof rec.cameraId === 'string' && rec.cameraId.trim()) ||
      (typeof alert.cameraId === 'string' && alert.cameraId.trim()) ||
      '';
    const frameCam = typeof frame?.camera === 'string' ? frame.camera.trim() : '';
    const urlCandidates = [
      pickDamageImageUrl(rec),
      typeof rec.imageUrl === 'string' ? rec.imageUrl.trim() : '',
      typeof alert.imageUrl === 'string' ? alert.imageUrl.trim() : '',
    ].filter(Boolean);

    const inferredPortal = inferAtlasPortalFromAnimatedFrames(response, urlCandidates);

    let camForPortal = fromAlert || frameCam;
    let portalFrameIndex =
      typeof rec.frameIndex === 'number'
        ? rec.frameIndex
        : frame && frame.frameNum > 0
          ? frame.frameNum - 1
          : 0;

    /** Replace synthetic `cam_N` (or missing id) with real `at_cam_XX` + strip frame index from `animatedFrames`. */
    if (inferredPortal && isSyntheticPortalCameraId(camForPortal)) {
      camForPortal = inferredPortal.cameraId;
      portalFrameIndex = inferredPortal.frameIndex;
    }

    const portalUrl =
      camForPortal && !isSyntheticPortalCameraId(camForPortal)
        ? buildUveyePortalAtlasFrameUrl(response, camForPortal, portalFrameIndex)
        : undefined;

    const apiName =
      typeof alert.damageName === 'string' && alert.damageName.trim()
        ? alert.damageName.trim()
        : pickDetectionDisplayName(rec);
    const reportId = alert.id != null ? String(alert.id) : undefined;

    const mod = rec.inspectionModule;
    const inspectionModule =
      mod === 'legacy' || mod === 'atlas' || mod === 'helios' || mod === 'artemis' ? mod : undefined;

    const fromAlertClean =
      typeof alert.cleanReviewImageUrl === 'string' ? alert.cleanReviewImageUrl.trim() : '';
    const cleanReviewImageUrl =
      fromAlertClean || pickDamageCleanReviewFromRec(rec) || undefined;

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
      atlasCameraId:
        !isSyntheticPortalCameraId(camForPortal)
          ? camForPortal
          : inferredPortal?.cameraId,
      atlasFrameIndex: portalFrameIndex,
      damageName: apiName || undefined,
      reportId,
      inspectionModule,
      sizeDiagonalMm:
        typeof rec.sizeDiagonalMm === 'number' && Number.isFinite(rec.sizeDiagonalMm)
          ? rec.sizeDiagonalMm
          : undefined,
      sizeWidthMm:
        typeof rec.sizeWidthMm === 'number' && Number.isFinite(rec.sizeWidthMm)
          ? rec.sizeWidthMm
          : undefined,
      sizeHeightMm:
        typeof rec.sizeHeightMm === 'number' && Number.isFinite(rec.sizeHeightMm)
          ? rec.sizeHeightMm
          : undefined,
      cleanReviewImageUrl,
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
  uveyeInspectionId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  color: string;
  bodyType: "sedan" | "truck";
  createdAt: Date;
  status: "in_progress";
  damageCount: number;
} {
  const root = response as Record<string, unknown>;
  const v = response.vehicle;
  const make = String(v?.make ?? root.make ?? "—");
  const model = String(v?.model ?? root.model ?? "—");
  const yearRaw = v?.year ?? root.year;
  const yearNum =
    typeof yearRaw === "number"
      ? yearRaw
      : parseInt(String(yearRaw ?? "").replace(/[^\d]/g, "").slice(0, 4), 10) || new Date().getFullYear();
  const vin = String(response.vin ?? root.vin ?? "—");
  const color = String(v?.color ?? root.exteriorColor ?? "—");
  const vehicleLike = v ?? {
    bodyType: root.bodyType,
    vehicleType: root.bodyType,
  };
  const uveyeId = String(response.inspectionId ?? requestedId).trim();
  return {
    id: uveyeId,
    uveyeInspectionId: uveyeId,
    vin,
    make,
    model,
    year: yearNum,
    color,
    bodyType: inferBodyTypeFromVehicle(vehicleLike as { [key: string]: unknown }),
    createdAt: new Date(),
    status: "in_progress",
    damageCount: getCombinedAlerts(response).length,
  };
}
