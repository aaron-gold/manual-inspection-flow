import React, { useState } from 'react';
import { MapPin, ArrowRight, CheckCircle2, ChevronDown } from 'lucide-react';
import type { Area, CarPart, WalkState } from '@/lib/assistedInspectionModel';
import { cn } from '@/lib/utils';

/**
 * Shared "you are here / next / what's left" widget.
 *
 * Renders in three styles from the same walk-state:
 *  - `<InspectionOrientation.DesktopStrip />` — horizontal strip for the desktop header (shrinks
 *    gracefully, no new row required; sits next to the existing progress bar).
 *  - `<InspectionOrientation.MobileCompact />` — single line for the existing mobile header's
 *    progress row. Never overlays the image; zero extra vertical space.
 *  - `<InspectionOrientation.ZoneProgress />` — full per-area breakdown, intended for the vehicle
 *    map sheet. Shows "X/Y" per zone and surfaces the next unreviewed part in each zone.
 *
 * The component is entirely derived from `WalkState` so it stays in sync with `reviewedParts` /
 * `activePart` with no extra wiring. Clicking any zone or "Jump to next" calls
 * `onSelectPart(partName)` so callers can hook it into the existing `selectPart` handler — this
 * keeps the orientation advisory (hybrid model), not prescriptive.
 */

const AREA_COPY: Record<Area, { short: string; full: string }> = {
  Front: { short: 'Front', full: 'Front' },
  Left: { short: 'Left', full: 'Left side' },
  Top: { short: 'Top', full: 'Top / glass' },
  Right: { short: 'Right', full: 'Right side' },
  Rear: { short: 'Rear', full: 'Rear' },
  Undercarriage: { short: 'Under', full: 'Undercarriage' },
  Interior: { short: 'Interior', full: 'Interior' },
};

function partShortLabel(part: CarPart | null): string {
  if (!part) return '—';
  return part.name;
}

function progressPct(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}

type BaseProps = {
  state: WalkState;
  /** Flashes a given area (brief glow) when it's just been completed; callers drive the value. */
  recentlyCompletedArea?: Area | null;
  onSelectPart?: (partName: string) => void;
  onSelectArea?: (area: Area) => void;
  className?: string;
  /**
   * Override the "N left" count. Useful when "progress" should be measured by damages
   * remaining (pending detections) rather than parts remaining. When provided, the
   * "Walk complete" state also fires off this count reaching zero instead of the
   * parts-based `state.allDone`.
   */
  remainingCount?: number;
  /** Label suffix for the remaining count; defaults to "left". Example: "34 to review". */
  remainingLabel?: string;
};

/**
 * Desktop strip: one compact row, same shape as the mobile compact line.
 *
 * Replaces the older "X of N parts + linear progress bar" block. The old progress bar is gone
 * on purpose — the sidebar's ZoneProgress is now the single source of progress info (with an
 * overall bar when collapsed). The strip carries just the three things the header needs:
 * "You", "Next", and "N left".
 */
function DesktopStrip({
  state,
  onSelectPart,
  className,
  remainingCount,
  remainingLabel = 'left',
}: BaseProps) {
  const { currentPart, nextPart, totalDone, totalParts, allDone: walkAllDone } = state;
  const partsRemaining = Math.max(0, totalParts - totalDone);
  const remaining = remainingCount ?? partsRemaining;
  // When the caller supplies `remainingCount` (e.g. damages pending review), drive the
  // "complete" state off that count — otherwise a user could see "Walk complete" while
  // damages are still pending approve/reject.
  const allDone = remainingCount !== undefined ? remaining === 0 : walkAllDone;
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 text-xs',
        className,
      )}
      data-testid="orientation-desktop-strip"
    >
      <span className="inline-flex max-w-[16rem] items-center gap-1 rounded-md bg-muted/50 px-2 py-1 text-foreground min-w-0">
        <MapPin size={12} aria-hidden className="shrink-0 text-primary" />
        <span className="shrink-0 text-muted-foreground">You:</span>
        <span className="truncate font-semibold">
          {currentPart ? partShortLabel(currentPart) : allDone ? 'All done' : 'Not started'}
        </span>
      </span>
      {!allDone && nextPart && (
        <button
          type="button"
          onClick={() => onSelectPart?.(nextPart.name)}
          className="inline-flex max-w-[18rem] items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 active:scale-[0.98] min-w-0"
          title="Jump to the next damaged unreviewed part"
        >
          <span className="shrink-0 opacity-80">Next:</span>
          <span className="truncate">{partShortLabel(nextPart)}</span>
          <ArrowRight size={13} aria-hidden className="shrink-0" />
        </button>
      )}
      {allDone && (
        <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/50 bg-emerald-500/10 px-2 py-1 font-medium text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 size={12} aria-hidden /> Walk complete
        </span>
      )}
      <span className="shrink-0 tabular-nums text-muted-foreground">
        {allDone ? 'complete' : `${remaining} ${remainingLabel}`}
      </span>
    </div>
  );
}

