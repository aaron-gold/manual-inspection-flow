import React, { useMemo, useState } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Download, ArrowLeft, Camera, Clock, ChevronDown, Flag, Copy, Filter } from 'lucide-react';
import { generateInspectionPdf } from './InspectionPdfReport';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Damage {
  id: number;
  part: string;
  type: string;
  severity: string;
  ai: boolean;
  x: number;
  y: number;
  frameId: string;
  confirmed?: boolean | null;
  isDuplicate?: boolean;
  flagged?: boolean;
  damageName?: string;
  reportId?: string;
}

interface InspectionSummaryProps {
  vehicleLabel: string;
  damages: Damage[];
  reviewedParts: Set<string>;
  totalParts: number;
  onBack: () => void;
  capturedPhotos?: {
    partName: string;
    damageType: string;
    dataUrl?: string;
    imageUrl?: string;
    timestamp: Date;
  }[];
}

type SummaryFilter =
  | 'all'
  | 'reviewed'
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'duplicates';

function matchesSummaryFilter(d: Damage, f: SummaryFilter): boolean {
  switch (f) {
    case 'all':
      return true;
    case 'reviewed':
      return d.confirmed === true || d.confirmed === false;
    case 'pending':
      return d.confirmed == null;
    case 'approved':
      return d.confirmed === true;
    case 'rejected':
      return d.confirmed === false;
    case 'duplicates':
      return !!d.isDuplicate;
    default:
      return true;
  }
}

const FILTER_LABELS: Record<SummaryFilter, string> = {
  all: 'All detections',
  reviewed: 'Reviewed (approved or rejected)',
  pending: 'Pending review',
  approved: 'Approved',
  rejected: 'Rejected',
  duplicates: 'Duplicates',
};

const FILTER_ORDER: SummaryFilter[] = ['all', 'reviewed', 'pending', 'approved', 'rejected', 'duplicates'];

