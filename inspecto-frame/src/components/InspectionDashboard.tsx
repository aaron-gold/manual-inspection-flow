import React, { useMemo, useState } from 'react';
import {
  Car,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Download,
  Loader2,
  Table2,
  Trash2,
  BarChart3,
  Layers,
} from 'lucide-react';
import { damageInspectionSummaryCounts } from '@/lib/damageReportCsv';
import type { Damage } from '@/lib/assistedInspectionModel';
import { formatDurationSeconds, inspectionHasManualDamage } from '@/lib/inspectionTiming';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';

export type BodyType = 'sedan' | 'truck';

export interface InspectionRecord {
  /** Stable key (UVeye inspection id in current app). */
  id: string;
  /** Same as `id`; kept for clarity in exports. */
  uveyeInspectionId: string;
  vin: string;
  make: string;
  model: string;
  year: number;
  color: string;
  bodyType: BodyType;
  createdAt: Date;
  status: 'in_progress' | 'completed';
  damageCount: number;
  /** First qualifying in-app action (Start inspection, click, or part select). */
  timerStartedAt?: Date;
  /** When inspector marked complete in this browser. */
  completedAt?: Date;
  /** Seconds from `timerStartedAt` to `completedAt`; unset until completed. */
  durationSeconds?: number;
  /** Fleet / UVeye vehicle key when the API provides `uniqueId` (or similar) on the vehicle object. */
  vehicleUniqueId?: string;
  /** License plate from the UVeye payload (may be empty for some sites). */
  licensePlate?: string;
  /** Two-letter US state abbreviation that goes with the plate (e.g. "FL"). */
  licensePlateState?: string;
}

interface Props {
  inspections: InspectionRecord[];
  reviewById: Record<string, Record<string, unknown>>;
  /** Shown on CSV; not used for login. */
  inspectorName: string;
  onInspectorNameChange: (name: string) => void;
  onSelect: (id: string) => void;
  onRetrieveFromApi: (inspectionId: string) => Promise<void>;
  /** ZIP with daily-activity.csv + captured-photos/ */
  onExportDailyPack: () => Promise<void>;
  /** Show in-app table preview of the same CSV columns (no download). */
  onPreviewDailyPack?: () => void;
  isRetrieving?: boolean;
  isExporting?: boolean;
  retrieveError?: string | null;
  exportError?: string | null;
  /** Opens a confirmation flow (parent) to erase all locally stored inspections and related data. */
  onRequestClearLocalData?: () => void;
  /**
   * Opens a separate confirmation flow that wipes the IndexedDB database itself plus the
   * in-memory image cache and reloads the page. Use when the soft "Clear local data" isn't
   * enough — e.g. troubleshooting or starting completely fresh.
   */
  onRequestHardReset?: () => void;
}

