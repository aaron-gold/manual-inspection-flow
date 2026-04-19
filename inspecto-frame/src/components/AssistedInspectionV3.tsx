import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import type { BodyType, InspectionRecord } from './InspectionDashboard';
import CameraCapture from './CameraCapture';
import type { CapturedPhotoEntry } from '@/types/capturedPhoto';
import InspectionSummary from './InspectionSummary';
import {
  buildCameraFramesFromResponse,
  collectHumanizedDamageTypesFromPayload,
  humanizeDetectionType,
  mapUveyeAlertsToDamages,
  mergePersistedDamagesWithFreshMap,
  prefetchUveyeImages,
  resolveDamageAtlasPortalUrl,
  buildUveyePortalSummaryUrl,
  type UveyeInspectionResponse,
  type UveyeCameraFrame,
} from '@/services/uveyeApi';
import InspectionViewportImage from '@/components/InspectionViewportImage';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  ALL_AREAS,
  applyDefaultApprovedForManualDamages,
  CAR_PARTS,
  isSyntheticDamageFrameId,
  partNameMatches,
  sortPartsByPanelOrder,
  type Area,
  type CarPart,
  type Damage,
} from '@/lib/assistedInspectionModel';
import { SEDAN_LAYOUT_BASE_PX } from '@/lib/sedanDiagramCalibration';
import { DamageReportPreviewDialog } from '@/components/DamageReportPreviewDialog';
import type { DamageReportTimingMeta } from '@/lib/damageReportCsv';
import { allDamageRowsReviewed, formatDurationSeconds } from '@/lib/inspectionTiming';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SedanUnifiedDiagram } from '@/components/SedanUnifiedDiagram';
import interiorDamagesSketchSvg from '@/assets/interior-damages-sketch.svg?raw';
import undercarriageSketchSvg from '@/assets/undercarriage-sketch.svg?raw';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Plus,
  Check,
  PanelRightOpen,
  PanelRightClose,
  LayoutGrid,
  Camera,
  FileText,
  Link as LinkIcon,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  Flag,
  Copy,
  Image as ImageIcon,
  CheckCircle,
  XCircle,
  Truck,
  Table2,
  Play,
  Timer,
} from 'lucide-react';

/** Same corner slugs as `buildCameraFramesFromResponse` (`artemis_leftFront_tread`, …). */
const PART_NAME_TO_ARTEMIS_CORNER: Partial<Record<string, string>> = {
  'Left Front Tire': 'leftFront',
  'Left Front Tire Wall': 'leftFront',
  'Right Front Tire': 'rightFront',
  'Right Front Tire Wall': 'rightFront',
  'Left Rear Tire': 'leftRear',
  'Left Rear Tire Wall': 'leftRear',
  'Right Rear Tire': 'rightRear',
  'Right Rear Tire Wall': 'rightRear',
};

function artemisCornerForPartName(partName: string): string | undefined {
  return PART_NAME_TO_ARTEMIS_CORNER[partName];
}

function framesForArtemisCorner(allFrames: UveyeCameraFrame[], corner: string): UveyeCameraFrame[] {
  const needle = `artemis_${corner}_`;
  return allFrames.filter((f) => typeof f.camera === 'string' && f.camera.includes(needle));
}

function getFramesForPart(
  part: CarPart,
  allFrames: UveyeCameraFrame[],
  damages: Damage[],
): UveyeCameraFrame[] {
  const artemisCorner = artemisCornerForPartName(part.name);
  const partDmgs = damages.filter(d => partNameMatches(part.name, d.part));
  const frameIds = new Set(
    partDmgs.map((d) => d.frameId).filter((id) => id && !isSyntheticDamageFrameId(id)),
  );
  /** Only manual / synthetic frame rows — never fall back to the full walk-around for this part. */
  if (partDmgs.length > 0 && frameIds.size === 0) {
    if (artemisCorner) {
      const cornerFrames = framesForArtemisCorner(allFrames, artemisCorner);
      return cornerFrames.length > 0 ? cornerFrames : [];
    }
    return [];
  }
  if (frameIds.size > 0) {
    const matched = allFrames.filter(f => frameIds.has(f.id));
    /** Stale persisted frameIds or API reordering can yield no rows — fall back so tread/wall images still load. */
    if (matched.length > 0) return matched;
    /** Tire parts: never fall back to every frame — only this corner's Artemis close-ups. */
    if (artemisCorner) {
      const cornerFrames = framesForArtemisCorner(allFrames, artemisCorner);
      return cornerFrames.length > 0 ? cornerFrames : [];
    }
  }
  // No detections yet: interior uses Apollo later — do not fall back to all exterior frames
  if (part.area === 'Interior') {
    return [];
  }
  /** Tires / tire walls: no UVeye detections for this corner — do not show all four Artemis corners + exterior. */
  if (artemisCorner) {
    return [];
  }
  return allFrames;
}

/* ──────────────────────────────────────────────
   Main Component
   ────────────────────────────────────────────── */

interface AssistedInspectionV3Props {
  payload: UveyeInspectionResponse;
  vehicleLabel?: string;
  onBack?: () => void;
  vehicleType?: BodyType;
  /** Enables autosave of review state to local storage (via parent). */
  inspectionKey?: string;
  initialReviewState?: Record<string, unknown> | null;
  initialCapturedPhotos?: CapturedPhotoEntry[];
  onPersistReviewState?: (state: Record<string, unknown>) => void;
  onCapturedPhotosChange?: (photos: CapturedPhotoEntry[]) => void;
  /** Row from local dashboard (timer + completion live here). */
  inspectionRecord?: InspectionRecord | null;
  onTimerStart?: () => void;
  onMarkInspectionComplete?: () => void;
}

/**
 * Append `?diagramTest=1` to the URL to inject sample map highlights:
 * — Left front: tire *cut* → `Left Front Tire Wall` only (`*-tire-wall` circle).
 * — Right front: foreign object → `Right Front Tire` only (`*-tire-tread` path).
 */
const DIAGRAM_TEST_DAMAGES: Damage[] = [
  { id: -91001, part: 'Hood', type: 'diagram-test', severity: 'Low', ai: false, x: 0, y: 0, frameId: '__diagram_test__' },
  { id: -91002, part: 'Left Quarter Panel', type: 'diagram-test', severity: 'Low', ai: false, x: 0, y: 0, frameId: '__diagram_test__' },
  {
    id: -91003,
    part: 'Left Front Tire Wall',
    type: 'Tire sidewall — Tire Cut',
    severity: 'Low',
    ai: false,
    x: 0,
    y: 0,
    frameId: '__diagram_test__',
    damageName: 'Sidewall: Tire Cut',
  },
  {
    id: -91004,
    part: 'Right Front Tire',
    type: 'Tire tread — Foreign Object',
    severity: 'Low',
    ai: false,
    x: 0,
    y: 0,
    frameId: '__diagram_test__',
    damageName: 'Tread: Foreign object (nail)',
  },
];