export default function InspectionSummary({
  vehicleLabel,
  damages,
  reviewedParts,
  totalParts,
  onBack,
  capturedPhotos = [],
}: InspectionSummaryProps) {
  const [listFilter, setListFilter] = useState<SummaryFilter>('all');

  const confirmed = damages.filter(d => d.confirmed === true);
  const dismissed = damages.filter(d => d.confirmed === false);
  const pending = damages.filter(d => d.confirmed == null);
  const totalDamages = damages.length;
  const duplicates = damages.filter(d => d.isDuplicate);
  const flagged = damages.filter(d => d.flagged);

  const filteredForList = useMemo(
    () => damages.filter(d => matchesSummaryFilter(d, listFilter)),
    [damages, listFilter],
  );

  const byPart = useMemo(() => {
    return filteredForList.reduce<Record<string, Damage[]>>((acc, d) => {
      (acc[d.part] ??= []).push(d);
      return acc;
    }, {});
  }, [filteredForList]);

  const partNames = Object.keys(byPart).sort((a, b) => a.localeCompare(b));

  const bySeverity = {
    High: damages.filter(d => d.severity === 'High').length,
    Medium: damages.filter(d => d.severity === 'Medium').length,
    Low: damages.filter(d => d.severity === 'Low').length,
  };

  const handleDownloadPdf = () => {
    void generateInspectionPdf({
      vehicleLabel,
      damages,
      reviewedParts,
      totalParts,
      capturedPhotos,
    });
  };

  return (
    <div className="h-full flex flex-col bg-muted/30 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="font-bold text-base">{vehicleLabel}</h1>
            <p className="text-xs text-muted-foreground">Inspection Summary Report</p>
          </div>
        </div>
        <button
          onClick={handleDownloadPdf}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Download size={14} /> Download PDF
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Stats cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="Total Detections" value={totalDamages} icon={<AlertTriangle size={16} />} color="text-foreground" />
          <StatCard label="Confirmed" value={confirmed.length} icon={<CheckCircle size={16} />} color="text-primary" />
          <StatCard label="Dismissed" value={dismissed.length} icon={<XCircle size={16} />} color="text-destructive" />
          <StatCard label="Pending Review" value={pending.length} icon={<Clock size={16} />} color="text-muted-foreground" />
        </div>

        {(duplicates.length > 0 || flagged.length > 0) && (
          <div className="flex flex-wrap gap-3">
            {duplicates.length > 0 && (
              <span className="inline-flex items-center gap-2 text-sm font-semibold rounded-xl border-2 border-blue-600 bg-blue-600 text-white px-4 py-2.5 shadow-sm">
                <Copy size={18} className="shrink-0 opacity-95" aria-hidden />
                {duplicates.length} marked duplicate{duplicates.length !== 1 ? 's' : ''}
              </span>
            )}
            {flagged.length > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-1.5">
                <Flag size={12} /> {flagged.length} flagged
              </span>
            )}
          </div>
        )}

        {/* Progress */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-foreground">Parts Reviewed</span>
            <span className="text-sm font-bold text-primary">{reviewedParts.size} / {totalParts}</span>
          </div>
          <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${(reviewedParts.size / totalParts) * 100}%` }} />
          </div>
        </div>

        {/* Severity — compact summary */}
        <div className="bg-card rounded-xl border border-border p-4">
          <h3 className="text-sm font-semibold text-foreground mb-3">Severity (AI)</h3>
          <p className="text-xs text-muted-foreground mb-3">
            Counts reflect model-assigned severity from the inspection payload.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['High', 'Medium', 'Low'] as const).map(sev => (
              <div
                key={sev}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm border ${
                  sev === 'High'
                    ? 'border-destructive/30 bg-destructive/5'
                    : sev === 'Medium'
                      ? 'border-yellow-500/30 bg-yellow-500/5'
                      : 'border-border bg-muted/40'
                }`}
              >
                <span className={`font-bold tabular-nums ${sev === 'High' ? 'text-destructive' : sev === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' : 'text-muted-foreground'}`}>
                  {bySeverity[sev]}
                </span>
                <span className="text-muted-foreground">{sev}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Damages by part — collapsible, filterable */}
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4 mb-3">
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-foreground">Damages by Part</h3>
              {listFilter !== 'all' ? (
                <p className="text-xs text-muted-foreground mt-1">
                  Showing {filteredForList.length} of {totalDamages} detection{totalDamages !== 1 ? 's' : ''}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">Damage type and AI labels from the inspection payload.</p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 w-full sm:w-[min(100%,280px)]">
              <Filter size={14} className="text-muted-foreground shrink-0" aria-hidden />
              <Select value={listFilter} onValueChange={v => setListFilter(v as SummaryFilter)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Filter detections" />
                </SelectTrigger>
                <SelectContent>
                  {FILTER_ORDER.map(key => (
                    <SelectItem key={key} value={key} className="text-xs">
                      {FILTER_LABELS[key]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {totalDamages === 0 ? (
            <p className="text-sm text-muted-foreground">No damages detected.</p>
          ) : partNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No detections match this filter.</p>
          ) : (
            <div className="space-y-1">
              {partNames.map(part => (
                <CollapsiblePart key={part} part={part} dmgs={byPart[part]} />
              ))}
            </div>
          )}
        </div>

        {/* Captured Photos */}
        {capturedPhotos.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2"><Camera size={14} /> Captured Photos ({capturedPhotos.length})</h3>
            <div className="grid grid-cols-3 gap-2">
              {capturedPhotos.map((photo, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-border aspect-video">
                  <img
                    src={photo.dataUrl ?? photo.imageUrl ?? ""}
                    alt={photo.partName}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute bottom-0 inset-x-0 bg-foreground/75 text-background text-[10px] px-1.5 py-1 leading-tight">
                    <div className="font-semibold truncate">{photo.partName}</div>
                    <div className="opacity-90 truncate">{photo.damageType}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CollapsiblePart({ part, dmgs }: { part: string; dmgs: Damage[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown size={14} className={`shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`} />
          <span className="text-sm font-semibold text-foreground truncate">{part}</span>
        </span>
        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium shrink-0">{dmgs.length}</span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 border-t border-border/60 bg-muted/20 space-y-1.5">
          {dmgs.map(d => (
            <div key={d.id} className="flex items-start justify-between gap-2 text-xs rounded-md bg-background/80 px-2 py-1.5 border border-border/50">
              <div className="min-w-0">
                {d.damageName && (
                  <div className="font-semibold text-foreground text-sm leading-tight mb-0.5">{d.damageName}</div>
                )}
                <div className="font-medium text-foreground truncate">
                  <span className="text-muted-foreground font-normal">Type </span>
                  {d.type}
                </div>
                <div className="text-muted-foreground">
                  <span className={d.severity === 'High' ? 'text-destructive' : d.severity === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' : ''}>{d.severity}</span>
                  {' · '}{d.ai ? 'AI' : 'Manual'}
                  {d.isDuplicate && <span className="ml-1 text-muted-foreground">· duplicate</span>}
                  {d.flagged && <span className="ml-1 text-amber-700 dark:text-amber-300">· flagged</span>}
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-0.5">
                {d.confirmed === true && <CheckCircle size={12} className="text-primary" />}
                {d.confirmed === false && <XCircle size={12} className="text-destructive" />}
                {d.confirmed == null && <Clock size={12} className="text-muted-foreground" />}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
    </div>
  );
}
