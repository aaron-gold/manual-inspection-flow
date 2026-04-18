import React, { useState } from 'react';
import { Car, Clock, CheckCircle, AlertTriangle, ChevronRight, Download, Loader2, Table2, Trash2 } from 'lucide-react';

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
}

interface Props {
  inspections: InspectionRecord[];
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
}

export default function InspectionDashboard({
  inspections,
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
}: Props) {
  const [inspectionId, setInspectionId] = useState('');
  const inProgress = inspections.filter(i => i.status === 'in_progress');
  const completed = inspections.filter(i => i.status === 'completed');

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
                  Preview daily CSV
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
          </div>
        </div>
        {exportError && (
          <p className="mb-6 text-sm text-destructive" role="alert">
            {exportError}
          </p>
        )}

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
      </div>
    </div>
  );
}

function InspectionCard({ inspection, onClick }: { inspection: InspectionRecord; onClick: () => void }) {
  const dateStr = inspection.createdAt.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

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
        <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
          <span title="UVeye inspection id">{inspection.uveyeInspectionId}</span>
          <span>• VIN: {inspection.vin}</span>
          <span>• {dateStr}</span>
          {inspection.damageCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertTriangle size={11} />
              {inspection.damageCount} damage{inspection.damageCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={16} className="text-muted-foreground group-hover:text-foreground transition-colors shrink-0" />
    </button>
  );
}