export default function AssistedInspectionV3({
  payload,
  vehicleLabel,
  onBack,
  vehicleType = 'sedan',
  inspectionKey,
  initialReviewState = null,
  initialCapturedPhotos,
  onPersistReviewState,
  onCapturedPhotosChange,
  inspectionRecord = null,
  onTimerStart,
  onMarkInspectionComplete,
}: AssistedInspectionV3Props) {
  const [activePart, setActivePart] = useState<CarPart | null>(null);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [reviewedParts, setReviewedParts] = useState<Set<string>>(new Set());
  const [expandedArea, setExpandedArea] = useState<Area | null>(null);
  const [customParts, setCustomParts] = useState<CarPart[]>([]);
  const [showAddPartArea, setShowAddPartArea] = useState<Area | null>(null);
  const [newPartName, setNewPartName] = useState('');
  /** Desktop: open by default. Mobile: closed so the main area is usable (see initializer). */
  const [sidebarOpen, setSidebarOpen] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 768,
  );
  const [viewportZoom, setViewportZoom] = useState(1);
  /** Tap photo: hide viewport chrome and, when available, swap to API full-frame image (no arrows). */
  const [photoReviewFocus, setPhotoReviewFocus] = useState(false);
  const isMobile = useIsMobile();
  /** Drives live elapsed display while the review timer is running. */
  const [timerTick, setTimerTick] = useState(0);

  const bumpTimerIfNeeded = useCallback(() => {
    if (!onTimerStart) return;
    if (!inspectionRecord || inspectionRecord.status === 'completed' || inspectionRecord.timerStartedAt)
      return;
    onTimerStart();
  }, [onTimerStart, inspectionRecord]);

  useEffect(() => {
    if (!inspectionRecord || inspectionRecord.status === 'completed' || !inspectionRecord.timerStartedAt)
      return;
    const t = window.setInterval(() => setTimerTick((n) => n + 1), 1000);
    return () => window.clearInterval(t);
  }, [inspectionRecord?.timerStartedAt, inspectionRecord?.status]);

  const damageReportTiming = useMemo((): DamageReportTimingMeta => {
    const ir = inspectionRecord;
    return {
      timerStartedAtIso: ir?.timerStartedAt?.toISOString() ?? null,
      completedAtIso: ir?.completedAt?.toISOString() ?? null,
      durationSeconds:
        ir?.status === 'completed' && typeof ir.durationSeconds === 'number' ? ir.durationSeconds : null,
      inspectionStatus: ir?.status ?? 'in_progress',
    };
  }, [inspectionRecord]);

  const elapsedLiveSeconds = useMemo(() => {
    const ir = inspectionRecord;
    if (!ir?.timerStartedAt) return null;
    if (ir.status === 'completed' && typeof ir.durationSeconds === 'number') return ir.durationSeconds;
    return Math.max(0, Math.floor((Date.now() - ir.timerStartedAt.getTime()) / 1000));
  }, [inspectionRecord, timerTick]);

  const durationUiLabel = useMemo(() => {
    const ir = inspectionRecord;
    if (!ir?.timerStartedAt) return 'Not started';
    if (ir.status === 'completed' && typeof ir.durationSeconds === 'number')
      return `${formatDurationSeconds(ir.durationSeconds)} (completed)`;
    if (elapsedLiveSeconds != null) return `${formatDurationSeconds(elapsedLiveSeconds)} (in progress)`;
    return '—';
  }, [inspectionRecord, elapsedLiveSeconds]);

  /** Vehicle map panel: keep the top-down diagram visible by default (mobile users otherwise saw only the parts list). */
  const [mapDiagramCollapsed, setMapDiagramCollapsed] = useState(false);

  /** When false on mobile, part title + damage strip collapse to a thin bar so the image fills the screen. */
  const [partDetailExpanded, setPartDetailExpanded] = useState(
    () => typeof window === 'undefined' || window.innerWidth >= 768,
  );

  // Camera capture state
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhotoEntry[]>(() => initialCapturedPhotos ?? []);
  
  // Summary view state
  const [showSummary, setShowSummary] = useState(false);
  const [damageReportPreviewOpen, setDamageReportPreviewOpen] = useState(false);
  const [inspectionCompleteOpen, setInspectionCompleteOpen] = useState(false);
  const wasAllDetectionsReviewedRef = useRef(false);

  // Damage review navigation
  const [selectedDamageIdx, setSelectedDamageIdx] = useState(0);

  const { frames: allFrames, frameImages } = useMemo(
    () => buildCameraFramesFromResponse(payload),
    [payload],
  );

  /** Warm blob cache for every frame in this inspection (not only neighbors) so part switches feel faster. */
  useEffect(() => {
    prefetchUveyeImages(Object.values(frameImages));
  }, [frameImages]);

  const summaryPortalUrl = useMemo(() => buildUveyePortalSummaryUrl(payload), [payload]);

  const [damages, setDamages] = useState<Damage[]>([]);
  const didHydrateReview = useRef(false);

  useEffect(() => {
    didHydrateReview.current = false;
  }, [payload]);

  useEffect(() => {
    const fresh = mapUveyeAlertsToDamages(payload, allFrames, frameImages);
    const saved = initialReviewState?.damages as Damage[] | undefined;
    if (saved && Array.isArray(saved) && saved.length > 0) {
      setDamages(
        applyDefaultApprovedForManualDamages(mergePersistedDamagesWithFreshMap(saved, fresh)),
      );
    } else {
      setDamages(fresh);
    }
  }, [payload, allFrames, frameImages, initialReviewState]);

  useEffect(() => {
    if (didHydrateReview.current || !initialReviewState) return;
    const rp = initialReviewState.reviewedParts as string[] | undefined;
    if (rp && Array.isArray(rp)) setReviewedParts(new Set(rp));
    const cp = initialReviewState.customParts as CarPart[] | undefined;
    if (cp && Array.isArray(cp)) setCustomParts(cp);
    didHydrateReview.current = true;
  }, [initialReviewState]);

  useEffect(() => {
    if (!onPersistReviewState || !inspectionKey) return;
    const t = window.setTimeout(() => {
      onPersistReviewState({
        damages,
        reviewedParts: Array.from(reviewedParts),
        customParts,
      });
    }, 1200);
    return () => window.clearTimeout(t);
  }, [damages, reviewedParts, customParts, onPersistReviewState, inspectionKey]);

  useEffect(() => {
    onCapturedPhotosChange?.(capturedPhotos);
  }, [capturedPhotos, onCapturedPhotosChange]);

  const damagesWithDiagramTest = useMemo(() => {
    if (typeof window === 'undefined') return damages;
    if (new URLSearchParams(window.location.search).get('diagramTest') !== '1') return damages;
    return [...damages.filter((d) => d.frameId !== '__diagram_test__'), ...DIAGRAM_TEST_DAMAGES];
  }, [damages]);

  const allParts = [...CAR_PARTS, ...customParts];
  const partNames = useMemo(() => allParts.map((p) => p.name), [allParts]);

  const inspectorDamageTypesFromPayload = useMemo(() => {
    const set = new Set<string>();
    for (const t of collectHumanizedDamageTypesFromPayload(payload)) {
      set.add(t);
    }
    for (const d of damages) {
      if (!d.ai) continue;
      const raw = (d.type || '').trim();
      if (!raw) continue;
      set.add(humanizeDetectionType(raw));
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  }, [payload, damages]);

  /** UVeye frames for the part, or a single synthetic frame when the only evidence is an inspector photo. */
  const { partFrames, viewportFrameImages } = useMemo(() => {
    if (!activePart) return { partFrames: [] as UveyeCameraFrame[], viewportFrameImages: frameImages };
    const pfs = getFramesForPart(activePart, allFrames, damages);
    if (pfs.length > 0) return { partFrames: pfs, viewportFrameImages: frameImages };
    const cap = damages.find(
      (d) =>
        partNameMatches(activePart.name, d.part) && (d.captureDataUrl?.trim() || d.captureImageUrl?.trim()),
    );
    const url = (cap?.captureDataUrl ?? cap?.captureImageUrl)?.trim();
    if (!url) return { partFrames: pfs, viewportFrameImages: frameImages };
    const id = '__manual_evidence__';
    return {
      partFrames: [{ id, camera: 'Inspector photo', frameNum: 1 }],
      viewportFrameImages: { ...frameImages, [id]: url },
    };
  }, [activePart, allFrames, damages, frameImages]);
  const currentFrame = partFrames[currentFrameIdx] || null;

  const partDamages = useMemo(
    () => (activePart ? damages.filter((d) => partNameMatches(activePart.name, d.part)) : []),
    [activePart, damages],
  );
  const confirmedCount = damages.filter(d => d.confirmed === true).length;
  const dismissedCount = damages.filter(d => d.confirmed === false).length;
  const duplicateCount = damages.filter(d => d.isDuplicate).length;
  const flaggedCount = damages.filter(d => d.flagged).length;

  const selectPart = (part: CarPart, frameIdx?: number) => {
    bumpTimerIfNeeded();
    setActivePart(part);
    setCurrentFrameIdx(frameIdx !== undefined ? frameIdx : 0);
    setSelectedDamageIdx(0);
    setViewportZoom(1);
    setReviewedParts(prev => new Set(prev).add(part.name));
    if (isMobile) setSidebarOpen(false);
  };

  const toggleDuplicate = (id: number) => {
    setDamages(damages.map(d => (d.id === id ? { ...d, isDuplicate: !d.isDuplicate } : d)));
  };

  const toggleFlag = (id: number) => {
    setDamages(damages.map(d => (d.id === id ? { ...d, flagged: !d.flagged } : d)));
  };

  /** Per-detection review; each damage has `frameId` so counts reflect findings, not panels. */
  const setDamageConfirmed = useCallback((id: number, confirmed: boolean) => {
    setDamages(prev => prev.map(d => (d.id === id ? { ...d, confirmed } : d)));
  }, []);

  // When the visible frame changes, select the first detection for that frame so Approve/Reject match the image.
  useEffect(() => {
    if (!activePart || !currentFrame || partDamages.length === 0) return;
    const idx = partDamages.findIndex(d => d.frameId === currentFrame.id);
    if (idx >= 0) setSelectedDamageIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-sync on frame/part change, not on confirm (same frame, multiple detections)
  }, [currentFrame?.id, activePart?.name]);

  const partsWithDamage = useMemo(
    () =>
      sortPartsByPanelOrder(
        allParts.filter((p) => damages.some((d) => partNameMatches(p.name, d.part))),
      ),
    [allParts, damages],
  );

  const nextFrameOrPart = useCallback(() => {
    if (!activePart || partFrames.length === 0) return;
    if (currentFrameIdx < partFrames.length - 1) {
      setCurrentFrameIdx(i => i + 1);
      return;
    }
    const idx = partsWithDamage.findIndex(p => p.name === activePart.name);
    if (idx >= 0 && idx < partsWithDamage.length - 1) {
      const next = partsWithDamage[idx + 1];
      setActivePart(next);
      setCurrentFrameIdx(0);
      setSelectedDamageIdx(0);
      setViewportZoom(1);
      setReviewedParts(prev => new Set(prev).add(next.name));
    }
  }, [activePart, partFrames.length, currentFrameIdx, partsWithDamage]);

  const prevFrameOrPart = useCallback(() => {
    if (!activePart || partFrames.length === 0) return;
    if (currentFrameIdx > 0) {
      setCurrentFrameIdx(i => i - 1);
      return;
    }
    const idx = partsWithDamage.findIndex(p => p.name === activePart.name);
    if (idx > 0) {
      const prev = partsWithDamage[idx - 1];
      const pfs = getFramesForPart(prev, allFrames, damages);
      const last = Math.max(0, pfs.length - 1);
      setActivePart(prev);
      setCurrentFrameIdx(last);
      setSelectedDamageIdx(0);
      setViewportZoom(1);
      setReviewedParts(r => new Set(r).add(prev.name));
    }
  }, [activePart, partFrames.length, currentFrameIdx, partsWithDamage, allFrames, damages]);

  /** Approve/reject then advance to the next frame or part (same as the image “next” chevron). */
  const handleConfirmAndAdvance = useCallback(
    (id: number, confirmed: boolean) => {
      setDamageConfirmed(id, confirmed);
      nextFrameOrPart();
    },
    [setDamageConfirmed, nextFrameOrPart],
  );

  const viewportImageSrc = useMemo(() => {
    if (!currentFrame?.id) return '';
    const base = viewportFrameImages[currentFrame.id] ?? '';
    if (!photoReviewFocus) return base;
    if (!partDamages.length) return base;
    const d = partDamages[Math.min(selectedDamageIdx, partDamages.length - 1)];
    const clean = d?.cleanReviewImageUrl?.trim();
    return clean || base;
  }, [currentFrame?.id, viewportFrameImages, photoReviewFocus, partDamages, selectedDamageIdx]);

  useEffect(() => {
    if (!activePart || partFrames.length === 0) return;
    const prevId = partFrames[currentFrameIdx - 1]?.id;
    const nextId = partFrames[currentFrameIdx + 1]?.id;
    const curId = partFrames[currentFrameIdx]?.id;
    const dmg =
      partDamages.length > 0
        ? partDamages[Math.min(selectedDamageIdx, partDamages.length - 1)]
        : undefined;
    prefetchUveyeImages([
      curId ? viewportFrameImages[curId] : undefined,
      prevId ? viewportFrameImages[prevId] : undefined,
      nextId ? viewportFrameImages[nextId] : undefined,
      dmg?.cleanReviewImageUrl,
    ]);
  }, [activePart, partFrames, currentFrameIdx, viewportFrameImages, partDamages, selectedDamageIdx]);

  useEffect(() => {
    setViewportZoom(1);
    setPhotoReviewFocus(false);
  }, [currentFrame?.id]);

  useEffect(() => {
    setPhotoReviewFocus(false);
  }, [selectedDamageIdx, activePart?.name]);

  /** New part on mobile: start in image-focus (compact) mode. */
  useEffect(() => {
    if (!activePart) return;
    setPartDetailExpanded(!isMobile);
  }, [activePart?.name, isMobile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (!activePart || partFrames.length === 0) return;
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextFrameOrPart();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevFrameOrPart();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [activePart, partFrames.length, nextFrameOrPart, prevFrameOrPart]);

  const navNextEnabled = useMemo(() => {
    if (!activePart || partFrames.length === 0) return false;
    if (currentFrameIdx < partFrames.length - 1) return true;
    const idx = partsWithDamage.findIndex(p => p.name === activePart.name);
    return idx >= 0 && idx < partsWithDamage.length - 1;
  }, [activePart, partFrames, currentFrameIdx, partsWithDamage]);

  const navPrevEnabled = useMemo(() => {
    if (!activePart || partFrames.length === 0) return false;
    if (currentFrameIdx > 0) return true;
    const idx = partsWithDamage.findIndex(p => p.name === activePart.name);
    return idx > 0;
  }, [activePart, partFrames, currentFrameIdx, partsWithDamage]);

  const allDetectionsReviewed = useMemo(() => allDamageRowsReviewed(damages), [damages]);

  useEffect(() => {
    if (allDetectionsReviewed && !wasAllDetectionsReviewedRef.current) {
      setInspectionCompleteOpen(true);
    }
    wasAllDetectionsReviewedRef.current = allDetectionsReviewed;
  }, [allDetectionsReviewed]);

  const handleStartInspection = useCallback(() => {
    bumpTimerIfNeeded();
    const part = partsWithDamage[0];
    if (!part) return;
    const pfs = getFramesForPart(part, allFrames, damages);
    const partDmg = damages.filter((d) => partNameMatches(part.name, d.part));
    const firstDmg = partDmg[0];
    let frameIdx = 0;
    if (firstDmg && pfs.length > 0) {
      const fi = pfs.findIndex((f) => f.id === firstDmg.frameId);
      if (fi >= 0) frameIdx = fi;
    }
    setExpandedArea(part.area);
    selectPart(part, frameIdx);
    if (!isMobile) setSidebarOpen(true);
  }, [partsWithDamage, allFrames, damages, isMobile, selectPart, bumpTimerIfNeeded]);

  const getPartDamageCount = (partName: string) =>
    damages.filter(d => partNameMatches(partName, d.part)).length;
  const getPartHasDamage = (partName: string) =>
    damages.some(d => partNameMatches(partName, d.part));

  const addCustomPart = (area: Area) => {
    if (!newPartName.trim()) return;
    const newPart: CarPart = {
      name: newPartName.trim(),
      area,
      cameras: ['cam_02'],
      bestCamera: 'cam_02',
      bestFrameNum: 1,
    };
    setCustomParts([...customParts, newPart]);
    setNewPartName('');
    setShowAddPartArea(null);
  };

  const toggleWalkaroundCheck = (partName: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setReviewedParts(prev => {
      const next = new Set(prev);
      if (next.has(partName)) next.delete(partName);
      else next.add(partName);
      return next;
    });
  };

  // If summary view is active, show it instead
  if (showSummary) {
    return (
      <InspectionSummary
        vehicleLabel={vehicleLabel || 'Vehicle'}
        damages={damages}
        payload={payload}
        onBack={() => setShowSummary(false)}
        capturedPhotos={capturedPhotos}
        durationUiLabel={durationUiLabel}
        timing={damageReportTiming}
      />
    );
  }

  const renderVehicleMapSidebar = () => (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Toolbar stays fixed; diagram + parts share one scroll (full diagram when shown — never clipped in its own scroll box). */}
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Vehicle Map</span>
        <button
          type="button"
          onClick={() => setMapDiagramCollapsed((v) => !v)}
          className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          {mapDiagramCollapsed ? 'Show diagram' : 'Hide diagram'}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] touch-pan-y">
        {!mapDiagramCollapsed && (
          <div className="border-b border-border px-2 pb-4 pt-1">
            <div className="flex justify-center">
              <MiniCarDiagram
                activePart={activePart}
                damages={damagesWithDiagramTest}
                vehicleType={vehicleType}
                onSelectPartByName={(name) => {
                  const part = allParts.find((p) => p.name === name);
                  if (part) {
                    setExpandedArea(part.area);
                    selectPart(part);
                  }
                }}
              />
            </div>
          </div>
        )}
        <div className="px-3 py-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Parts</span>
        </div>
        <div className="space-y-0.5 px-2 pb-4">
          {ALL_AREAS.map((area) => {
            const areaParts = sortPartsByPanelOrder(allParts.filter((p) => p.area === area));
            const areaHasDamage = areaParts.some((p) => getPartHasDamage(p.name));
            const areaDamageCount = areaParts.reduce((sum, p) => sum + getPartDamageCount(p.name), 0);
            const reviewedCount = areaParts.filter((p) => reviewedParts.has(p.name)).length;
            const isExpanded = expandedArea === area || activePart?.area === area;

            return (
              <div key={area}>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      const allDone = areaParts.every((p) => reviewedParts.has(p.name));
                      setReviewedParts((prev) => {
                        const next = new Set(prev);
                        areaParts.forEach((p) => {
                          if (allDone) next.delete(p.name);
                          else next.add(p.name);
                        });
                        return next;
                      });
                    }}
                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                      ${reviewedCount === areaParts.length ? 'bg-primary border-primary'
                        : reviewedCount > 0 ? 'bg-primary/30 border-primary/50'
                        : 'border-border hover:border-primary/50'}`}
                  >
                    {reviewedCount === areaParts.length && <Check size={10} className="text-primary-foreground" />}
                    {reviewedCount > 0 && reviewedCount < areaParts.length && (
                      <div className="w-1.5 h-0.5 bg-primary-foreground rounded" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpandedArea(isExpanded && expandedArea === area ? null : area)}
                    className={`flex-1 flex items-center justify-between px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors
                      ${isExpanded ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent'}`}
                  >
                    <span className="flex items-center gap-2">
                      <ChevronDown size={12} className={`transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                      {area}
                      {areaHasDamage && <span className="w-1.5 h-1.5 rounded-full bg-destructive" />}
                      {areaDamageCount > 0 && (
                        <span className="min-w-[16px] h-[16px] rounded-full bg-destructive text-background flex items-center justify-center text-[9px] font-bold">
                          {areaDamageCount}
                        </span>
                      )}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {reviewedCount}/{areaParts.length}
                    </span>
                  </button>
                </div>

                {isExpanded && (
                  <div className="ml-5 mt-0.5 space-y-0.5">
                    {areaParts.map((part) => {
                      const dmgCount = getPartDamageCount(part.name);
                      const isActive = activePart?.name === part.name;
                      const reviewed = reviewedParts.has(part.name);
                      return (
                        <div key={part.name} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => toggleWalkaroundCheck(part.name, e)}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                              ${reviewed ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'}`}
                          >
                            {reviewed && <Check size={10} className="text-primary-foreground" />}
                          </button>
                          <button
                            type="button"
                            onClick={() => selectPart(part)}
                            className={`flex-1 flex items-center justify-between px-2 py-1 rounded-md text-xs transition-all
                              ${isActive ? 'bg-primary text-primary-foreground font-bold'
                                : reviewed ? 'text-primary/80 hover:bg-primary/5 font-medium line-through opacity-70'
                                : dmgCount === 0 ? 'text-muted-foreground/50 hover:bg-accent font-medium opacity-40'
                                : 'text-foreground hover:bg-accent font-medium'}`}
                          >
                            <span className="truncate">{part.name}</span>
                            {dmgCount > 0 && (
                              <span
                                className={`min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold
                                ${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive text-background'}`}
                              >
                                {dmgCount}
                              </span>
                            )}
                          </button>
                        </div>
                      );
                    })}
                    {showAddPartArea === area ? (
                      <div className="border border-border rounded-lg p-2 space-y-2 mt-1">
                        <input
                          type="text"
                          value={newPartName}
                          onChange={(e) => setNewPartName(e.target.value)}
                          placeholder="Part name..."
                          autoFocus
                          onKeyDown={(e) => e.key === 'Enter' && addCustomPart(area)}
                          className="w-full px-2 py-1.5 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
                        />
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => addCustomPart(area)}
                            className="flex-1 px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowAddPartArea(null);
                              setNewPartName('');
                            }}
                            className="px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddPartArea(area);
                          setNewPartName('');
                        }}
                        className="w-full flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors mt-0.5"
                      >
                        <Plus size={10} /> Add Part
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  return (
    <div
      className="flex flex-col h-dvh min-h-0 w-full bg-muted font-sans text-foreground overflow-hidden"
      onPointerDownCapture={() => bumpTimerIfNeeded()}
    >
      {/* Camera Capture Modal */}
      {showCameraCapture && (
        <CameraCapture
          partNames={partNames}
          suggestedPartName={activePart?.name}
          additionalDamageTypes={inspectorDamageTypesFromPayload}
          onCapture={(capturePayload) => {
            const ts = new Date();
            setCapturedPhotos((prev) => [...prev, { ...capturePayload, timestamp: ts }]);
            setDamages((prev) => [
              ...prev,
              {
                id: Date.now() + Math.floor(Math.random() * 1000),
                part: capturePayload.partName,
                type: capturePayload.damageType,
                severity: 'Medium',
                ai: false,
                x: 50,
                y: 50,
                frameId: '__manual_capture__',
                confirmed: true,
                damageName: capturePayload.damageType,
                captureId: capturePayload.captureId,
                captureDataUrl: capturePayload.dataUrl,
              },
            ]);
            setShowCameraCapture(false);
          }}
          onClose={() => setShowCameraCapture(false)}
        />
      )}

      <DamageReportPreviewDialog
        open={damageReportPreviewOpen}
        onOpenChange={setDamageReportPreviewOpen}
        payload={payload}
        damages={damages}
        vehicleLabel={vehicleLabel}
        timing={damageReportTiming}
      />

      <Dialog open={inspectionCompleteOpen} onOpenChange={setInspectionCompleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>All detections reviewed</DialogTitle>
            <DialogDescription>
              No detections are left to approve or reject. Use <strong>Mark complete</strong> in the header when
              you are finished to freeze the timer for this browser, or keep browsing the vehicle map.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" onClick={() => setInspectionCompleteOpen(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Desktop / tablet header */}
      <div className="hidden md:flex items-center justify-between px-5 py-3 bg-card border-b border-border shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          {damages.length > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-border bg-destructive/10 px-2.5 py-1.5 text-destructive shrink-0"
              title="Total AI / manual detections across all panels"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden />
              <span className="text-xs font-bold tabular-nums">{damages.length}</span>
            </div>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0"
              title="Back to inspections"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <img
            src="/favicon.png"
            alt=""
            width={56}
            height={56}
            className="h-12 w-12 shrink-0 rounded-xl object-contain bg-muted ring-1 ring-border"
          />
          <div className="min-w-0">
            <h1 className="font-bold text-base tracking-tight truncate">{vehicleLabel || 'AutoInspect'}</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs text-muted-foreground">FEP092 FL</p>
              {summaryPortalUrl && (
                <a
                  href={summaryPortalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <ExternalLink size={12} className="shrink-0" />
                  Open inspection in UVeye (summary)
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 lg:gap-3 shrink-0 flex-wrap justify-end">
          <div
            className={cn(
              'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 tabular-nums text-xs font-medium',
              inspectionRecord?.timerStartedAt && inspectionRecord?.status !== 'completed'
                ? 'border-amber-500/50 bg-amber-500/10 text-amber-950 dark:text-amber-100'
                : 'border-border bg-muted/40 text-muted-foreground',
            )}
            title="Review timer (this device)"
          >
            <Timer size={14} className="shrink-0" aria-hidden />
            <span>
              {!inspectionRecord?.timerStartedAt
                ? '—'
                : formatDurationSeconds(
                    inspectionRecord.status === 'completed' &&
                      typeof inspectionRecord.durationSeconds === 'number'
                      ? inspectionRecord.durationSeconds
                      : (elapsedLiveSeconds ?? 0),
                  )}
            </span>
            {inspectionRecord?.timerStartedAt && inspectionRecord.status !== 'completed' ? (
              <span className="text-[10px] font-normal opacity-80">Live</span>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="shrink-0 gap-1"
            disabled={!allDetectionsReviewed || inspectionRecord?.status === 'completed' || !onMarkInspectionComplete}
            onClick={() => onMarkInspectionComplete?.()}
            title={
              !allDetectionsReviewed
                ? 'Approve or reject every detection row first'
                : inspectionRecord?.status === 'completed'
                  ? 'Already marked complete on this device'
                  : 'Freeze timer and mark complete locally'
            }
          >
            <CheckCircle size={14} className="shrink-0" aria-hidden />
            {inspectionRecord?.status === 'completed' ? 'Completed' : 'Mark complete'}
          </Button>
          <button
            type="button"
            onClick={() => setShowCameraCapture(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
            title="Capture missed damage — add a photo, then choose car part and damage type"
          >
            <Camera size={14} /> Missed damage
          </button>
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
            title="View Summary & stats"
          >
            <FileText size={14} /> Summary &amp; stats
          </button>
          <button
            type="button"
            onClick={() => setDamageReportPreviewOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
            title="Preview damage report table, then download CSV"
          >
            <Table2 size={14} /> Damage report
          </button>
          <div className="text-right">
            <p className="text-xs font-semibold text-foreground">{reviewedParts.size} of {allParts.length} parts</p>
            <div className="w-32 h-1.5 bg-muted rounded-full mt-1 overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${(reviewedParts.size / allParts.length) * 100}%` }}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="bg-accent text-accent-foreground px-2 py-1 rounded-md font-medium">{confirmedCount} ✓</span>
            <span className="bg-destructive/10 text-destructive px-2 py-1 rounded-md font-medium">{dismissedCount} ✗</span>
            {duplicateCount > 0 && (
              <span className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-semibold inline-flex items-center gap-1.5 shadow-sm">
                <Copy size={14} className="shrink-0" aria-hidden />
                {duplicateCount} duplicate{duplicateCount !== 1 ? 's' : ''}
              </span>
            )}
            {flaggedCount > 0 && (
              <span className="bg-amber-500/15 text-amber-800 dark:text-amber-200 px-2 py-1 rounded-md font-medium inline-flex items-center gap-1">
                <Flag size={10} /> {flaggedCount}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={sidebarOpen ? 'Hide vehicle map' : 'Show vehicle map'}
          >
            {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>

      {/* Mobile header — stacked rows, icon actions */}
      <div className="flex md:hidden flex-col gap-2 px-3 py-2.5 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {damages.length > 0 && (
            <div
              className="flex items-center gap-1 rounded-lg border border-border bg-destructive/10 px-2 py-1 text-destructive shrink-0"
              title="Total detections"
            >
              <AlertTriangle size={14} aria-hidden />
              <span className="text-xs font-bold tabular-nums">{damages.length}</span>
            </div>
          )}
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="p-1.5 rounded-lg text-muted-foreground hover:bg-accent shrink-0"
              title="Back"
            >
              <ChevronLeft size={20} />
            </button>
          )}
          <img
            src="/favicon.png"
            alt=""
            width={48}
            height={48}
            className="h-11 w-11 shrink-0 rounded-lg object-contain bg-muted ring-1 ring-border"
          />
          <h1 className="font-bold text-sm leading-tight truncate flex-1 min-w-0">{vehicleLabel || 'AutoInspect'}</h1>
          <button
            type="button"
            onClick={() => setShowCameraCapture(true)}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-accent shrink-0"
            title="Capture missed damage — photo, then part and damage type"
          >
            <Camera size={18} aria-hidden />
            <span className="sr-only">Capture missed damage</span>
          </button>
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-accent shrink-0"
            title="Summary & stats"
          >
            <FileText size={18} />
          </button>
          <button
            type="button"
            onClick={() => setDamageReportPreviewOpen(true)}
            className="p-2 rounded-lg border border-border text-muted-foreground hover:bg-accent shrink-0"
            title="Preview damage report table, then download CSV"
          >
            <Table2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg border border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 shrink-0"
            title="Vehicle map & parts"
          >
            <LayoutGrid size={18} />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          {summaryPortalUrl ? (
            <a
              href={summaryPortalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary font-medium truncate min-w-0"
            >
              <ExternalLink size={11} className="shrink-0" />
              <span className="truncate">UVeye summary</span>
            </a>
          ) : (
            <span />
          )}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <div
              className={cn(
                'inline-flex items-center gap-1 rounded-md border px-2 py-0.5 tabular-nums text-[11px] font-medium text-foreground',
                inspectionRecord?.timerStartedAt && inspectionRecord?.status !== 'completed'
                  ? 'border-amber-500/50 bg-amber-500/10'
                  : 'border-border bg-muted/40',
              )}
            >
              <Timer size={12} aria-hidden />
              {!inspectionRecord?.timerStartedAt
                ? '—'
                : formatDurationSeconds(
                    inspectionRecord.status === 'completed' &&
                      typeof inspectionRecord.durationSeconds === 'number'
                      ? inspectionRecord.durationSeconds
                      : (elapsedLiveSeconds ?? 0),
                  )}
              {inspectionRecord?.timerStartedAt && inspectionRecord.status !== 'completed' ? (
                <span className="text-[9px] font-normal opacity-80">live</span>
              ) : null}
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-7 px-2 text-[11px] gap-1"
              disabled={!allDetectionsReviewed || inspectionRecord?.status === 'completed' || !onMarkInspectionComplete}
              onClick={() => onMarkInspectionComplete?.()}
            >
              <CheckCircle size={12} aria-hidden />
              {inspectionRecord?.status === 'completed' ? 'Done' : 'Complete'}
            </Button>
            <span className="tabular-nums text-foreground font-medium">
              {reviewedParts.size}/{allParts.length} parts
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="h-1.5 flex-1 min-w-[100px] bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${(reviewedParts.size / allParts.length) * 100}%` }}
            />
          </div>
          <span className="text-[10px] bg-accent text-accent-foreground px-1.5 py-0.5 rounded font-medium">{confirmedCount} ✓</span>
          <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-medium">{dismissedCount} ✗</span>
          {duplicateCount > 0 && (
            <span className="text-[10px] bg-blue-600 text-white px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5">
              <Copy size={10} /> {duplicateCount}
            </span>
          )}
          {flaggedCount > 0 && (
            <span className="text-[10px] bg-amber-500/15 text-amber-800 dark:text-amber-200 px-1.5 py-0.5 rounded font-medium inline-flex items-center gap-0.5">
              <Flag size={9} /> {flaggedCount}
            </span>
          )}
        </div>
      </div>

      {partsWithDamage.length > 0 && !activePart && (
        <div className="flex shrink-0 flex-col gap-2 border-b border-border bg-primary/5 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">Start inspection</span> — {damages.length}{' '}
            detection{damages.length !== 1 ? 's' : ''} across {partsWithDamage.length} part
            {partsWithDamage.length !== 1 ? 's' : ''}. Jumps to the first part in walk order with the matching
            frame.
          </p>
          <Button type="button" onClick={handleStartInspection} className="shrink-0 gap-2" size="sm">
            <Play size={16} className="shrink-0" aria-hidden />
            Start inspection
          </Button>
        </div>
      )}

      {/* MAIN CONTENT — image viewport + collapsible right sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* IMAGE VIEWPORT (always visible, takes remaining space) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {activePart ? (
            <>
              {/* Mobile image-focus: single thin bar + quick actions */}
              {isMobile && !partDetailExpanded && (
                <div className="flex items-center gap-1.5 border-b border-border bg-card/95 px-2 py-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPartDetailExpanded(true)}
                    className="shrink-0 rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    title="Show full details"
                    aria-label="Show full details"
                  >
                    <ChevronDown size={18} />
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">{activePart.name}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {partDamages.length > 0
                        ? (() => {
                            const d = partDamages[Math.min(selectedDamageIdx, partDamages.length - 1)];
                            return d ? d.damageName || d.type || 'Detection' : '';
                          })()
                        : currentFrame
                          ? `${currentFrame.camera} · f${currentFrame.frameNum}`
                          : 'No image'}
                    </p>
                  </div>
                  {partDamages.length > 0 &&
                    (() => {
                      const clampedIdx = Math.min(selectedDamageIdx, partDamages.length - 1);
                      const dmg = partDamages[clampedIdx];
                      if (!dmg) return null;
                      return (
                        <div className="flex shrink-0 items-center gap-0.5">
                          <button
                            type="button"
                            title="Approve"
                            onClick={() => handleConfirmAndAdvance(dmg.id, true)}
                            className={`rounded-md p-1.5 ${dmg.confirmed === true ? 'bg-green-700 text-white' : 'bg-green-600 text-white hover:bg-green-700'}`}
                          >
                            <CheckCircle size={18} />
                          </button>
                          <button
                            type="button"
                            title="Reject"
                            onClick={() => handleConfirmAndAdvance(dmg.id, false)}
                            className={`rounded-md p-1.5 ${dmg.confirmed === false ? 'bg-red-600 text-white' : 'bg-red-500 text-white hover:bg-red-600'}`}
                          >
                            <XCircle size={18} />
                          </button>
                          <button
                            type="button"
                            title="Duplicate"
                            onClick={() => toggleDuplicate(dmg.id)}
                            className={`rounded-md p-1.5 ${dmg.isDuplicate ? 'text-blue-600' : 'text-muted-foreground hover:bg-muted'}`}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            type="button"
                            title="Flag"
                            onClick={() => toggleFlag(dmg.id)}
                            className={`rounded-md p-1.5 ${dmg.flagged ? 'text-amber-600' : 'text-muted-foreground hover:bg-muted'}`}
                          >
                            <Flag size={16} />
                          </button>
                        </div>
                      );
                    })()}
                  <button
                    type="button"
                    onClick={() => setActivePart(null)}
                    className="shrink-0 rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
              )}

              {/* Part header bar + damage strip (full — desktop always; mobile when expanded) */}
              {(partDetailExpanded || !isMobile) && (
              <>
              <div className="flex items-center justify-between gap-2 px-3 py-2 sm:px-4 bg-card/80 backdrop-blur border-b border-border shrink-0">
                <div className="flex min-w-0 flex-1 items-start gap-2">
                  <button
                    type="button"
                    onClick={() => setPartDetailExpanded(false)}
                    className="mt-0.5 hidden shrink-0 rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground md:hidden"
                    title="Focus on image"
                    aria-label="Focus on image"
                  >
                    <ChevronUp size={18} />
                  </button>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-foreground sm:text-lg">{activePart.name}</h2>
                    <p className="hidden text-xs text-muted-foreground md:block">
                      {currentFrame ? `${currentFrame.camera} • Frame ${currentFrame.frameNum}` : 'No images'} • {partFrames.length} image{partFrames.length !== 1 ? 's' : ''} • {partDamages.length} detection{partDamages.length !== 1 ? 's' : ''}
                    </p>
                    <p className="text-[11px] text-muted-foreground md:hidden truncate">
                      {currentFrame ? `${currentFrame.camera} · f${currentFrame.frameNum}` : 'No images'} · {partFrames.length} img · {partDamages.length} det
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActivePart(null)}
                    className="rounded-lg px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    Close
                  </button>
                </div>
              </div>

              {/* Damage review strip — navigation, approve/reject (per detection + frameId), duplicate/flag */}
              {partDamages.length > 0 && (() => {
                const clampedIdx = Math.min(selectedDamageIdx, partDamages.length - 1);
                const dmg = partDamages[clampedIdx];
                if (!dmg) return null;
                const dmgFrame = allFrames.find(f => f.id === dmg.frameId);
                return (
                  <div className="flex max-h-[40vh] touch-pan-y flex-wrap items-center gap-2 overflow-y-auto overscroll-contain border-b border-border bg-card px-3 py-2 shrink-0 md:max-h-none md:gap-3 md:px-4">
                    {/* Navigation between damages */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setSelectedDamageIdx(Math.max(0, clampedIdx - 1))}
                        disabled={clampedIdx === 0}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <span className="text-xs font-semibold text-foreground min-w-[40px] text-center">{clampedIdx + 1}/{partDamages.length}</span>
                      <button
                        onClick={() => setSelectedDamageIdx(Math.min(partDamages.length - 1, clampedIdx + 1))}
                        disabled={clampedIdx === partDamages.length - 1}
                        className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    {/* Damage info — name from API + classification `type` */}
                    <div className="min-w-0 flex-1">
                      {dmg.damageName ? (
                        <p className="text-sm font-bold leading-snug text-foreground break-words md:text-base" title={dmg.damageName}>
                          {dmg.damageName}
                        </p>
                      ) : null}
                      <p className={`font-semibold text-foreground ${dmg.damageName ? 'mt-0.5 text-sm md:text-base' : 'text-sm md:text-base'}`}>
                        <span className="text-muted-foreground font-normal text-xs mr-1.5">Type</span>
                        {dmg.type || '—'}
                      </p>
                      {(dmg.confirmed === true || dmg.confirmed === false || dmg.isDuplicate || dmg.flagged) && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {dmg.confirmed === true && (
                            <span className="text-[10px] font-medium text-green-700 dark:text-green-400 inline-flex items-center gap-0.5">
                              <CheckCircle size={10} /> Approved
                            </span>
                          )}
                          {dmg.confirmed === false && (
                            <span className="text-[10px] font-medium text-red-700 dark:text-red-400 inline-flex items-center gap-0.5">
                              <XCircle size={10} /> Rejected
                            </span>
                          )}
                          {dmg.isDuplicate && (
                            <span className="text-[10px] font-medium text-blue-700 dark:text-blue-300 inline-flex items-center gap-0.5">
                              <Copy size={10} /> Duplicate
                            </span>
                          )}
                          {dmg.flagged && (
                            <span className="text-[10px] font-medium text-amber-700 dark:text-amber-300 inline-flex items-center gap-0.5">
                              <Flag size={10} /> Flagged
                            </span>
                          )}
                        </div>
                      )}
                      {dmgFrame ? (
                        <div className="flex flex-wrap items-center gap-2 mt-1.5">
                          {(() => {
                            const atlasViewerUrl = resolveDamageAtlasPortalUrl(dmg, payload, dmgFrame);
                            if (atlasViewerUrl) {
                              return (
                                <a
                                  href={atlasViewerUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  title="Open this camera and frame in the UVeye web app (Atlas)"
                                  className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline"
                                >
                                  <ExternalLink size={12} />
                                  {dmgFrame.camera} • Frame {dmgFrame.frameNum}
                                </a>
                              );
                            }
                            return (
                              <span
                                className="text-[10px] text-muted-foreground"
                                title="Cannot build Atlas link — missing org, site, inspection id, or camera in the payload."
                              >
                                <LinkIcon size={10} className="inline mr-0.5" />
                                {dmgFrame.camera} • Frame {dmgFrame.frameNum}
                              </span>
                            );
                          })()}
                        </div>
                      ) : (() => {
                        const atlasOnly = resolveDamageAtlasPortalUrl(dmg, payload, null);
                        if (atlasOnly) {
                          return (
                            <div className="mt-1.5">
                              <a
                                href={atlasOnly}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open this detection in the UVeye web app (Atlas)"
                                className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline"
                              >
                                <ExternalLink size={12} />
                                Open in UVeye (Atlas)
                              </a>
                            </div>
                          );
                        }
                        if (summaryPortalUrl) {
                          return (
                            <div className="mt-1.5">
                              <a
                                href={summaryPortalUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                title="Open this inspection in the UVeye web app (summary)"
                                className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-primary hover:underline"
                              >
                                <ExternalLink size={12} />
                                Open in UVeye (summary)
                              </a>
                            </div>
                          );
                        }
                        return null;
                      })()}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 shrink-0 justify-end">
                      <button
                        type="button"
                        title="Approve this detection for this frame (counts in header & summary), then go to next image"
                        onClick={() => handleConfirmAndAdvance(dmg.id, true)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all shadow-sm ${dmg.confirmed === true ? 'bg-green-700 border-green-600 text-white ring-2 ring-green-400/40' : 'bg-green-600 border-green-600 text-white hover:bg-green-700'}`}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        title="Reject this detection for this frame (counts in header & summary), then go to next image"
                        onClick={() => handleConfirmAndAdvance(dmg.id, false)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all shadow-sm ${dmg.confirmed === false ? 'bg-red-700 border-red-600 text-white ring-2 ring-red-400/40' : 'bg-red-600 border-red-600 text-white hover:bg-red-700'}`}
                      >
                        <XCircle size={14} /> Reject
                      </button>
                      <button
                        type="button"
                        title="Mark as duplicate view of the same real-world damage (another angle)"
                        onClick={() => toggleDuplicate(dmg.id)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${dmg.isDuplicate ? 'bg-blue-600 border-blue-600 text-white shadow-sm' : 'border-blue-500 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/40'}`}
                      >
                        <Copy size={14} /> Duplicate
                      </button>
                      <button
                        type="button"
                        title="Flag for internal follow-up (QA, billing, re-check). Does not approve or reject the finding."
                        onClick={() => toggleFlag(dmg.id)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${dmg.flagged ? 'bg-amber-500/20 border-amber-500/50 text-amber-900 dark:text-amber-100' : 'border-border text-muted-foreground hover:bg-muted/60'}`}
                      >
                        <Flag size={12} /> Flag
                      </button>
                    </div>
                  </div>
                );
              })()}
              </>
              )}

              <div className="flex-1 relative bg-viewport flex flex-col min-h-0">
                <div
                  className="flex-1 relative min-h-0 overflow-hidden flex flex-col"
                  style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, hsl(215 28% 22%) 0%, hsl(215 28% 12%) 100%)' }}
                >
                  {currentFrame && viewportImageSrc ? (
                    <InspectionViewportImage
                      src={viewportImageSrc}
                      alt={`${currentFrame.camera} frame ${currentFrame.frameNum}`}
                      zoom={viewportZoom}
                      onZoomChange={setViewportZoom}
                      onPhotoTap={() => setPhotoReviewFocus((v) => !v)}
                    />
                  ) : (
                    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground/60 py-12 min-h-0">
                      <ImageIcon size={48} strokeWidth={1} />
                      <p className="text-sm font-medium">No image available</p>
                      <p className="text-xs">No camera captures for this part yet</p>
                    </div>
                  )}
                </div>

                {/* Zoom + keyboard hint */}
                {currentFrame && viewportFrameImages[currentFrame.id] && !photoReviewFocus && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 bg-card/95 backdrop-blur-md border border-border rounded-lg p-1 shadow-lg z-10">
                    <button
                      type="button"
                      onClick={() => setViewportZoom((z) => Math.min(4, z + 0.15))}
                      className="p-1.5 rounded-md hover:bg-muted text-foreground"
                      title="Zoom in"
                    >
                      <ZoomIn size={16} />
                    </button>
                    <span className="text-[10px] font-mono text-muted-foreground min-w-[2.5rem] text-center">{Math.round(viewportZoom * 100)}%</span>
                    <button
                      type="button"
                      onClick={() => setViewportZoom((z) => Math.max(1, z - 0.15))}
                      className="p-1.5 rounded-md hover:bg-muted text-foreground"
                      title="Zoom out"
                    >
                      <ZoomOut size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewportZoom(1)}
                      className="px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                      title="Fit full image in view"
                    >
                      Fit
                    </button>
                  </div>
                )}
                {photoReviewFocus ? (
                  <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 z-10 text-[10px] text-background/90 bg-foreground/45 px-2 py-0.5 rounded-full max-w-[92%] text-center">
                    Tap the photo again for zoom, frame dots, and navigation
                  </div>
                ) : (
                  <>
                    <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 z-10 hidden sm:block text-[10px] text-background/80 bg-foreground/30 px-2 py-0.5 rounded-full max-w-[90%] text-center">
                      ← → frames · scroll zooms when fit · when zoomed scroll pans, Ctrl+scroll zooms · drag to pan · pinch to zoom (touch)
                    </div>
                    <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 z-10 sm:hidden text-[10px] text-background/90 bg-foreground/40 px-2 py-0.5 rounded-full max-w-[92%] text-center">
                      Pinch to zoom · tap photo to hide on-screen controls (and arrows when a clean frame is available)
                    </div>
                  </>
                )}

                {partFrames.length > 0 && (partFrames.length > 1 || navNextEnabled || navPrevEnabled) && !photoReviewFocus && (
                  <>
                    <button
                      type="button"
                      onClick={prevFrameOrPart}
                      disabled={!navPrevEnabled}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-foreground/40 backdrop-blur-md text-background rounded-full flex items-center justify-center disabled:opacity-20 active:bg-foreground/60 transition-all shadow-lg z-10"
                    >
                      <ChevronLeft size={24} />
                    </button>
                    <button
                      type="button"
                      onClick={nextFrameOrPart}
                      disabled={!navNextEnabled}
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-foreground/40 backdrop-blur-md text-background rounded-full flex items-center justify-center disabled:opacity-20 active:bg-foreground/60 transition-all shadow-lg z-10"
                    >
                      <ChevronRight size={24} />
                    </button>
                  </>
                )}

                {partFrames.length > 0 && !photoReviewFocus && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-1 bg-foreground/30 backdrop-blur-md px-3 py-2 rounded-full items-center max-w-[90%] overflow-x-auto z-10">
                  {partFrames.map((frame, idx) => {
                    const hasDamage = partDamages.some(d => d.frameId === frame.id);
                    const prevCam = idx > 0 ? partFrames[idx - 1].camera : null;
                    const showDivider = prevCam && prevCam !== frame.camera;
                    return (
                      <React.Fragment key={frame.id}>
                        {showDivider && <div className="w-px h-3 bg-background/30 mx-0.5 shrink-0" />}
                        <button
                          type="button"
                          onClick={() => setCurrentFrameIdx(idx)}
                          className={`relative shrink-0 transition-all w-2.5 h-2.5 rounded-full
                            ${currentFrameIdx === idx ? 'bg-background scale-150' : 'bg-background/40'}`}
                        >
                          {hasDamage && <div className="absolute -top-1 -right-1 w-1.5 h-1.5 bg-destructive rounded-full" />}
                        </button>
                      </React.Fragment>
                    );
                  })}
                </div>
                )}

                {currentFrame && !photoReviewFocus && (
                  <div className="absolute top-3 left-3 bg-foreground/40 backdrop-blur-md text-background text-xs px-3 py-1.5 rounded-lg font-mono z-10">
                    {currentFrame.camera} • f{currentFrame.frameNum}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state when no part selected */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-4 sm:px-8 min-h-0 overflow-y-auto overscroll-contain py-4">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4 shrink-0">
                <AlertTriangle size={28} className="opacity-30" />
              </div>
              <h2 className="text-lg sm:text-xl font-bold text-foreground mb-2 text-center px-2">
                Select a part to inspect
              </h2>
              <p className="text-sm text-center max-w-xs">
                <span className="hidden md:inline">
                  Pick a part from the list on the right.
                </span>
                <span className="md:hidden">
                  Use the map below or tap <strong className="text-foreground">Map</strong> for the full parts list.
                </span>
              </p>
              {isMobile && (
                <div className="mt-4 w-full max-w-[min(100%,280px)] shrink-0 flex flex-col items-center">
                  <MiniCarDiagram
                    activePart={activePart}
                    damages={damagesWithDiagramTest}
                    vehicleType={vehicleType}
                    onSelectPartByName={(name) => {
                      const part = allParts.find((p) => p.name === name);
                      if (part) selectPart(part);
                    }}
                  />
                </div>
              )}
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="md:hidden mt-5 inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold shadow-sm active:scale-[0.98] transition-transform shrink-0"
              >
                <LayoutGrid size={18} />
                Open vehicle map
              </button>
            </div>
          )}
        </div>

        {/* Mobile: vehicle map + parts in a sheet (main column stays full width) */}
        {isMobile && (
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetContent
              side="right"
              className="w-[min(100vw,22rem)] sm:max-w-md p-0 gap-0 flex flex-col h-[100dvh] max-h-[100dvh] overflow-hidden border-l bg-card"
            >
              <SheetHeader className="px-4 py-3 border-b border-border shrink-0 space-y-0 text-left">
                <SheetTitle className="text-base pr-8">Vehicle map & parts</SheetTitle>
                <SheetDescription className="sr-only">
                  Browse areas and parts, or open the vehicle diagram to select a panel.
                </SheetDescription>
              </SheetHeader>
              <div className="flex flex-1 flex-col min-h-0 overflow-hidden bg-card">{renderVehicleMapSidebar()}</div>
            </SheetContent>
          </Sheet>
        )}

        {/* Desktop / tablet: collapsible right sidebar */}
        <div
          className={cn(
            'hidden md:flex bg-card border-l border-border flex-col shrink-0 transition-all duration-300 overflow-hidden',
            sidebarOpen ? 'w-[320px]' : 'w-0',
          )}
        >
          {sidebarOpen && <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">{renderVehicleMapSidebar()}</div>}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Mini Car Diagram — click a panel to jump to that part’s damages (same as parts list)
   ────────────────────────────────────────────── */

/** Same pixel space as `sedan-unified.svg` / `SEDAN_LAYOUT_BASE_PX`. */
const SEDAN_LAYOUT_VIEWBOX = { w: SEDAN_LAYOUT_BASE_PX.w, h: SEDAN_LAYOUT_BASE_PX.h } as const;

/** Match `interior-damages-sketch.svg` / `undercarriage-sketch.svg` viewBoxes. */
const INTERIOR_SKETCH_VIEWBOX = { w: 197, h: 252 } as const;
const UNDERCARRIAGE_SKETCH_VIEWBOX = { w: 126, h: 288 } as const;

function MiniCarDiagram({
  activePart,
  damages,
  vehicleType = 'sedan',
  onSelectPartByName,
}: {
  activePart: CarPart | null;
  damages: Damage[];
  vehicleType?: BodyType;
  onSelectPartByName?: (partName: string) => void;
}) {
  /** Top-down exterior sketch vs placeholder interior vs undercarriage schematic */
  const [diagramSurface, setDiagramSurface] = React.useState<'exterior' | 'interior' | 'undercarriage'>(
    'exterior',
  );

  const isSedanVehicle = String(vehicleType ?? '').toLowerCase() === 'sedan';

  /** Interior / undercarriage sketches — sedan exterior uses `sedan-unified.svg` + path ids. */
  const partProps = (partName: string) => {
    const isActive = activePart?.name === partName;
    let fill = 'transparent';
    let stroke = 'transparent';
    let strokeWidth = 0;
    const opacity = 1;

    if (isActive) {
      fill = 'hsl(var(--primary) / 0.12)';
      stroke = 'hsl(var(--primary))';
      strokeWidth = 2;
    }

    return {
      fill,
      stroke,
      strokeWidth,
      opacity,
    };
  };

  return (
    <div className="flex w-full flex-col items-center gap-2">
      <div className="flex w-full max-w-[220px] items-center justify-end gap-0.5 rounded-lg border border-border bg-muted/25 p-0.5">
        {(
          [
            { key: 'exterior' as const, label: 'Exterior' },
            { key: 'interior' as const, label: 'Interior' },
            { key: 'undercarriage' as const, label: 'Under' },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setDiagramSurface(key)}
            title={
              key === 'undercarriage'
                ? 'Undercarriage view'
                : key === 'interior'
                  ? 'Interior view'
                  : 'Exterior walk-around'
            }
            className={cn(
              'min-w-0 flex-1 rounded-md px-1 py-1.5 text-[10px] font-semibold leading-tight transition-colors',
              diagramSurface === key
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        className={cn(
          'relative',
          diagramSurface === 'exterior' && isSedanVehicle && 'shrink-0',
        )}
        style={
          diagramSurface === 'exterior' && isSedanVehicle
            ? { width: 220, aspectRatio: `${SEDAN_LAYOUT_VIEWBOX.w} / ${SEDAN_LAYOUT_VIEWBOX.h}` }
            : diagramSurface === 'interior'
              ? { width: 220, aspectRatio: `${INTERIOR_SKETCH_VIEWBOX.w} / ${INTERIOR_SKETCH_VIEWBOX.h}` }
              : diagramSurface === 'undercarriage'
                ? { width: 220, aspectRatio: `${UNDERCARRIAGE_SKETCH_VIEWBOX.w} / ${UNDERCARRIAGE_SKETCH_VIEWBOX.h}` }
                : { width: 220, height: 293 }
        }
      >
        {diagramSurface === 'undercarriage' ? (
          <div className="relative h-full w-full overflow-hidden rounded-md">
            <div
              className="[&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-h-none"
              dangerouslySetInnerHTML={{ __html: undercarriageSketchSvg }}
            />
            <svg
              viewBox={`0 0 ${UNDERCARRIAGE_SKETCH_VIEWBOX.w} ${UNDERCARRIAGE_SKETCH_VIEWBOX.h}`}
              preserveAspectRatio="xMidYMid meet"
              className={cn(
                'absolute inset-0 h-full w-full',
                !onSelectPartByName && 'pointer-events-none',
              )}
            >
              <rect
                x={0}
                y={0}
                width={UNDERCARRIAGE_SKETCH_VIEWBOX.w}
                height={UNDERCARRIAGE_SKETCH_VIEWBOX.h}
                fill="transparent"
                {...partProps('Undercarriage')}
                className={onSelectPartByName ? 'cursor-pointer' : undefined}
                onClick={onSelectPartByName ? () => onSelectPartByName('Undercarriage') : undefined}
              />
            </svg>
          </div>
        ) : diagramSurface === 'interior' ? (
          <div className="relative h-full w-full overflow-hidden rounded-md">
            <div
              className="[&_svg]:block [&_svg]:h-full [&_svg]:w-full [&_svg]:max-h-none"
              dangerouslySetInnerHTML={{ __html: interiorDamagesSketchSvg }}
            />
            <svg
              viewBox={`0 0 ${INTERIOR_SKETCH_VIEWBOX.w} ${INTERIOR_SKETCH_VIEWBOX.h}`}
              preserveAspectRatio="xMidYMid meet"
              className={cn(
                'absolute inset-0 h-full w-full',
                !onSelectPartByName && 'pointer-events-none',
              )}
            >
              <rect
                x={0}
                y={0}
                width={INTERIOR_SKETCH_VIEWBOX.w}
                height={INTERIOR_SKETCH_VIEWBOX.h}
                fill="transparent"
                {...partProps('Interior')}
                className={onSelectPartByName ? 'cursor-pointer' : undefined}
                onClick={onSelectPartByName ? () => onSelectPartByName('Interior') : undefined}
              />
            </svg>
          </div>
        ) : isSedanVehicle ? (
          <SedanUnifiedDiagram
            damages={damages}
            onPartClick={onSelectPartByName}
            className={cn(
              'absolute left-0 top-0 h-full w-full [&_svg]:block [&_svg]:h-full [&_svg]:w-full',
              !onSelectPartByName && 'pointer-events-none',
            )}
          />
        ) : (
          <div className="flex min-h-[220px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/15 px-3 py-8 text-center">
            <Truck className="h-8 w-8 text-muted-foreground" aria-hidden />
            <p className="text-xs font-semibold text-foreground">Pickup / truck map</p>
            <p className="max-w-[14rem] text-[11px] leading-snug text-muted-foreground">
              Interactive diagram is sedan-only for now. Add your pickup sketch asset to wire this view.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