export default function InspectionDashboard({
  inspections,
  reviewById,
  inspectorName,
  onInspectorNameChange,
  onSelect,
  onRetrieveFromApi,
  onExportDailyPack,
  onPreviewDailyPack,
  isRetrieving = false,
  isExporting = false,
  retrieveError = null,
  exportError = null,
  onRequestClearLocalData,
  onRequestHardReset,
}: Props) {
  const [inspectionId, setInspectionId] = useState('');
  const [mainTab, setMainTab] = useState<'inspections' | 'analytics'>('inspections');
  const inProgress = inspections.filter(i => i.status === 'in_progress');
  const completed = inspections.filter(i => i.status === 'completed');

  const portfolio = useMemo(() => {
    let totalRows = 0;
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    let manualRows = 0;
    let approvedAi = 0;
    let inspectionsWithManual = 0;
    let completedWithDuration = 0;
    let sumDurationSec = 0;

    for (const ins of inspections) {
      const raw = reviewById[ins.id]?.damages as Damage[] | undefined;
      if (!raw?.length) continue;
      const c = damageInspectionSummaryCounts(raw);
      totalRows += c.totalDamages;
      approved += c.approved;
      rejected += c.rejected;
      pending += c.pending;
      manualRows += c.manualRows;
      approvedAi += c.approvedAi;
      if (inspectionHasManualDamage(raw)) inspectionsWithManual += 1;
      if (ins.status === 'completed' && typeof ins.durationSeconds === 'number') {
        completedWithDuration += 1;
        sumDurationSec += ins.durationSeconds;
      }
    }

    const precisionPctStr =
      totalRows > 0 ? `${Math.round((approved / totalRows) * 1000) / 10}%` : '—';
    const recallDenom = approvedAi + manualRows;
    const recallPctStr =
      manualRows === 0
        ? totalRows === 0
          ? '—'
          : '100%'
        : recallDenom > 0
          ? `${Math.round((approvedAi / recallDenom) * 1000) / 10}%`
          : '—';
    const completedN = inspections.filter((i) => i.status === 'completed').length;
    const avgDurationStr =
      completedWithDuration > 0
        ? formatDurationSeconds(sumDurationSec / completedWithDuration)
        : '—';

    return {
      inspectionCount: inspections.length,
      totalRows,
      approved,
      rejected,
      pending,
      manualRows,
      precisionPctStr,
      recallPctStr,
      inspectionsWithManual,
      completedCount: completedN,
      avgDurationStr,
    };
  }, [inspections, reviewById]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectionId.trim() || isRetrieving) return;
    await onRetrieveFromApi(inspectionId);
  };

  return (
    <div className="h-full bg-muted/30 overflow-auto">
      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Vehicle Inspections</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {inspections.length} inspection{inspections.length !== 1 ? 's' : ''} retrieved
            </p>
          </div>
          <div className="flex flex-col items-stretch sm:items-end gap-2 shrink-0 w-full sm:w-auto">
            <div className="flex flex-wrap items-center gap-2 justify-end">
              {onPreviewDailyPack && (
                <button
                  type="button"
                  onClick={() => onPreviewDailyPack()}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors"
                >
                  <Table2 size={16} />
                  Preview activity CSV
                </button>
              )}
              <button
                type="button"
                onClick={() => void onExportDailyPack()}
                disabled={isExporting}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-border bg-card text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {isExporting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Preparing download…
                  </>
                ) : (
                  <>
                    <Download size={16} />
                    Download full pack (CSV + photos)
                  </>
                )}
              </button>
            </div>
            {onRequestClearLocalData && (
              <button
                type="button"
                onClick={onRequestClearLocalData}
                title="Remove every inspection and saved data from this browser on this device"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive/40 bg-card text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors w-full sm:w-auto"
              >
                <Trash2 size={16} />
                Clear local data…
              </button>
            )}
            {onRequestHardReset && (
              <button
                type="button"
                onClick={onRequestHardReset}
                title="Wipe IndexedDB + cached images and reload — every next inspection pull will be fresh"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-destructive bg-destructive/5 text-destructive text-sm font-semibold hover:bg-destructive/15 transition-colors w-full sm:w-auto"
              >
                <Trash2 size={16} />
                Hard reset…
              </button>
            )}
          </div>
        </div>
        {exportError && (
          <p className="mb-6 text-sm text-destructive" role="alert">
            {exportError}
          </p>
        )}

        <div className="mb-6 flex gap-1 rounded-xl border border-border bg-muted/40 p-1">
          <button
            type="button"
            onClick={() => setMainTab('inspections')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-5 ${
              mainTab === 'inspections'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Car size={16} className="shrink-0" aria-hidden />
            Inspections
          </button>
          <button
            type="button"
            onClick={() => setMainTab('analytics')}
            className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none sm:px-5 ${
              mainTab === 'analytics'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <BarChart3 size={16} className="shrink-0" aria-hidden />
            Analytics
          </button>
        </div>

        {mainTab === 'analytics' ? (
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-foreground">Overall analytics</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                All inspections stored in this browser ({portfolio.inspectionCount} total). Clearing local data
                resets this view.
              </p>
              {portfolio.inspectionCount === 0 ? (
                <p className="mt-4 text-sm text-muted-foreground">No saved inspections yet.</p>
              ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  <AnalyticsStat label="Inspections" value={String(portfolio.inspectionCount)} />
                  <AnalyticsStat label="Completed (local)" value={String(portfolio.completedCount)} />
                  <AnalyticsStat
                    label="Total detections"
                    value={String(portfolio.totalRows)}
                    hint="Summed across vehicles"
                  />
                  <AnalyticsStat label="Approved" value={String(portfolio.approved)} />
                  <AnalyticsStat label="Rejected" value={String(portfolio.rejected)} />
                  <AnalyticsStat label="Pending" value={String(portfolio.pending)} />
                  <AnalyticsStat
                    label="Precision"
                    value={portfolio.precisionPctStr}
                    hint="Sum(approved) ÷ sum(all rows)"
                  />
                  <AnalyticsStat
                    label="Recall"
                    value={portfolio.recallPctStr}
                    hint="Sum(approved AI) ÷ (sum(approved AI) + sum(manual rows))"
                  />
                  <AnalyticsStat
                    label="Inspections w/ manual add"
                    value={String(portfolio.inspectionsWithManual)}
                    hint="At least one inspector-added damage row"
                  />
                  <AnalyticsStat
                    label="Avg. review time"
                    value={portfolio.avgDurationStr}
                    hint="Completed inspections only; mm:ss"
                  />
                </div>
              )}
            </div>

            <div className="rounded-xl border border-dashed border-border bg-card/80 p-5 shadow-sm">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Layers size={20} className="text-muted-foreground" aria-hidden />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-foreground">By part (fleet roll-up)</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Coming soon — aggregated damage counts across all vehicles by panel.
                  </p>
                </div>
              </div>
              <Accordion type="single" collapsible className="mt-4 w-full">
                <AccordionItem value="placeholder" className="border-border">
                  <AccordionTrigger className="text-sm hover:no-underline">
                    Placeholder: future part-level breakdown
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-xs text-muted-foreground pb-2">
                      This section will mirror inspection-level “by part” summaries, rolled up across every
                      inspection in local storage.
                    </p>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        ) : null}

        {mainTab === 'inspections' ? (
          <>
        <div className="mb-6 p-4 rounded-xl border border-border bg-card shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1">Inspector label (optional)</h2>
          <p className="text-xs text-muted-foreground mb-3">
            Used in daily exports—no password or account.
          </p>
          <input
            type="text"
            value={inspectorName}
            onChange={(e) => onInspectorNameChange(e.target.value)}
            placeholder="e.g. Aaron"
            className="w-full max-w-md px-4 py-2 rounded-lg border border-border bg-background text-sm"
            autoComplete="off"
          />
        </div>

        {/* Pull new inspection */}
        <div className="mb-10 p-5 rounded-xl border border-border bg-card shadow-sm">
          <h2 className="text-sm font-semibold text-foreground mb-1">Retrieve a scan</h2>
          <p className="text-xs text-muted-foreground mb-4">
            Enter the UVeye inspection ID.
          </p>
          <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={inspectionId}
              onChange={e => setInspectionId(e.target.value)}
              placeholder="e.g. 5e038d3b-3d67-49e3-a0cd-74f351ee3807"
              className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/20"
              disabled={isRetrieving}
              autoComplete="off"
            />
            <button
              type="submit"
              disabled={!inspectionId.trim() || isRetrieving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-foreground text-background rounded-lg text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
            >
              {isRetrieving ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Pulling…
                </>
              ) : (
                <>
                  <Download size={16} />
                  Pull new inspection
                </>
              )}
            </button>
          </form>
          {retrieveError && (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {retrieveError}
            </p>
          )}
        </div>

        {/* In Progress */}
        {inProgress.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Clock size={14} />
              In Progress ({inProgress.length})
            </h2>
            <div className="grid gap-3">
              {inProgress.map(ins => (
                <InspectionCard key={ins.id} inspection={ins} onClick={() => onSelect(ins.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Completed */}
        {completed.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CheckCircle size={14} />
              Completed ({completed.length})
            </h2>
            <div className="grid gap-3">
              {completed.map(ins => (
                <InspectionCard key={ins.id} inspection={ins} onClick={() => onSelect(ins.id)} />
              ))}
            </div>
          </section>
        )}

        {/* Empty state */}
        {inspections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
              <Car size={28} className="text-muted-foreground" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-1">No inspections yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm">
              Enter an inspection ID above to load scan data from UVeye.
            </p>
          </div>
        )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function AnalyticsStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 px-3 py-3 text-center">
      <div className="text-lg font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-[11px] font-medium text-muted-foreground mt-0.5">{label}</div>
      {hint ? <div className="text-[10px] text-muted-foreground/90 mt-1 leading-tight">{hint}</div> : null}
    </div>
  );
}

function InspectionCard({ inspection, onClick }: { inspection: InspectionRecord; onClick: () => void }) {
  const dateStr = inspection.createdAt.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
  const uid = inspection.vehicleUniqueId?.trim();
  const insp = inspection.uveyeInspectionId?.trim();
  const sameId = Boolean(uid && insp && uid === insp);
  const vin = inspection.vin?.trim();
  const plate = inspection.licensePlate?.trim();
  const plateState = inspection.licensePlateState?.trim();
  /** Show "—" for missing values so the four-field layout is always present and predictable. */
  const dash = '—';
  const displayVin = vin && vin !== '—' ? vin : dash;
  const displayPlate = plate
    ? plateState
      ? `${plate} · ${plateState}`
      : plate
    : dash;
  const displayUniqueId = uid || dash;
  const displayInspectionId = insp || dash;

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 p-4 bg-card border border-border rounded-xl hover:border-foreground/20 transition-colors text-left group"
    >
      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Car size={20} className="text-muted-foreground" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-foreground">
            {inspection.year} {inspection.make} {inspection.model}
          </span>
          <span className="text-xs text-muted-foreground">• {inspection.color}</span>
        </div>
        {/* Four-field identity block — always rendered so cards line up even when some values are empty. */}
        <div className="mt-1 grid gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
          <span title="Vehicle uniqueId from scan payload" className="truncate">
            <span className="font-medium text-foreground/75">Unique Id: </span>
            <span className="font-mono text-foreground/90">{displayUniqueId}</span>
          </span>
          <span title="UVeye inspection id" className="truncate">
            <span className="font-medium text-foreground/75">Inspection Id: </span>
            <span className="font-mono text-foreground/90">
              {sameId ? `${dash} (same as Unique Id)` : displayInspectionId}
            </span>
          </span>
          <span title="License plate" className="truncate">
            <span className="font-medium text-foreground/75">Plate: </span>
            <span className="font-mono text-foreground/90">{displayPlate}</span>
          </span>
          <span title="Vehicle identification number" className="truncate">
            <span className="font-medium text-foreground/75">VIN: </span>
            <span className="font-mono text-foreground/90">{displayVin}</span>
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <span>{dateStr}</span>
          {inspection.damageCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle size={11} />
              {inspection.damageCount} damage{inspection.damageCount !== 1 ? 's' : ''}
            </span>
          )}
          {inspection.status === 'completed' && typeof inspection.durationSeconds === 'number' && (
            <span className="flex items-center gap-1 text-primary">
              <CheckCircle size={11} />
              {formatDurationSeconds(inspection.durationSeconds)}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}
