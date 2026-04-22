import React, { useLayoutEffect, useRef } from 'react';
import sedanUnifiedSvgRaw from '@/assets/sedan-unified.svg?raw';
import { CAR_PARTS, partNameMatches, type Damage } from '@/lib/assistedInspectionModel';
import {
  DAMAGE_HIGHLIGHT_FILL,
  DAMAGE_PANEL_IDLE_FILL,
  svgPathIdsForCarPart,
} from '@/lib/sedanUnifiedPathIds';

/**
 * Walk-state overlay colours.
 *
 * The Figma export draws the car from 4–5 angles in one SVG, so highlighting a part paints it
 * in every view. That's fine — it matches how damage red already behaves, and the user wanted
 * the fill back because the outline alone was too faint on the smaller desktop sidebar diagram.
 * We still skip circle elements (tire-wall hit targets) to avoid the floating-blue-dot look.
 */
const WALK_STATE_CURRENT_FILL = '#3B82F6'; // blue-500 — light fill on the current part
const WALK_STATE_CURRENT_STROKE = '#1D4ED8'; // blue-700 — outline on top of the fill
const WALK_STATE_NEXT_STROKE = '#2563EB'; // blue-600 — dashed outline on the next part

type SedanUnifiedDiagramProps = {
  damages: Damage[];
  className?: string;
  /** When set, highlighted (damaged) panels are clickable and select that part in the inspection UI. */
  onPartClick?: (partName: string) => void;
  /** Walk-state overlay — current = thin solid blue outline, next = thin dashed outline. */
  currentPartName?: string | null;
  nextPartName?: string | null;
};

/**
 * Figma often exports duplicate angles as `hood`, `hood_2`, `hood_3` — highlight all of them.
 *
 * Some panels (e.g. `front-bumper_3`) are themselves `<g>` groups that contain unnamed `<path>`
 * children. Fill inheritance from a group to its children works in theory but isn't reliable
 * across all SVG renderers when the fill is set via `setAttribute`, so we recursively pick up
 * descendants of any matched group and apply the fill to each leaf directly.
 */
function elementsForBasePanelId(svg: SVGSVGElement, baseId: string): SVGElement[] {
  const out: SVGElement[] = [];
  const seen = new Set<SVGElement>();
  const push = (node: SVGElement) => {
    if (seen.has(node)) return;
    seen.add(node);
    out.push(node);
  };
  for (const node of svg.querySelectorAll<SVGElement>('[id]')) {
    const id = node.id || node.getAttribute('id') || '';
    if (!id || id.startsWith('pattern') || id.startsWith('image')) continue;
    if (id === baseId || id.startsWith(`${baseId}_`)) {
      push(node);
      // For `<g>` containers, also include every descendant (named or unnamed) so the fill is
      // applied directly to each visible path/circle without relying on SVG attribute cascade.
      if (node.tagName.toLowerCase() === 'g') {
        for (const child of node.querySelectorAll<SVGElement>('*')) {
          push(child);
        }
      }
    }
  }
  return out;
}

/** First CAR_PARTS name among a group that shares one SVG `id` (e.g. `hood` + `hood_2`). */
function firstPartNameInListOrder(partNames: string[]): string {
  for (const p of CAR_PARTS) {
    if (partNames.includes(p.name)) return p.name;
  }
  return partNames[0] ?? '';
}

/**
 * Single inline SVG from Figma: sets `fill` on panel groups/paths per `CAR_PARTS` when damage matches.
 * Parts that share the same base `id` are grouped so later passes do not clear the highlight.
 * Tire tread paths and tire-wall circles use different ids (`*-tire-tread` vs `*-tire-wall`).
 */
export function SedanUnifiedDiagram({
  damages,
  className,
  onPartClick,
  currentPartName,
  nextPartName,
}: SedanUnifiedDiagramProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const svg = host.querySelector('svg');
    if (!svg || !(svg instanceof SVGSVGElement)) return;

    const cleanups: (() => void)[] = [];

    const baseIdToPartNames = new Map<string, string[]>();
    for (const p of CAR_PARTS) {
      for (const bid of svgPathIdsForCarPart(p.name)) {
        if (!baseIdToPartNames.has(bid)) baseIdToPartNames.set(bid, []);
        const list = baseIdToPartNames.get(bid)!;
        if (!list.includes(p.name)) list.push(p.name);
      }
    }

    const damageMatchesAnyPart = (partNames: string[]) =>
      damages.some((d) => partNames.some((pn) => partNameMatches(pn, d.part)));

    for (const [baseId, partNames] of baseIdToPartNames) {
      const hasDamage = damageMatchesAnyPart(partNames);
      const isCurrent = !!currentPartName && partNames.includes(currentPartName);
      const isNext = !!nextPartName && partNames.includes(nextPartName);

      // Damage red still wins over walk-state blue.
      const fill = hasDamage
        ? DAMAGE_HIGHLIGHT_FILL
        : isCurrent
          ? WALK_STATE_CURRENT_FILL
          : onPartClick
            ? 'transparent'
            : DAMAGE_PANEL_IDLE_FILL;

      for (const el of elementsForBasePanelId(svg, baseId)) {
        const isCircle = el.tagName.toLowerCase() === 'circle';

        // Always reset stroke state from prior renders so the overlay doesn't linger.
        el.removeAttribute('stroke');
        el.removeAttribute('stroke-width');
        el.removeAttribute('stroke-dasharray');

        if (hasDamage) {
          el.setAttribute('fill', fill);
          if (isCircle) el.setAttribute('fill-opacity', '1');
        } else if (isCurrent) {
          // Solid blue fill on the current part — same opacity rules as damage red so it's
          // unmistakable on the raster background. Circles (tire-wall hit targets) get the
          // same treatment as damage red on a damaged tire wall: fully opaque so the wheel
          // position lights up blue instead of staying invisible.
          el.setAttribute('fill', fill);
          el.setAttribute('fill-opacity', '1');
        } else if (isCircle) {
          el.setAttribute('fill', 'black');
          el.setAttribute('fill-opacity', '0.01');
        } else {
          el.setAttribute('fill', fill);
        }

        // Current-part outline is applied regardless of damage OR shape — a damaged+current
        // panel stays red but picks up a blue stroke so the inspector still sees "you are
        // here". On a circle this manifests as a blue ring around the wheel.
        if (isCurrent) {
          el.setAttribute('stroke', WALK_STATE_CURRENT_STROKE);
          el.setAttribute('stroke-width', '2.5');
        } else if (!hasDamage && isNext) {
          // Next part: dashed outline only. Works on both paths (panels) and circles (tire
          // walls — dashed ring at the wheel position).
          el.setAttribute('stroke', WALK_STATE_NEXT_STROKE);
          el.setAttribute('stroke-width', '1.75');
          el.setAttribute('stroke-dasharray', '3 3');
        }

        /** Only damaged (highlighted) panels select the part — idle panels stay inert. */
        if (onPartClick && hasDamage) {
          el.style.cursor = 'pointer';
          const handler = (e: MouseEvent) => {
            e.stopPropagation();
            onPartClick(firstPartNameInListOrder(partNames));
          };
          el.addEventListener('click', handler);
          cleanups.push(() => {
            el.removeEventListener('click', handler);
            el.style.cursor = '';
          });
        }
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, [damages, onPartClick, currentPartName, nextPartName]);

  return (
    <div
      ref={hostRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: sedanUnifiedSvgRaw }}
      aria-hidden
    />
  );
}
