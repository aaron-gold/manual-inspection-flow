/**
 * Shared car-part list and damage shape for inspection UI (vehicle map, unified diagram, lists).
 */

export type Area = 'Front' | 'Left' | 'Top' | 'Right' | 'Rear' | 'Undercarriage' | 'Interior';

export interface CarPart {
  name: string;
  area: Area;
  cameras: string[];
  bestCamera: string;
  bestFrameNum: number;
}

export interface Damage {
  id: number;
  part: string;
  type: string;
  severity: string;
  ai: boolean;
  x: number;
  y: number;
  frameId: string;
  confirmed?: boolean | null;
  portalUrl?: string;
  atlasCameraId?: string;
  atlasFrameIndex?: number;
  isDuplicate?: boolean;
  flagged?: boolean;
  damageName?: string;
  reportId?: string;
  /** Which UVeye pipeline produced this row (for CSV/PDF reports). */
  inspectionModule?: 'legacy' | 'atlas' | 'helios' | 'artemis';
  /** Physical size from Atlas when present (mm). */
  sizeDiagonalMm?: number;
  sizeWidthMm?: number;
  sizeHeightMm?: number;
  /** Unannotated full-frame URL when the review image is a cropped overlay (Atlas / Artemis). */
  cleanReviewImageUrl?: string;
  /** Stable id for inspector camera rows — excluded from API merge remapping. */
  captureId?: string;
  /** Evidence image from camera / gallery (same capture as `CapturedPhotoEntry` when linked). */
  captureDataUrl?: string;
  captureImageUrl?: string;
}

/** Internal frame ids (manual capture, tests) that must not drive UVeye frame lists. */
export function isSyntheticDamageFrameId(frameId: string | undefined): boolean {
  return typeof frameId === 'string' && frameId.startsWith('__');
}

export const CAR_PARTS: CarPart[] = [
  { name: 'Front Bumper', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Hood', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Grille', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Headlights', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Front Tire', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Front Tire Wall', area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Fender', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Front Door', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rear Door', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Quarter Panel', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Mirror', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Window', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Bed Side', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rocker', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rear Tire', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rear Tire Wall', area: 'Left', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Windshield', area: 'Top', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Roof', area: 'Top', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Rear Window', area: 'Top', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Drip Rail', area: 'Top', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Drip Rail', area: 'Top', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Fender', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Front Door', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rear Door', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Quarter Panel', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Mirror', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Window', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Bed Side', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rocker', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Front Tire', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Front Tire Wall', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rear Tire', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rear Tire Wall', area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Trunk/Liftgate', area: 'Rear', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Tailgate', area: 'Rear', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Rear Bumper', area: 'Rear', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Taillights', area: 'Rear', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Bed/Cargo', area: 'Rear', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Undercarriage', area: 'Undercarriage', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Interior', area: 'Interior', cameras: [], bestCamera: '', bestFrameNum: 0 },
];

/** Main panel order in the vehicle map (matches physical walk-around: … → rear → right side → under → interior). */
export const AREAS: Area[] = ['Front', 'Left', 'Top', 'Rear', 'Right'];
export const ALL_AREAS: Area[] = ['Front', 'Left', 'Top', 'Rear', 'Right', 'Undercarriage', 'Interior'];

/**
 * Walk order within one area:
 * - **Left:** fender → mirror → doors & windows → quarter (fuel cap maps here) → rear left tire/wall → bed → rocker.
 *   (`Left Front Tire` / wall live under **Front** in `CAR_PARTS` — they sort in the Front section.)
 * - **Right (counterclockwise):** quarter → rear tire/wall → rear door → front door → window → front tire/wall → mirror → fender → bed → rocker.
 */
const PART_WALK_RANK: Record<string, number> = {
  // Front — bumper / hood / lights, then left front tires (right front tires are under Right area)
  'Front Bumper': 10,
  Hood: 20,
  Grille: 30,
  Headlights: 40,
  'Left Front Tire': 100,
  'Left Front Tire Wall': 101,
  // Left — forward walk on driver side (US LHD mental model)
  'Left Fender': 200,
  'Left Mirror': 220,
  'Left Front Door': 300,
  'Left Rear Door': 310,
  'Left Window': 320,
  'Left Quarter Panel': 400,
  'Left Rear Tire': 500,
  'Left Rear Tire Wall': 501,
  'Left Bed Side': 510,
  'Left Rocker': 520,
  // Right — counterclockwise from quarter toward front
  'Right Quarter Panel': 200,
  'Right Rear Tire': 210,
  'Right Rear Tire Wall': 211,
  'Right Rear Door': 300,
  'Right Front Door': 310,
  'Right Window': 320,
  'Right Front Tire': 400,
  'Right Front Tire Wall': 401,
  'Right Mirror': 410,
  'Right Fender': 420,
  'Right Bed Side': 500,
  'Right Rocker': 510,
  // Top
  Windshield: 100,
  Roof: 110,
  'Rear Window': 120,
  'Left Drip Rail': 130,
  'Right Drip Rail': 140,
  // Rear
  'Trunk/Liftgate': 100,
  Tailgate: 110,
  'Rear Bumper': 120,
  Taillights: 130,
  'Bed/Cargo': 140,
  Undercarriage: 100,
  Interior: 100,
};

/** Sort key for a known car part name (same logic as `sortPartsByPanelOrder`). */
export function partWalkRankForPartName(partName: string): number {
  if (PART_WALK_RANK[partName] !== undefined) return PART_WALK_RANK[partName];
  const i = CAR_PARTS.findIndex((p) => p.name === partName);
  return i === -1 ? 5000 : 500 + i;
}

/** Order parts for navigation, sidebar lists, and damage report within an area. */
export function sortPartsByPanelOrder(parts: CarPart[]): CarPart[] {
  return [...parts].sort((a, b) => {
    const ai = ALL_AREAS.indexOf(a.area);
    const bi = ALL_AREAS.indexOf(b.area);
    if (ai !== bi) return ai - bi;
    const ra = partWalkRankForPartName(a.name);
    const rb = partWalkRankForPartName(b.name);
    if (ra !== rb) return ra - rb;
    return a.name.localeCompare(b.name);
  });
}

/** Persisted rows may still use the old "… Wheel" labels after we renamed to "… Tire". */
const LEGACY_WHEEL_TO_TIRE: Record<string, string> = {
  'left front wheel': 'left front tire',
  'right front wheel': 'right front tire',
  'left rear wheel': 'left rear tire',
  'right rear wheel': 'right rear tire',
};

function canonicalPartKey(part: string): string {
  const t = part.trim().toLowerCase();
  return LEGACY_WHEEL_TO_TIRE[t] ?? t;
}

export function partNameMatches(uiPart: string, apiPart: string): boolean {
  return canonicalPartKey(uiPart) === canonicalPartKey(apiPart);
}

/**
 * Area label for exports: mirrors include side — "Left — Mirror" / "Right — Mirror".
 */
export function areaLabelForDamageReport(partName: string): string {
  const p = CAR_PARTS.find((cp) => partNameMatches(cp.name, partName));
  if (!p) return '';
  if (p.name === 'Left Mirror') return 'Left — Mirror';
  if (p.name === 'Right Mirror') return 'Right — Mirror';
  return p.area;
}
