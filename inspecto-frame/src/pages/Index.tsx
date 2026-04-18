import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import AssistedInspectionV3 from "@/components/AssistedInspectionV3";
import InspectionDashboard, { type InspectionRecord } from "@/components/InspectionDashboard";
import {
  fetchUveyeInspection,
  buildInspectionRecordFromResponse,
  type UveyeInspectionResponse,
} from "@/services/uveyeApi";
import {
  loadPersistedBundle,
  savePersistedBundle,
  clearPersistedBundle,
  serializeRecord,
  deserializeRecord,
  toSerializedCaptures,
  fromSerializedCaptures,
  type PersistedBundle,
} from "@/services/localInspectionStore";
import { buildDailyActivityRows, buildDailyExportZip, downloadBlob } from "@/services/dailyExport";
import type { CapturedPhotoEntry } from "@/types/capturedPhoto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type ViewState = { type: "dashboard" } | { type: "inspection"; id: string };

export default function Index() {
  const [hydrated, setHydrated] = useState(false);
  const [view, setView] = useState<ViewState>({ type: "dashboard" });
  const [inspectorName, setInspectorName] = useState("");
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [payloads, setPayloads] = useState<Record<string, UveyeInspectionResponse>>({});
  const [reviewStateById, setReviewStateById] = useState<Record<string, Record<string, unknown>>>({});
  const [capturesById, setCapturesById] = useState<Record<string, CapturedPhotoEntry[]>>({});
  const [isRetrieving, setIsRetrieving] = useState(false);
  const [retrieveError, setRetrieveError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [dailyPreviewOpen, setDailyPreviewOpen] = useState(false);
  const [clearDataDialogOpen, setClearDataDialogOpen] = useState(false);
  const [isClearingLocalData, setIsClearingLocalData] = useState(false);

  const dailyPreview = useMemo(
    () =>
      buildDailyActivityRows({
        inspectorName,
        day: new Date(),
        inspections,
        payloads,
        reviewById: reviewStateById,
        capturesById,
      }),
    [inspectorName, inspections, payloads, reviewStateById, capturesById],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const b = await loadPersistedBundle();
        if (cancelled || !b) return;
        setInspectorName(b.inspectorName ?? "");
        setInspections(b.inspections.map(deserializeRecord));
        setPayloads(b.payloads);
        setReviewStateById(b.reviewById);
        const cap: Record<string, CapturedPhotoEntry[]> = {};
        for (const id of Object.keys(b.capturesById)) {
          cap[id] = fromSerializedCaptures(b.capturesById[id] ?? []);
        }
        setCapturesById(cap);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const bundle: PersistedBundle = {
      v: 1,
      inspectorName,
      inspections: inspections.map(serializeRecord),
      payloads,
      reviewById: reviewStateById,
      capturesById: Object.fromEntries(
        Object.entries(capturesById).map(([k, v]) => [k, toSerializedCaptures(v)]),
      ),
    };
    const t = window.setTimeout(() => {
      void savePersistedBundle(bundle);
    }, 450);
    return () => clearTimeout(t);
  }, [hydrated, inspectorName, inspections, payloads, reviewStateById, capturesById]);

  const handleRetrieveFromApi = async (inspectionId: string) => {
    const id = inspectionId
      .trim()
      .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "")
      .trim();
    if (!id) return;
    setRetrieveError(null);
    setIsRetrieving(true);
    try {
      const response = await fetchUveyeInspection({
        inspectionId: id,
        alertsOnly: false,
        showTreadPolygons: false,
      });
      const record = buildInspectionRecordFromResponse(id, response);
      const key = record.id;
      setPayloads((prev) => ({ ...prev, [key]: response }));
      setInspections((prev) => {
        const without = prev.filter((i) => i.id !== key);
        return [record, ...without];
      });
      setCapturesById((prev) => (prev[key] ? prev : { ...prev, [key]: [] }));
      setView({ type: "inspection", id: key });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to retrieve inspection.";
      setRetrieveError(msg);
    } finally {
      setIsRetrieving(false);
    }
  };

  const persistReviewState = useCallback(async (inspectionId: string, state: Record<string, unknown>) => {
    setReviewStateById((prev) => ({ ...prev, [inspectionId]: state }));
  }, []);

  const handleCaptureUpdate = useCallback((inspectionId: string, photos: CapturedPhotoEntry[]) => {
    setCapturesById((prev) => ({ ...prev, [inspectionId]: photos }));
  }, []);

  const handleConfirmClearLocalData = useCallback(async () => {
    setIsClearingLocalData(true);
    try {
      await clearPersistedBundle();
      setInspections([]);
      setPayloads({});
      setReviewStateById({});
      setCapturesById({});
      setInspectorName("");
      setView({ type: "dashboard" });
      setRetrieveError(null);
      setExportError(null);
      setClearDataDialogOpen(false);
    } finally {
      setIsClearingLocalData(false);
    }
  }, []);

  const handleExportDaily = useCallback(async () => {
    setExportError(null);
    setIsExporting(true);
    try {
      const day = new Date();
      const blob = await buildDailyExportZip({
        inspectorName,
        day,
        inspections,
        payloads,
        reviewById: reviewStateById,
        capturesById,
      });
      const stamp = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
      downloadBlob(blob, `inspecto-daily-${stamp}.zip`);
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setIsExporting(false);
    }
  }, [inspectorName, inspections, payloads, reviewStateById, capturesById]);

  const activeInspectionId = view.type === "inspection" ? view.id : undefined;

  const persistActiveReview = useCallback(
    (state: Record<string, unknown>) => {
      if (!activeInspectionId) return;
      void persistReviewState(activeInspectionId, state);
    },
    [activeInspectionId, persistReviewState],
  );

  const captureChangeForActive = useCallback(
    (photos: CapturedPhotoEntry[]) => {
      if (!activeInspectionId) return;
      handleCaptureUpdate(activeInspectionId, photos);
    },
    [activeInspectionId, handleCaptureUpdate],
  );

  if (view.type === "inspection") {
    const payload = payloads[view.id];
    const inspection = inspections.find((i) => i.id === view.id);
    const label = inspection
      ? `${inspection.year} ${inspection.make} ${inspection.model}`
      : "Inspection";

    if (!payload) {
      return (
        <div className="h-screen w-full flex items-center justify-center text-muted-foreground text-sm">
          Missing inspection data. Return to the dashboard and retrieve again.
        </div>
      );
    }

    const initialReview = reviewStateById[view.id] ?? null;
    const initialCaptures = capturesById[view.id];

    return (
      <div className="h-screen w-full flex flex-col">
        <AssistedInspectionV3
          key={view.id}
          payload={payload}
          vehicleLabel={label}
          onBack={() => setView({ type: "dashboard" })}
          vehicleType={inspection?.bodyType}
          inspectionKey={view.id}
          initialReviewState={initialReview}
          initialCapturedPhotos={initialCaptures}
          onPersistReviewState={persistActiveReview}
          onCapturedPhotosChange={captureChangeForActive}
        />
      </div>
    );
  }

  return (
    <div className="h-screen w-full flex flex-col">
      <div className="flex-1 min-h-0">
        {!hydrated ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            Loading saved inspections…
          </div>
        ) : (
          <InspectionDashboard
            inspections={inspections}
            inspectorName={inspectorName}
            onInspectorNameChange={setInspectorName}
            onSelect={(id) => setView({ type: "inspection", id })}
            onRetrieveFromApi={handleRetrieveFromApi}
            onExportDailyPack={handleExportDaily}
            onPreviewDailyPack={() => setDailyPreviewOpen(true)}
            isRetrieving={isRetrieving}
            isExporting={isExporting}
            retrieveError={retrieveError}
            exportError={exportError}
            onRequestClearLocalData={() => setClearDataDialogOpen(true)}
          />
        )}
      </div>

      <AlertDialog open={clearDataDialogOpen} onOpenChange={setClearDataDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Clear all local data?</AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block">
                This clears your inspection list and removes review progress, captured photos, and cached scan
                data stored in this browser on this device. It only runs when you confirm.
              </span>
              <span className="block font-medium text-foreground">
                Download the full pack (CSV + photos) first if you need a backup. This cannot be undone.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isClearingLocalData}>Cancel</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={isClearingLocalData}
              onClick={() => void handleConfirmClearLocalData()}
            >
              {isClearingLocalData ? "Clearing…" : "Yes, clear everything"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={dailyPreviewOpen} onOpenChange={setDailyPreviewOpen}>
        <DialogContent className="max-w-[min(1100px,95vw)] w-full max-h-[min(720px,85vh)] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
            <DialogTitle>Daily activity preview</DialogTitle>
            <DialogDescription>
              Same columns as <code className="text-xs bg-muted px-1 rounded">daily-activity.csv</code> in the
              full pack (CSV + photos)—local calendar day, no download required.
            </DialogDescription>
          </DialogHeader>
          <div className="px-6 pb-6 flex-1 min-h-0 flex flex-col gap-2">
            <div className="text-xs text-muted-foreground">
              Generated {dailyPreview.exportedAt} · {dailyPreview.rows.length} row
              {dailyPreview.rows.length !== 1 ? "s" : ""}
            </div>
            <div className="flex-1 min-h-0 overflow-auto rounded-md border border-border">
              {dailyPreview.rows.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No inspections retrieved for today yet.</p>
              ) : (
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr>
                      {dailyPreview.headers.map((h) => (
                        <th
                          key={h}
                          className="sticky top-0 z-10 border-b border-border bg-muted px-2 py-2 text-left font-semibold whitespace-nowrap"
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {dailyPreview.rows.map((row, ri) => (
                      <tr key={ri} className="hover:bg-muted/40">
                        {row.map((cell, ci) => (
                          <td
                            key={ci}
                            className="border-b border-border/80 px-2 py-1.5 align-top max-w-[240px] truncate"
                            title={cell}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
