/**
 * Maps each `CAR_PARTS` name to element `id`(s) in `sedan-unified-with-wheels.svg`.
 * Ids are lowercase, hyphenated (Figma export). Use `defaultSvgPathIdFromPartName` only
 * for parts not listed here.
 */
export const DAMAGE_HIGHLIGHT_FILL = '#EF7070';

/** Undamaged panels stay invisible (matches Figma default). */
export const DAMAGE_PANEL_IDLE_FILL = 'none';

/**
 * Slug from part name: "Trunk/Liftgate" → "trunk-liftgate" (use explicit map for `trunk`).
 */
export function defaultSvgPathIdFromPartName(partName: string): string {
  return partName
    .trim()
    .toLowerCase()
    .replace(/\s*\/\s*/g, '/')
    .split('/')
    .map((s) => s.trim().replace(/\s+/g, '-'))
    .join('-')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Explicit ids where Figma naming differs from the default slug (e.g. `left-qrt-panel`,
 * `front-right-door`, `trunk`).
 */
const EXPLICIT_SVG_IDS: Partial<Record<string, string | string[]>> = {
  'Left Quarter Panel': 'left-qrt-panel',
  'Right Quarter Panel': 'right-qrt-panel',
  'Trunk/Liftgate': 'trunk',
  /** Door labels in Figma: front-left-door / front-right-door */
  'Left Front Door': 'front-left-door',
  'Right Front Door': 'front-right-door',
  'Left Rear Door': 'rear-left-door',
  'Right Rear Door': 'rear-right-door',
  Headlights: ['left-headlight', 'right-headlight'],
  Taillights: ['rear-left-light', 'rear-right-light'],
  /** Figma uses `rear-glass` for rear window */
  'Rear Window': 'rear-glass',
  /**
   * Tread anomalies (depth, FOD, tread wear, groove synthetics) → path `*-tire-tread`.
   * Sidewall / bulges / cuts (not rim-specific) → `<circle id="*-tire-wall">`.
   * Rim / lug detections → `<circle id="*-wheel-rim">`. See `artemisWallImagePartForDetection` in `uveyeApi`.
   */
  'Left Front Tire': 'front-left-tire-tread',
  'Right Front Tire': 'front-right-tire-tread',
  'Left Rear Tire': 'rear-left-tire-tread',
  'Right Rear Tire': 'rear-right-tire-tread',
  'Left Front Tire Wall': 'front-left-tire-wall',
  'Right Front Tire Wall': 'front-right-tire-wall',
  'Left Rear Tire Wall': 'rear-left-tire-wall',
  'Right Rear Tire Wall': 'rear-right-tire-wall',
  'Left Front Wheel Rim': 'front-left-wheel-rim',
  'Right Front Wheel Rim': 'front-right-wheel-rim',
  'Left Rear Wheel Rim': 'rear-left-wheel-rim',
  'Right Rear Wheel Rim': 'rear-right-wheel-rim',
};

export function svgPathIdsForCarPart(partName: string): string[] {
  const explicit = EXPLICIT_SVG_IDS[partName];
  if (explicit !== undefined) {
    return Array.isArray(explicit) ? explicit : [explicit];
  }
  return [defaultSvgPathIdFromPartName(partName)];
}