function MobileCompact({
  state,
  onSelectPart,
  className,
  remainingCount,
  remainingLabel = 'left',
}: BaseProps) {
  const { currentPart, nextPart, totalDone, totalParts, allDone: walkAllDone } = state;
  const partsRemaining = Math.max(0, totalParts - totalDone);
  const remaining = remainingCount ?? partsRemaining;
  const allDone = remainingCount !== undefined ? remaining === 0 : walkAllDone;
  void totalParts; // destructured for readability; display logic uses `remaining` directly.
  return (
    <div
      className={cn('flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]', className)}
      data-testid="orientation-mobile-compact"
    >
      <span className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 font-medium text-foreground min-w-0 max-w-full">
        <MapPin size={10} aria-hidden className="text-primary shrink-0" />
        <span className="text-muted-foreground shrink-0">You:</span>
        <span className="truncate font-semibold">
          {currentPart ? currentPart.name : allDone ? 'All done' : 'Not started'}
        </span>
      </span>
      {!allDone && nextPart && (
        <button
          type="button"
          onClick={() => onSelectPart?.(nextPart.name)}
          className="inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 font-semibold text-primary-foreground shadow-sm active:scale-[0.98] min-w-0 max-w-full"
          title="Jump to the next damaged unreviewed part"
        >
          <span className="shrink-0 opacity-80">Next:</span>
          <span className="truncate">{nextPart.name}</span>
          <ArrowRight size={11} aria-hidden className="shrink-0" />
        </button>
      )}
      <span className="tabular-nums text-muted-foreground">
        {allDone ? 'complete' : `${remaining} ${remainingLabel}`}
      </span>
    </div>
  );
}

function ZoneProgress({
  state,
  recentlyCompletedArea,
  onSelectPart,
  onSelectArea,
  className,
  defaultCollapsed = false,
  pendingDamagesByArea,
}: BaseProps & {
  defaultCollapsed?: boolean;
  /**
   * Optional map of Area → count of damages still needing approve/reject. When provided, each
   * zone shows a red "N to review" pill — the inspector can see at a glance which zone still
   * has unfinished detection work even if the part-review checkboxes are all ticked.
   */
  pendingDamagesByArea?: Partial<Record<Area, number>>;
}) {
  const { areaProgress, totalDone, totalParts } = state;
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid="orientation-zone-progress">
      <button
        type="button"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
        className="flex items-center justify-between gap-2 -mx-1 rounded-md px-1 py-1 hover:bg-accent transition-colors text-left"
      >
        <span className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <ChevronDown
            size={12}
            aria-hidden
            className={cn('transition-transform', collapsed && '-rotate-90')}
          />
          Progress by zone
        </span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {totalDone}/{totalParts} · {progressPct(totalDone, totalParts)}%
        </span>
      </button>
      {collapsed && (
        <div className="h-1 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
          <div
            className={cn(
              'h-full rounded-full transition-all',
              totalDone === totalParts && totalParts > 0 ? 'bg-emerald-500' : 'bg-primary',
            )}
            style={{ width: `${progressPct(totalDone, totalParts)}%` }}
          />
        </div>
      )}
      <ul className={cn('flex flex-col gap-1', collapsed && 'hidden')}>
        {areaProgress.map((ap) => {
          const done = ap.done === ap.total;
          const started = ap.done > 0;
          const flash = recentlyCompletedArea === ap.area;
          const next = ap.nextPartInArea;
          const pendingDamages = pendingDamagesByArea?.[ap.area] ?? 0;
          return (
            <li key={ap.area}>
              <button
                type="button"
                onClick={() => {
                  if (next && onSelectPart) onSelectPart(next.name);
                  else onSelectArea?.(ap.area);
                }}
                className={cn(
                  'flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-all',
                  pendingDamages > 0
                    ? 'border-destructive/40 bg-destructive/5 text-foreground'
                    : done
                      ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300'
                      : started
                        ? 'border-primary/30 bg-primary/5 text-foreground'
                        : 'border-border bg-muted/20 text-foreground hover:bg-accent',
                  flash && 'ring-2 ring-emerald-400 animate-pulse',
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="font-semibold">{AREA_COPY[ap.area].full}</span>
                  {done ? (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-medium">
                      <CheckCircle2 size={11} aria-hidden /> done
                    </span>
                  ) : next ? (
                    <span className="truncate text-[10px] text-muted-foreground">
                      next: {next.name}
                    </span>
                  ) : null}
                </span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {/* Pending-damage pill — drawn alongside the parts count so "1/9" with
                      3 damages pending never looks "almost done". */}
                  {pendingDamages > 0 && (
                    <span
                      className="inline-flex items-center rounded-full bg-destructive px-1.5 py-0.5 text-[9px] font-bold text-background ring-2 ring-destructive/25 animate-pulse"
                      title={`${pendingDamages} damage${pendingDamages !== 1 ? 's' : ''} still to review in ${AREA_COPY[ap.area].full}`}
                    >
                      {pendingDamages} to review
                    </span>
                  )}
                  <span className="tabular-nums font-medium">
                    {ap.done}/{ap.total}
                  </span>
                </span>
              </button>
              <div className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    done ? 'bg-emerald-500' : 'bg-primary',
                  )}
                  style={{ width: `${progressPct(ap.done, ap.total)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export const InspectionOrientation = {
  DesktopStrip,
  MobileCompact,
  ZoneProgress,
};

export default InspectionOrientation;
