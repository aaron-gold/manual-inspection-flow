import { describe, it, expect } from 'vitest';
import {
  ALL_AREAS,
  CAR_PARTS,
  computeWalkState,
  sortPartsByPanelOrder,
} from '../assistedInspectionModel';

describe('computeWalkState', () => {
  const orderedAll = sortPartsByPanelOrder(CAR_PARTS);

  it('empty review + no active part → current null, next = first in walk order', () => {
    const state = computeWalkState(CAR_PARTS, new Set(), null);
    expect(state.currentPart).toBeNull();
    expect(state.nextPart?.name).toBe(orderedAll[0].name);
    expect(state.totalDone).toBe(0);
    expect(state.totalParts).toBe(CAR_PARTS.length);
    expect(state.allDone).toBe(false);
  });

  it('mid-walk → current = active, next = first unreviewed after it in walk order', () => {
    const active = orderedAll[3].name;
    // Mark first three reviewed — active is the 4th, still unreviewed.
    const reviewed = new Set(orderedAll.slice(0, 3).map((p) => p.name));
    const state = computeWalkState(CAR_PARTS, reviewed, active);
    expect(state.currentPart?.name).toBe(active);
    expect(state.nextPart?.name).toBe(orderedAll[4].name);
    expect(state.totalDone).toBe(3);
    expect(state.allDone).toBe(false);
  });

  it('current part already reviewed → next skips to the next unreviewed part', () => {
    const active = orderedAll[1].name;
    const reviewed = new Set([orderedAll[0].name, orderedAll[1].name]);
    const state = computeWalkState(CAR_PARTS, reviewed, active);
    expect(state.currentPart?.name).toBe(active);
    expect(state.nextPart?.name).toBe(orderedAll[2].name);
  });

  it('last part in walk order is active with others unreviewed → next wraps to the first unreviewed', () => {
    const active = orderedAll[orderedAll.length - 1].name;
    // Only the active (last) part is reviewed; everything else is still open.
    const reviewed = new Set([active]);
    const state = computeWalkState(CAR_PARTS, reviewed, active);
    expect(state.currentPart?.name).toBe(active);
    expect(state.nextPart?.name).toBe(orderedAll[0].name);
  });

  it('only the active part remains unreviewed → nextPart is null', () => {
    const active = orderedAll[5].name;
    const reviewed = new Set(orderedAll.filter((p) => p.name !== active).map((p) => p.name));
    const state = computeWalkState(CAR_PARTS, reviewed, active);
    expect(state.currentPart?.name).toBe(active);
    expect(state.nextPart).toBeNull();
    expect(state.allDone).toBe(false);
  });

  it('all parts reviewed → allDone=true, current/next null', () => {
    const reviewed = new Set(CAR_PARTS.map((p) => p.name));
    const state = computeWalkState(CAR_PARTS, reviewed, null);
    expect(state.allDone).toBe(true);
    expect(state.totalDone).toBe(CAR_PARTS.length);
    expect(state.nextPart).toBeNull();
  });

  it('area progress is returned in ALL_AREAS order with correct done/total', () => {
    const reviewed = new Set<string>();
    // Mark every Front part reviewed so that area shows as complete.
    for (const p of CAR_PARTS) if (p.area === 'Front') reviewed.add(p.name);
    const state = computeWalkState(CAR_PARTS, reviewed, null);
    const front = state.areaProgress.find((a) => a.area === 'Front');
    expect(front?.done).toBe(front?.total);
    expect(front?.nextPartInArea).toBeNull();
    // Left is untouched.
    const left = state.areaProgress.find((a) => a.area === 'Left');
    expect(left?.done).toBe(0);
    expect(left?.nextPartInArea).not.toBeNull();
    // Order matches ALL_AREAS order (skipping any empty areas, but CAR_PARTS covers them all).
    const areas = state.areaProgress.map((a) => a.area);
    const expected = ALL_AREAS.filter((a) => CAR_PARTS.some((p) => p.area === a));
    expect(areas).toEqual(expected);
  });

  it('reviewed names that do not exist in parts are ignored', () => {
    const reviewed = new Set(['Not a real part']);
    const state = computeWalkState(CAR_PARTS, reviewed, null);
    expect(state.totalDone).toBe(0);
    expect(state.nextPart?.name).toBe(orderedAll[0].name);
  });

  it('accepts a plain array for reviewedPartNames', () => {
    const active = orderedAll[0].name;
    const state = computeWalkState(CAR_PARTS, [active], active);
    expect(state.totalDone).toBe(1);
    expect(state.currentPart?.name).toBe(active);
    expect(state.nextPart?.name).toBe(orderedAll[1].name);
  });

  it('unknown activePartName is ignored (treated as no active part)', () => {
    const state = computeWalkState(CAR_PARTS, new Set(), 'Never heard of it');
    expect(state.currentPart).toBeNull();
    expect(state.nextPart?.name).toBe(orderedAll[0].name);
  });

  describe('onlyDamagedNext option', () => {
    it('skips undamaged parts when picking nextPart', () => {
      // Active = first part in walk order. Damaged = some later part. Everything between should be skipped.
      const active = orderedAll[0].name;
      const damaged = orderedAll[5].name;
      const state = computeWalkState(CAR_PARTS, new Set(), active, {
        onlyDamagedNext: true,
        damagedPartNames: new Set([active, damaged]),
      });
      expect(state.currentPart?.name).toBe(active);
      expect(state.nextPart?.name).toBe(damaged);
    });

    it('nextPart is null when no OTHER damaged part is unreviewed', () => {
      const active = orderedAll[0].name;
      const state = computeWalkState(CAR_PARTS, new Set(), active, {
        onlyDamagedNext: true,
        damagedPartNames: new Set([active]),
      });
      expect(state.currentPart?.name).toBe(active);
      expect(state.nextPart).toBeNull();
    });

    it('nextPartInArea prefers damaged parts, falls back to any unreviewed', () => {
      const damagedLeftPart = orderedAll.find((p) => p.area === 'Left')!.name;
      const state = computeWalkState(CAR_PARTS, new Set(), null, {
        onlyDamagedNext: true,
        damagedPartNames: new Set([damagedLeftPart]),
      });
      const left = state.areaProgress.find((a) => a.area === 'Left');
      // Left has a damaged part → strict pass picks it over any undamaged part in the area.
      expect(left?.nextPartInArea?.name).toBe(damagedLeftPart);
      // Front has no damaged parts → fallback returns the first unreviewed Front part so the
      // zone still has a valid "next" suggestion rather than going blank mid-inspection.
      const front = state.areaProgress.find((a) => a.area === 'Front');
      expect(front?.nextPartInArea).not.toBeNull();
      expect(front?.nextPartInArea?.area).toBe('Front');
    });

    it('falls back to any unreviewed part when damagedPartNames is omitted', () => {
      // onlyDamagedNext=true without damagedPartNames must not crash — just behave like onlyDamagedNext=false.
      const state = computeWalkState(CAR_PARTS, new Set(), null, { onlyDamagedNext: true });
      expect(state.nextPart?.name).toBe(orderedAll[0].name);
    });

    it('falls back to next unreviewed part when every damaged part is reviewed', () => {
      // Current = some damaged part already reviewed. Damaged set contains only parts that are
      // all reviewed. The strict pass finds nothing → fallback returns the next unreviewed part.
      const damaged = orderedAll.slice(0, 3).map((p) => p.name);
      const reviewed = new Set(damaged); // every damaged part is reviewed
      const state = computeWalkState(CAR_PARTS, reviewed, damaged[0], {
        onlyDamagedNext: true,
        damagedPartNames: new Set(damaged),
      });
      expect(state.nextPart).not.toBeNull();
      // The fallback should pick some unreviewed part; it must not be one of the reviewed damaged ones.
      expect(damaged.includes(state.nextPart!.name)).toBe(false);
      expect(reviewed.has(state.nextPart!.name)).toBe(false);
    });
  });
});
