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

export const AREAS: Area[] = ['Front', 'Left', 'Top', 'Right', 'Rear'];
export const ALL_AREAS: Area[] = ['Front', 'Left', 'Top', 'Right', 'Rear', 'Undercarriage', 'Interior'];

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
