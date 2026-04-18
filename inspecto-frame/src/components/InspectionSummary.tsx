import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  ArrowLeft,
  Camera,
  Clock,
  ChevronDown,
  Flag,
  Copy,
  Filter,
  Percent,
  Target,
} from 'lucide-react';
import { generateInspectionPdf } from './InspectionPdfReport';
import type { UveyeInspectionResponse } from '@/services/uveyeApi';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { damageInspectionSummaryCounts } from '@/lib/damageReportCsv';

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
  captureId?: string;
  captureDataUrl?: string;
  captureImageUrl?: string;
}

interface InspectionSummaryProps {
  vehicleLabel: string;
  damages: Damage[];
  payload: UveyeInspectionResponse;
  onBack: () => void;
  capturedPhotos?: {
    partName: string;
    damageType: string;
    dataUrl?: string;
    imageUrl?: string;
    timestamp: Date;
    captureId?: string;
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
  payload,
  onBack,
  capturedPhotos = [],
}: InspectionSummaryProps) {
  const [listFilter, setListFilter] = useState<SummaryFilter>('all');
  /** Part name → accordion open; empty means all closed until user expands. */
  const [expandedParts, setExpandedParts] = useState<Record<string, boolean>>({});

  const approved = damages.filter(d => d.confirmed === true);
  const rejected = damages.filter(d => d.confirmed === false);
  const pending = damages.filter(d => d.confirmed == null);
  /** Every detection row in this inspection (AI + manual / camera). */
  const totalDamages = damages.length;
  const decidedCount = approved.length + rejected.length;
  const reviewProgressPct =
    totalDamages > 0 ? Math.round((decidedCount / totalDamages) * 1000) / 10 : null;
  const unreviewedDamagesCount = pending.length;
  const flagged = damages.filter(d => d.flagged);
  const summaryMetrics = useMemo(() => damageInspectionSummaryCounts(damages), [damages]);

  const unlinkedCaptures = useMemo(() => {
    const linked = new Set(
      damages.map((d) => d.captureId).filter((id): id is string => Boolean(id?.trim())),
    );
    return capturedPhotos.filter((p) => {
      const cid = p.captureId?.trim();
      if (!cid) return true;
      return !linked.has(cid);
    });
  }, [damages, capturedPhotos]);

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

  const partNames = useMemo(() => Object.keys(byPart).sort((a, b) => a.localeCompare(b)), [byPart]);

  useEffect(() => {
    setExpandedParts({});
  }, [listFilter]);

  const expandAllParts = () => {
    setExpandedParts(Object.fromEntries(partNames.map((p) => [p, true])));
  };

  const collapseAllParts = () => {
    setExpandedParts(Object.fromEntries(partNames.map((p) => [p, false])));
  };

  const handleDownloadPdf = () => {
    void generateInspectionPdf({
      vehicleLabel,
      damages,
      payload,
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
            <p className="text-xs text-muted-foreground">Summary &amp; stats</p>
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
        {/* Stats: row 1 — totals & review mix; row 2 — progress & duplicates */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            <StatCard
              label="Total detections"
              value={totalDamages}
              icon={<AlertTriangle size={16} />}
              color="text-foreground"
              hint="All rows: AI + manual / camera"
            />
            <StatCard label="Approved" value={approved.length} icon={<CheckCircle size={16} />} color="text-primary" />
            <StatCard label="Reject" value={rejected.length} icon={<XCircle size={16} />} color="text-destructive" />
            <StatCard
              label="Unreviewed"
              value={unreviewedDamagesCount}
              icon={<Clock size={16} />}
              color={unreviewedDamagesCount > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}
              hint={
                totalDamages === 0
                  ? 'No detections'
                  : unreviewedDamagesCount === 0
                    ? 'Every detection has approve or reject'
                    : `Still need approve or reject (${unreviewedDamagesCount} of ${totalDamages})`
              }
            />
            <StatCard
              label="Accuracy"
              value={summaryMetrics.accuracyPctStr}
              icon={<Target size={16} />}
              color="text-foreground"
              hint={
                totalDamages === 0
                  ? 'No rows to score'
                  : `${summaryMetrics.approved} approved ÷ ${summaryMetrics.totalDamages} total`
              }
            />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:max-w-xl">
            <StatCard
              label="Review progress"
              value={reviewProgressPct === null ? '—' : `${reviewProgressPct}%`}
              icon={<Percent size={16} />}
              color="text-primary"
              hint={`${decidedCount} of ${totalDamages} approve or reject`}
            />
            <StatCard
              label="Duplicates"
              value={summaryMetrics.markedDuplicates}
              icon={<Copy size={16} />}
              color={summaryMetrics.markedDuplicates > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground'}
              hint="Rows marked duplicate"
            />
          </div>
        </div>

        {flagged.length > 0 && (
          <div className="flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full border border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200 px-3 py-1.5">
              <Flag size={12} /> {flagged.length} flagged
            </span>
          </div>
        )}

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
                <p className="text-xs text-muted-foreground mt-1">
                  Area, part, damage type, source (AI vs Manual), and review status. Camera captures appear as Manual rows.
                </p>
              )}
            </div>
            <div className="flex flex-col gap-2 shrink-0 w-full sm:flex-row sm:items-center sm:justify-end sm:gap-2 sm:w-auto">
              <div className="flex items-center gap-1.5 justify-end sm:justify-start">
                <button
                  type="button"
                  onClick={expandAllParts}
                  disabled={partNames.length === 0}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/70 disabled:opacity-40 disabled:pointer-events-none"
                >
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAllParts}
                  disabled={partNames.length === 0}
                  className="rounded-md border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground hover:bg-muted/70 disabled:opacity-40 disabled:pointer-events-none"
                >
                  Collapse all
                </button>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-[min(100%,220px)]">
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
          </div>
          {totalDamages === 0 ? (
            <p className="text-sm text-muted-foreground">No damages detected.</p>
          ) : partNames.length === 0 ? (
            <p className="text-sm text-muted-foreground">No detections match this filter.</p>
          ) : (
            <div className="space-y-1">
              {partNames.map((part) => (
                <CollapsiblePart
                  key={part}
                  part={part}
                  dmgs={byPart[part]}
                  open={expandedParts[part] ?? false}
                  onOpenChange={(next) =>
                    setExpandedParts((prev) => ({
                      ...prev,
                      [part]: next,
                    }))
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Older captures saved before they were linked as detection rows */}
        {unlinkedCaptures.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold text-foreground mb-1 flex items-center gap-2">
              <Camera size={14} /> Additional captures ({unlinkedCaptures.length})
            </h3>
            <p className="text-xs text-muted-foreground mb-3">
              These photos are not yet tied to a detection row. New camera saves appear in the list above as Manual source.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {unlinkedCaptures.map((photo, i) => (
                <div key={i} className="relative rounded-lg overflow-hidden border border-border aspect-video">
                  <img
                    src={photo.dataUrl ?? photo.imageUrl ?? ''}
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

function CollapsiblePart({
  part,
  dmgs,
  open,
  onOpenChange,
}: {
  part: string;
  dmgs: Damage[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
      >
        <span className="flex items-center gap-2 min-w-0">
          <ChevronDown
            size={14}
            className={`shrink-0 text-muted-foreground transition-transform ${open ? '' : '-rotate-90'}`}
          />
          <span className="text-sm font-semibold text-foreground truncate">{part}</span>
        </span>
        <span className="text-xs bg-destructive/10 text-destructive px-2 py-0.5 rounded-full font-medium shrink-0">
          {dmgs.length}
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 pt-0 border-t border-border/60 bg-muted/20 space-y-1.5">
          {dmgs.map((d) => (
            <div
              key={d.id}
              className={cn(
                'flex items-start justify-between gap-2 text-xs rounded-md px-2 py-1.5 border',
                d.ai
                  ? 'bg-background/80 border-border/50'
                  : 'bg-sky-50 border-sky-200/90 dark:bg-sky-950/40 dark:border-sky-800/80',
              )}
            >
              {(d.captureDataUrl || d.captureImageUrl) && (
                <div className="shrink-0 w-14 h-14 rounded-md overflow-hidden border border-border bg-muted">
                  <img
                    src={d.captureDataUrl ?? d.captureImageUrl ?? ''}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
              <div className="min-w-0 flex-1">
                {d.damageName && (
                  <div className="font-semibold text-foreground text-sm leading-tight mb-0.5">{d.damageName}</div>
                )}
                <div className="font-medium text-foreground truncate">
                  <span className="text-muted-foreground font-normal">Damage type </span>
                  {d.type}
                </div>
                <div className="text-muted-foreground">
                  <span className="text-muted-foreground font-normal">Source </span>
                  {d.ai ? 'AI' : 'Manual'}
                  {(d.captureDataUrl || d.captureImageUrl) && (
                    <span className="text-muted-foreground"> · camera</span>
                  )}
                  {' · '}
                  <span className={d.severity === 'High' ? 'text-destructive' : d.severity === 'Medium' ? 'text-yellow-600 dark:text-yellow-400' : ''}>{d.severity}</span>
                  {d.isDuplicate && <span className="ml-1">· duplicate</span>}
                  {d.flagged && <span className="ml-1 text-amber-700 dark:text-amber-300">· flagged</span>}
                </div>
              </div>
              <span className="shrink-0 flex items-center gap-0.5 self-center">
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

function StatCard({
  label,
  value,
  icon,
  color,
  hint,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  /** Short subtitle under the label (e.g. formula or scope). */
  hint?: string;
}) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col items-center text-center">
      <div className={`mb-1 ${color}`}>{icon}</div>
      <div className="text-2xl font-bold text-foreground tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
      {hint ? <div className="text-[10px] text-muted-foreground/90 mt-1 leading-tight">{hint}</div> : null}
    </div>
  );
}
