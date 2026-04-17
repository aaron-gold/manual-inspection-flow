import { useMemo } from 'react';
import { Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  buildDamageReportCsv,
  buildDamageReportData,
  damageReportFilename,
  downloadDamageReportCsv,
} from '@/lib/damageReportCsv';
import type { Damage } from '@/lib/assistedInspectionModel';
import type { UveyeInspectionResponse } from '@/services/uveyeApi';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payload: UveyeInspectionResponse;
  damages: Damage[];
  vehicleLabel?: string | null;
};

export function DamageReportPreviewDialog({
  open,
  onOpenChange,
  payload,
  damages,
  vehicleLabel,
}: Props) {
  const { meta, rows } = useMemo(
    () => buildDamageReportData(payload, damages),
    [payload, damages],
  );

  const handleDownload = () => {
    const csv = buildDamageReportCsv(payload, damages);
    downloadDamageReportCsv(damageReportFilename(payload), csv);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,720px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(100vw-2rem,56rem)]">
        <DialogHeader className="shrink-0 space-y-1 border-b border-border px-6 py-4 text-left">
          <DialogTitle>Damage report</DialogTitle>
          <DialogDescription>
            Preview matches the CSV export. Download when you are ready.
            {vehicleLabel ? ` — ${vehicleLabel}` : ''}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">VIN</dt>
            <dd className="font-mono text-xs">{meta.vin || '—'}</dd>
            <dt className="text-muted-foreground">Make</dt>
            <dd>{meta.make || '—'}</dd>
            <dt className="text-muted-foreground">Model</dt>
            <dd>{meta.model || '—'}</dd>
            <dt className="text-muted-foreground">Year</dt>
            <dd>{meta.year || '—'}</dd>
            {meta.inspectionId ? (
              <>
                <dt className="text-muted-foreground">Inspection ID</dt>
                <dd className="font-mono text-xs">{meta.inspectionId}</dd>
              </>
            ) : null}
            <dt className="text-muted-foreground">UVeye link</dt>
            <dd className="min-w-0 break-all">
              {meta.uveyeLink ? (
                <a
                  href={meta.uveyeLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-4 hover:underline"
                >
                  {meta.uveyeLink}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </dl>

          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[640px] border-collapse text-left text-xs">
              <thead className="sticky top-0 z-10 bg-muted/95 backdrop-blur supports-[backdrop-filter]:bg-muted/80">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-semibold">Area</th>
                  <th className="px-2 py-2 font-semibold">Module</th>
                  <th className="px-2 py-2 font-semibold">Car part</th>
                  <th className="px-2 py-2 font-semibold">Damage</th>
                  <th className="px-2 py-2 font-semibold tabular-nums">Diagonal (mm)</th>
                  <th className="px-2 py-2 font-semibold tabular-nums">Width (mm)</th>
                  <th className="px-2 py-2 font-semibold tabular-nums">Height (mm)</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-muted-foreground"
                    >
                      No damage rows yet. Confirm or add detections to populate this report.
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/80 last:border-0">
                      <td className="px-2 py-1.5 align-top">{r.area}</td>
                      <td className="px-2 py-1.5 align-top">{r.module}</td>
                      <td className="px-2 py-1.5 align-top">{r.part}</td>
                      <td className="px-2 py-1.5 align-top">{r.damage}</td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-muted-foreground">
                        {r.diagonalMm || '—'}
                      </td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-muted-foreground">
                        {r.widthMm || '—'}
                      </td>
                      <td className="px-2 py-1.5 align-top tabular-nums text-muted-foreground">
                        {r.heightMm || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <DialogFooter className="shrink-0 gap-2 border-t border-border px-6 py-4 sm:justify-between">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button type="button" onClick={handleDownload}>
            <Download className="size-4" aria-hidden />
            Download CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
