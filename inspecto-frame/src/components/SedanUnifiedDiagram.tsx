import React, { useLayoutEffect, useRef } from 'react';
import sedanUnifiedSvgRaw from '@/assets/sedan-unified.svg?raw';
import { CAR_PARTS, partNameMatches, type Damage } from '@/lib/assistedInspectionModel';
import {
  DAMAGE_HIGHLIGHT_FILL,
  DAMAGE_PANEL_IDLE_FILL,
  svgPathIdsForCarPart,
} from '@/lib/sedanUnifiedPathIds';

type SedanUnifiedDiagramProps = {
  damages: Damage[];
  className?: string;
  /** When set, highlighted (damaged) panels are clickable and select that part in the inspection UI. */
  onPartClick?: (partName: string) => void;
};

/** Figma often exports duplicate angles as `hood`, `hood_2`, `hood_3` — highlight all of them. */
function elementsForBasePanelId(svg: SVGSVGElement, baseId: string): SVGElement[] {
  const out: SVGElement[] = [];
  const seen = new Set<SVGElement>();
  for (const node of svg.querySelectorAll<SVGElement>('[id]')) {
    const id = node.id || node.getAttribute('id') || '';
    if (!id || id.startsWith('pattern') || id.startsWith('image')) continue;
    if (id === baseId || id.startsWith(`${baseId}_`)) {
      if (!seen.has(node)) {
        seen.add(node);
        out.push(node);
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
export function SedanUnifiedDiagram({ damages, className, onPartClick }: SedanUnifiedDiagramProps) {
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
      const fill = hasDamage
        ? DAMAGE_HIGHLIGHT_FILL
        : onPartClick
          ? 'transparent'
          : DAMAGE_PANEL_IDLE_FILL;
      for (const el of elementsForBasePanelId(svg, baseId)) {
        const isCircle = el.tagName.toLowerCase() === 'circle';
        if (hasDamage) {
          el.setAttribute('fill', fill);
          /** Wall hit-target circles export with `fill-opacity="0.01"` — force opaque red when damaged. */
          if (isCircle) el.setAttribute('fill-opacity', '1');
        } else if (isCircle) {
          el.setAttribute('fill', onPartClick ? 'black' : 'black');
          el.setAttribute('fill-opacity', '0.01');
        } else {
          el.setAttribute('fill', fill);
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
  }, [damages, onPartClick]);

  return (
    <div
      ref={hostRef}
      className={className}
      dangerouslySetInnerHTML={{ __html: sedanUnifiedSvgRaw }}
      aria-hidden
    />
  );
}
