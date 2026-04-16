import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import carSketchImg from '@/assets/car-sketch.png';
import truckSketchImg from '@/assets/truck-sketch.png';
import type { BodyType } from './InspectionDashboard';
import CameraCapture from './CameraCapture';
import type { CapturedPhotoEntry } from '@/types/capturedPhoto';
import InspectionSummary from './InspectionSummary';
import {
  buildCameraFramesFromResponse,
  mapUveyeAlertsToDamages,
  mergePersistedDamagesWithFreshMap,
  prefetchUveyeImages,
  resolveDamageAtlasPortalUrl,
  buildUveyePortalSummaryUrl,
  type UveyeInspectionResponse,
  type UveyeCameraFrame,
} from '@/services/uveyeApi';
import InspectionViewportImage from '@/components/InspectionViewportImage';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Check,
  PanelRightOpen,
  PanelRightClose,
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
} from 'lucide-react';

/* ──────────────────────────────────────────────
   Data model
   ────────────────────────────────────────────── */

type Area = 'Front' | 'Left' | 'Top' | 'Right' | 'Rear' | 'Undercarriage' | 'Interior';

interface CarPart {
  name: string;
  area: Area;
  cameras: string[];      // all cameras that can see this part
  bestCamera: string;     // single best camera for this part
  bestFrameNum: number;   // best frame number within that camera
}

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
  /** UVeye web app deep link for this frame (Atlas). */
  portalUrl?: string;
  /** From API mapping — used to rebuild Atlas URL after local persist. */
  atlasCameraId?: string;
  atlasFrameIndex?: number;
  /** Same physical damage seen from another angle / duplicate finding */
  isDuplicate?: boolean;
  /** Mark for follow-up (ops / QA), independent of approve or reject */
  flagged?: boolean;
  /** `name` / `damageName` / `displayName` from detection object when present */
  damageName?: string;
  /** API detection id when available */
  reportId?: string;
}

const CAR_PARTS: CarPart[] = [
  // Front area
  { name: 'Front Bumper',       area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Hood',               area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Grille',             area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Headlights',         area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Front Wheel',   area: 'Front', cameras: [], bestCamera: '', bestFrameNum: 0 },
  
  // Left area
  { name: 'Left Fender',        area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Front Door',    area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rear Door',     area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Quarter Panel', area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Mirror',        area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Window',        area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Bed Side',      area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rocker',        area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Rear Wheel',    area: 'Left',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  // Top area
  { name: 'Windshield',         area: 'Top',   cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Roof',               area: 'Top',   cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Rear Window',        area: 'Top',   cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Left Drip Rail',     area: 'Top',   cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Drip Rail',    area: 'Top',   cameras: [], bestCamera: '', bestFrameNum: 0 },
  // Right area
  { name: 'Right Fender',       area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Front Door',   area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rear Door',    area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Quarter Panel',area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Mirror',       area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Window',       area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Bed Side',     area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rocker',       area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Front Wheel',  area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Right Rear Wheel',   area: 'Right', cameras: [], bestCamera: '', bestFrameNum: 0 },
  // Rear area
  { name: 'Trunk/Liftgate',     area: 'Rear',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Tailgate',           area: 'Rear',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Rear Bumper',        area: 'Rear',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Taillights',         area: 'Rear',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  { name: 'Bed/Cargo',          area: 'Rear',  cameras: [], bestCamera: '', bestFrameNum: 0 },
  // Undercarriage
  { name: 'Undercarriage',        area: 'Undercarriage', cameras: [], bestCamera: '', bestFrameNum: 0 },
  // Interior (placeholder — future Apollo / interior scans map here like other parts)
  { name: 'Interior',             area: 'Interior',      cameras: [], bestCamera: '', bestFrameNum: 0 },
];

const AREAS: Area[] = ['Front', 'Left', 'Top', 'Right', 'Rear'];
const ALL_AREAS: Area[] = ['Front', 'Left', 'Top', 'Right', 'Rear', 'Undercarriage', 'Interior'];

function partNameMatches(uiPart: string, apiPart: string): boolean {
  return uiPart.trim().toLowerCase() === apiPart.trim().toLowerCase();
}

function getFramesForPart(
  part: CarPart,
  allFrames: UveyeCameraFrame[],
  damages: Damage[],
): UveyeCameraFrame[] {
  const partDmgs = damages.filter(d => partNameMatches(part.name, d.part));
  const frameIds = new Set(partDmgs.map(d => d.frameId));
  if (frameIds.size > 0) {
    return allFrames.filter(f => frameIds.has(f.id));
  }
  // No detections yet: interior uses Apollo later — do not fall back to all exterior frames
  if (part.area === 'Interior') {
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
}

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
}: AssistedInspectionV3Props) {
  const [activePart, setActivePart] = useState<CarPart | null>(null);
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0);
  const [reviewedParts, setReviewedParts] = useState<Set<string>>(new Set());
  const [expandedArea, setExpandedArea] = useState<Area | null>(null);
  const [customParts, setCustomParts] = useState<CarPart[]>([]);
  const [showAddPartArea, setShowAddPartArea] = useState<Area | null>(null);
  const [newPartName, setNewPartName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [viewportZoom, setViewportZoom] = useState(1);

  // Camera capture state
  const [showCameraCapture, setShowCameraCapture] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState<CapturedPhotoEntry[]>(() => initialCapturedPhotos ?? []);
  
  // Summary view state
  const [showSummary, setShowSummary] = useState(false);

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
      setDamages(mergePersistedDamagesWithFreshMap(saved, fresh));
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

  const allParts = [...CAR_PARTS, ...customParts];
  const partNames = useMemo(() => allParts.map((p) => p.name), [allParts]);

  const partFrames = useMemo(
    () => (activePart ? getFramesForPart(activePart, allFrames, damages) : []),
    [activePart, allFrames, damages],
  );
  const currentFrame = partFrames[currentFrameIdx] || null;

  const partDamages = activePart
    ? damages.filter(d => partNameMatches(activePart.name, d.part))
    : [];
  const confirmedCount = damages.filter(d => d.confirmed === true).length;
  const dismissedCount = damages.filter(d => d.confirmed === false).length;
  const duplicateCount = damages.filter(d => d.isDuplicate).length;
  const flaggedCount = damages.filter(d => d.flagged).length;

  const selectPart = (part: CarPart, frameIdx?: number) => {
    setActivePart(part);
    setCurrentFrameIdx(frameIdx !== undefined ? frameIdx : 0);
    setSelectedDamageIdx(0);
    setViewportZoom(1);
    setReviewedParts(prev => new Set(prev).add(part.name));
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
    () => allParts.filter(p => damages.some(d => partNameMatches(p.name, d.part))),
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

  useEffect(() => {
    if (!activePart || partFrames.length === 0) return;
    const prevId = partFrames[currentFrameIdx - 1]?.id;
    const nextId = partFrames[currentFrameIdx + 1]?.id;
    const curId = partFrames[currentFrameIdx]?.id;
    prefetchUveyeImages([
      curId ? frameImages[curId] : undefined,
      prevId ? frameImages[prevId] : undefined,
      nextId ? frameImages[nextId] : undefined,
    ]);
  }, [activePart, partFrames, currentFrameIdx, frameImages]);

  useEffect(() => {
    setViewportZoom(1);
  }, [currentFrame?.id]);

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
        reviewedParts={reviewedParts}
        totalParts={allParts.length}
        onBack={() => setShowSummary(false)}
        capturedPhotos={capturedPhotos}
      />
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-muted font-sans text-foreground overflow-hidden">
      {/* Camera Capture Modal */}
      {showCameraCapture && (
        <CameraCapture
          partNames={partNames}
          suggestedPartName={activePart?.name}
          onCapture={(capturePayload) => {
            setCapturedPhotos((prev) => [...prev, { ...capturePayload, timestamp: new Date() }]);
            setShowCameraCapture(false);
          }}
          onClose={() => setShowCameraCapture(false)}
        />
      )}

      <div className="flex items-center justify-between px-5 py-3 bg-card border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          {damages.length > 0 && (
            <div
              className="flex items-center gap-1.5 rounded-lg border border-border bg-destructive/10 px-2.5 py-1.5 text-destructive"
              title="Total AI / manual detections across all panels"
            >
              <AlertTriangle size={14} className="shrink-0" aria-hidden />
              <span className="text-xs font-bold tabular-nums">{damages.length}</span>
            </div>
          )}
          {onBack && (
            <button
              onClick={onBack}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mr-1"
              title="Back to inspections"
            >
              <ChevronLeft size={18} />
            </button>
          )}
          <div className="w-9 h-9 bg-foreground rounded-lg flex items-center justify-center text-background font-bold text-xs">UV</div>
          <div className="min-w-0">
            <h1 className="font-bold text-base tracking-tight">{vehicleLabel || 'AutoInspect'}</h1>
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
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowCameraCapture(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
            title="Add photo evidence — choose car part and damage type after capture"
          >
            <Camera size={14} /> Photo
          </button>
          <button
            type="button"
            onClick={() => setShowSummary(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors border border-border"
            title="View summary report"
          >
            <FileText size={14} /> Summary
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
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            title={sidebarOpen ? 'Hide panel' : 'Show panel'}
          >
            {sidebarOpen ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
          </button>
        </div>
      </div>

      {/* MAIN CONTENT — image viewport + collapsible right sidebar */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* IMAGE VIEWPORT (always visible, takes remaining space) */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
          {activePart ? (
            <>
              {/* Part header bar */}
              <div className="flex items-center justify-between px-4 py-2 bg-card/80 backdrop-blur border-b border-border shrink-0">
                <div>
                  <h2 className="font-bold text-foreground text-lg">{activePart.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {currentFrame ? `${currentFrame.camera} • Frame ${currentFrame.frameNum}` : 'No images'} • {partFrames.length} image{partFrames.length !== 1 ? 's' : ''} • {partDamages.length} detection{partDamages.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowCameraCapture(true)}
                    className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all active:scale-95 bg-accent text-accent-foreground"
                    title="Take photo or upload from gallery"
                  >
                    <Camera size={14} /> Photo
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePart(null)}
                    className="text-xs font-medium text-muted-foreground hover:text-foreground px-2 py-1.5 rounded-lg transition-colors"
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
                  <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-card border-b border-border shrink-0">
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
                    <div className="flex-1 min-w-0">
                      {dmg.damageName ? (
                        <p className="text-base font-bold text-foreground leading-snug break-words" title={dmg.damageName}>
                          {dmg.damageName}
                        </p>
                      ) : null}
                      <p className={`font-semibold text-foreground ${dmg.damageName ? 'text-sm mt-0.5' : 'text-base'}`}>
                        <span className="text-muted-foreground font-normal text-xs mr-1.5">Type</span>
                        {dmg.type || '—'}
                      </p>
                      {(dmg.confirmed === true || dmg.confirmed === false || dmg.isDuplicate || dmg.flagged) && (
                        <div className="flex items-center gap-2 flex-wrap mt-1">
                          {dmg.confirmed === true && (
                            <span className="text-[10px] font-medium text-primary inline-flex items-center gap-0.5">
                              <CheckCircle size={10} /> Approved
                            </span>
                          )}
                          {dmg.confirmed === false && (
                            <span className="text-[10px] font-medium text-destructive inline-flex items-center gap-0.5">
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
                        title="Approve this detection for this frame (counts in header & summary)"
                        onClick={() => setDamageConfirmed(dmg.id, true)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${dmg.confirmed === true ? 'bg-primary border-primary text-primary-foreground shadow-sm' : 'border-primary/40 text-primary hover:bg-primary/10'}`}
                      >
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button
                        type="button"
                        title="Reject this detection for this frame (counts in header & summary)"
                        onClick={() => setDamageConfirmed(dmg.id, false)}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border-2 transition-all ${dmg.confirmed === false ? 'bg-destructive border-destructive text-destructive-foreground shadow-sm' : 'border-destructive/40 text-destructive hover:bg-destructive/10'}`}
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

              <div className="flex-1 relative bg-viewport flex flex-col min-h-0">
                <div
                  className="flex-1 relative min-h-0 overflow-hidden flex flex-col"
                  style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, hsl(215 28% 22%) 0%, hsl(215 28% 12%) 100%)' }}
                >
                  {currentFrame && frameImages[currentFrame.id] ? (
                    <InspectionViewportImage
                      src={frameImages[currentFrame.id]}
                      alt={`${currentFrame.camera} frame ${currentFrame.frameNum}`}
                      zoom={viewportZoom}
                      onZoomChange={setViewportZoom}
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
                {currentFrame && frameImages[currentFrame.id] && (
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
                <div className="pointer-events-none absolute bottom-14 left-1/2 -translate-x-1/2 z-10 text-[10px] text-background/80 bg-foreground/30 px-2 py-0.5 rounded-full max-w-[90%] text-center">
                  ← → frames · scroll zooms when fit · when zoomed scroll pans, Ctrl+scroll zooms · drag to pan
                </div>

                {partFrames.length > 0 && (partFrames.length > 1 || navNextEnabled || navPrevEnabled) && (
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

                {partFrames.length > 0 && (
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

                {currentFrame && (
                  <div className="absolute top-3 left-3 bg-foreground/40 backdrop-blur-md text-background text-xs px-3 py-1.5 rounded-lg font-mono z-10">
                    {currentFrame.camera} • f{currentFrame.frameNum}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty state when no part selected */
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground px-8">
              <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <AlertTriangle size={28} className="opacity-30" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2 text-center">Select a part to inspect</h2>
              <p className="text-sm text-center max-w-xs">Pick a part from the vehicle diagram or the list on the right.</p>
            </div>
          )}
        </div>

        {/* COLLAPSIBLE RIGHT SIDEBAR */}
        <div className={`bg-card border-l border-border flex flex-col shrink-0 transition-all duration-300 overflow-hidden ${sidebarOpen ? 'w-[320px]' : 'w-0'}`}>
          {sidebarOpen && (
            <>
              {/* Top section: Vehicle Diagram */}
              <div className="border-b border-border shrink-0">
                <div className="px-3 py-2 flex items-center justify-between">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vehicle Map</span>
                </div>
                <div className="flex justify-center pb-3 px-2">
                  <MiniCarDiagram
                    activePart={activePart}
                    reviewedParts={reviewedParts}
                    damages={damages}
                    onSelectPart={selectPart}
                    vehicleType={vehicleType}
                    onDoubleClickPart={(partName) => {
                      setReviewedParts(prev => {
                        const next = new Set(prev);
                        if (next.has(partName)) next.delete(partName);
                        else next.add(partName);
                        return next;
                      });
                    }}
                  />
                </div>
              </div>

              {/* Bottom section: Parts list */}
              <div className="flex-1 overflow-y-auto">
                <div className="px-3 py-2">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Parts</span>
                </div>
                <div className="px-2 pb-4 space-y-0.5">
                  {ALL_AREAS.map(area => {
                    const areaParts = allParts.filter(p => p.area === area);
                    const areaHasDamage = areaParts.some(p => getPartHasDamage(p.name));
                    const areaDamageCount = areaParts.reduce((sum, p) => sum + getPartDamageCount(p.name), 0);
                    const reviewedCount = areaParts.filter(p => reviewedParts.has(p.name)).length;
                    const isExpanded = expandedArea === area || activePart?.area === area;

                    return (
                      <div key={area}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const allDone = areaParts.every(p => reviewedParts.has(p.name));
                              setReviewedParts(prev => {
                                const next = new Set(prev);
                                areaParts.forEach(p => { if (allDone) next.delete(p.name); else next.add(p.name); });
                                return next;
                              });
                            }}
                            className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                              ${reviewedCount === areaParts.length ? 'bg-primary border-primary'
                                : reviewedCount > 0 ? 'bg-primary/30 border-primary/50'
                                : 'border-border hover:border-primary/50'}`}
                          >
                            {reviewedCount === areaParts.length && <Check size={10} className="text-primary-foreground" />}
                            {reviewedCount > 0 && reviewedCount < areaParts.length && <div className="w-1.5 h-0.5 bg-primary-foreground rounded" />}
                          </button>
                          <button
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
                            <span className="text-[10px] text-muted-foreground">{reviewedCount}/{areaParts.length}</span>
                          </button>
                        </div>

                        {isExpanded && (
                          <div className="ml-5 mt-0.5 space-y-0.5">
                            {areaParts.map(part => {
                              const dmgCount = getPartDamageCount(part.name);
                              const isActive = activePart?.name === part.name;
                              const reviewed = reviewedParts.has(part.name);
                              return (
                                <div key={part.name} className="flex items-center gap-1">
                                  <button
                                    onClick={(e) => toggleWalkaroundCheck(part.name, e)}
                                    className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-all
                                      ${reviewed ? 'bg-primary border-primary' : 'border-border hover:border-primary/50'}`}
                                  >
                                    {reviewed && <Check size={10} className="text-primary-foreground" />}
                                  </button>
                                  <button
                                    onClick={() => selectPart(part)}
                                    className={`flex-1 flex items-center justify-between px-2 py-1 rounded-md text-xs transition-all
                                      ${isActive ? 'bg-primary text-primary-foreground font-bold'
                                        : reviewed ? 'text-primary/80 hover:bg-primary/5 font-medium line-through opacity-70'
                                        : dmgCount === 0 ? 'text-muted-foreground/50 hover:bg-accent font-medium opacity-40'
                                        : 'text-foreground hover:bg-accent font-medium'}`}
                                  >
                                    <span className="truncate">{part.name}</span>
                                    {dmgCount > 0 && (
                                      <span className={`min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold
                                        ${isActive ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-destructive text-background'}`}>
                                        {dmgCount}
                                      </span>
                                    )}
                                  </button>
                                </div>
                              );
                            })}
                            {showAddPartArea === area ? (
                              <div className="border border-border rounded-lg p-2 space-y-2 mt-1">
                                <input type="text" value={newPartName} onChange={e => setNewPartName(e.target.value)}
                                  placeholder="Part name..." autoFocus onKeyDown={e => e.key === 'Enter' && addCustomPart(area)}
                                  className="w-full px-2 py-1.5 text-xs rounded-md border border-input bg-background text-foreground placeholder:text-muted-foreground"
                                />
                                <div className="flex gap-1">
                                  <button onClick={() => addCustomPart(area)} className="flex-1 px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-md">Add</button>
                                  <button onClick={() => { setShowAddPartArea(null); setNewPartName(''); }} className="px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground">Cancel</button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setShowAddPartArea(area); setNewPartName(''); }}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Mini Car Diagram — clickable parts on a top-down SVG
   ────────────────────────────────────────────── */

function MiniCarDiagram({
  activePart,
  reviewedParts,
  damages,
  onSelectPart,
  onDoubleClickPart,
  vehicleType = 'sedan',
}: {
  activePart: CarPart | null;
  reviewedParts: Set<string>;
  damages: Damage[];
  onSelectPart: (part: CarPart) => void;
  onDoubleClickPart: (partName: string) => void;
  vehicleType?: BodyType;
}) {
  /** Top-down exterior sketch vs placeholder interior vs undercarriage schematic */
  const [diagramSurface, setDiagramSurface] = React.useState<'exterior' | 'interior' | 'undercarriage'>(
    'exterior',
  );

  const handlePartClick = (partName: string) => {
    const part = [...CAR_PARTS].find(p => p.name === partName);
    if (!part) return;
    onSelectPart(part);
  };

  const handlePartDoubleClick = (partName: string, e: React.MouseEvent<SVGElement>) => {
    e.preventDefault();
    onDoubleClickPart(partName);
  };

  const partProps = (partName: string) => {
    const isActive = activePart?.name === partName;
    const hasDamage = damages.some(d => partNameMatches(partName, d.part));

    let fill = 'transparent';
    let stroke = 'transparent';
    let strokeWidth = 0;
    const opacity = 1;

    if (hasDamage && isActive) {
      // Active + damaged: solid red with blue outline
      fill = 'hsl(0 75% 50% / 0.55)';
      stroke = 'hsl(var(--primary))';
      strokeWidth = 2.5;
    } else if (hasDamage) {
      // Damaged: solid red fill like reference images
      fill = 'hsl(0 75% 50% / 0.45)';
      stroke = 'hsl(0 75% 45% / 0.7)';
      strokeWidth = 1.5;
    } else if (isActive) {
      // Active but no damage: subtle blue outline only
      fill = 'hsl(var(--primary) / 0.12)';
      stroke = 'hsl(var(--primary))';
      strokeWidth = 2;
    }

    return {
      fill,
      stroke,
      strokeWidth,
      opacity,
      onClick: () => handlePartClick(partName),
      onDoubleClick: (e: React.MouseEvent<SVGElement>) => handlePartDoubleClick(partName, e),
      className: 'cursor-pointer hover:opacity-80 transition-all',
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
                  ? 'Interior (placeholder)'
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

      <div className="relative" style={{ width: 220, height: 293 }}>
        {diagramSurface === 'undercarriage' ? (
          <svg viewBox="0 0 704 936" className="w-full h-full" fill="none">
            <rect x="220" y="180" width="265" height="580" rx="30" fill="hsl(var(--muted) / 0.15)" stroke="hsl(var(--border))" strokeWidth={1.5} strokeDasharray="6 3" />
            <rect x="230" y="190" width="245" height="560" rx="24" {...partProps('Undercarriage')} />
            <text x="352" y="470" textAnchor="middle" fontSize="22" fill="hsl(var(--muted-foreground))" className="pointer-events-none">Undercarriage</text>
          </svg>
        ) : diagramSurface === 'interior' ? (
          <svg viewBox="0 0 704 936" className="w-full h-full" fill="none">
            <rect x="200" y="200" width="304" height="520" rx="36" fill="hsl(var(--muted) / 0.12)" stroke="hsl(var(--border))" strokeWidth={1.5} strokeDasharray="8 4" />
            <rect x="230" y="240" width="246" height="380" rx="28" fill="hsl(var(--muted) / 0.08)" stroke="hsl(var(--border))" strokeWidth={1.2} />
            <rect x="280" y="360" width="146" height="90" rx="12" fill="hsl(var(--muted) / 0.15)" {...partProps('Interior')} />
            <text x="352" y="330" textAnchor="middle" fontSize="20" fill="hsl(var(--muted-foreground))" className="pointer-events-none">
              Interior
            </text>
            <text x="352" y="360" textAnchor="middle" fontSize="13" fill="hsl(var(--muted-foreground) / 0.85)" className="pointer-events-none">
              Placeholder
            </text>
          </svg>
        ) : (
          <>
            <img src={vehicleType === 'truck' ? truckSketchImg : carSketchImg} alt="Vehicle diagram" className="w-full h-full object-contain pointer-events-none select-none" draggable={false} />
            <svg viewBox="0 0 704 936" className="absolute inset-0 w-full h-full" fill="none">
              {vehicleType === 'truck' ? (
                <>
                  {/* ── TRUCK LAYOUT ── */}

                  {/* ── Front view (top center) ── */}
                  <path d="M255 15 L450 15 L465 55 L475 95 L485 145 L220 145 L230 95 L240 55 Z" {...partProps('Front Bumper')} />
                  <path d="M265 20 L440 20 L448 50 L260 50 Z" {...partProps('Grille')} />
                  <rect x="265" y="95" width="40" height="28" rx="10" {...partProps('Headlights')} />
                  <rect x="400" y="95" width="40" height="28" rx="10" {...partProps('Headlights')} />

                  {/* ── Top-down view (center) ── */}
                  {/* Hood */}
                  <path d="M258 190 Q352 175 448 190 L445 270 Q352 258 260 270 Z" {...partProps('Hood')} />
                  {/* Windshield */}
                  <path d="M260 272 Q352 258 445 272 L435 325 Q352 315 270 325 Z" {...partProps('Windshield')} />
                  {/* Left Mirror */}
                  <ellipse cx="218" cy="295" rx="12" ry="18" {...partProps('Left Mirror')} />
                  {/* Right Mirror */}
                  <ellipse cx="488" cy="295" rx="12" ry="18" {...partProps('Right Mirror')} />
                  {/* Roof / Cab */}
                  <path d="M270 327 Q352 317 435 327 L435 440 Q352 450 270 440 Z" {...partProps('Roof')} />
                  {/* Left Front Door (top-down) */}
                  <path d="M226 295 L268 295 L268 395 L224 395 Z" {...partProps('Left Front Door')} />
                  {/* Left Rear Door (top-down) */}
                  <path d="M224 397 L268 397 L268 460 L228 460 Z" {...partProps('Left Rear Door')} />
                  {/* Right Front Door (top-down) */}
                  <path d="M438 295 L480 295 L482 395 L438 395 Z" {...partProps('Right Front Door')} />
                  {/* Right Rear Door (top-down) */}
                  <path d="M438 397 L480 397 L478 460 L438 460 Z" {...partProps('Right Rear Door')} />
                  {/* Rear Window */}
                  <path d="M270 442 Q352 452 435 442 L440 475 Q352 487 265 475 Z" {...partProps('Rear Window')} />
                  {/* Bed (top-down) */}
                  <path d="M258 478 Q352 490 448 478 L452 600 Q352 610 254 600 Z" {...partProps('Bed Side')} />
                  {/* Tailgate (top-down) */}
                  <path d="M254 602 Q352 612 452 602 L455 630 Q352 640 252 630 Z" {...partProps('Tailgate')} />
                  {/* Rear Bumper (top-down) */}
                  <path d="M250 632 Q352 642 456 632 L458 658 Q352 668 248 658 Z" {...partProps('Rear Bumper')} />
                  {/* Drip Rails */}
                  <rect x="264" y="327" width="6" height="150" rx="2" {...partProps('Left Drip Rail')} />
                  <rect x="436" y="327" width="6" height="150" rx="2" {...partProps('Right Drip Rail')} />

                  {/* ── Left side view ── */}
                  {/* Left Fender */}
                  <path d="M30 225 L100 215 L170 215 Q185 230 185 260 L185 300 L100 300 Q45 300 30 270 Z" {...partProps('Left Fender')} />
                  {/* Left Front Wheel */}
                  <circle cx="105" cy="300" r="52" {...partProps('Left Front Wheel')} />
                  {/* Left Front Door (side) */}
                  <path d="M20 210 L185 210 L185 350 L20 350 Z" {...partProps('Left Front Door')} />
                  {/* Left Rear Door (side) */}
                  <path d="M20 352 L185 352 L185 450 L20 450 Z" {...partProps('Left Rear Door')} />
                  {/* Left Bed Side (side) */}
                  <path d="M15 452 L185 452 L185 590 L25 590 Z" {...partProps('Bed Side')} />
                  {/* Left Rear Wheel */}
                  <circle cx="80" cy="640" r="52" {...partProps('Left Rear Wheel')} />
                  {/* Left Quarter Panel */}
                  <path d="M15 590 L185 590 L185 640 Q175 700 120 725 L40 730 Q15 720 10 680 Z" {...partProps('Left Quarter Panel')} />

                  {/* ── Right side view ── */}
                  {/* Right Fender */}
                  <path d="M525 260 L525 215 L615 215 L680 225 Q695 245 695 270 L695 300 L610 300 Q540 300 525 275 Z" {...partProps('Right Fender')} />
                  {/* Right Front Wheel */}
                  <circle cx="610" cy="300" r="52" {...partProps('Right Front Wheel')} />
                  {/* Right Front Door (side) */}
                  <path d="M525 210 L695 210 L695 350 L525 350 Z" {...partProps('Right Front Door')} />
                  {/* Right Rear Door (side) */}
                  <path d="M525 352 L695 352 L695 450 L525 450 Z" {...partProps('Right Rear Door')} />
                  {/* Right Bed Side (side) */}
                  <path d="M525 452 L695 452 L695 590 L525 590 Z" {...partProps('Bed Side')} />
                  {/* Right Rear Wheel */}
                  <circle cx="635" cy="640" r="52" {...partProps('Right Rear Wheel')} />
                  {/* Right Quarter Panel */}
                  <path d="M525 590 L695 590 L695 680 Q690 720 660 730 L575 730 Q540 720 530 700 L525 640 Z" {...partProps('Right Quarter Panel')} />

                  {/* ── Rear view (bottom center) ── */}
                  <path d="M235 790 L470 790 L480 830 L490 870 L488 920 L218 920 L216 870 L226 830 Z" {...partProps('Rear Bumper')} />
                  <path d="M255 795 L450 795 L448 860 L257 860 Z" {...partProps('Tailgate')} />
                  <rect x="260" y="860" width="38" height="25" rx="8" {...partProps('Taillights')} />
                  <rect x="408" y="860" width="38" height="25" rx="8" {...partProps('Taillights')} />
                </>
              ) : (
                <>
                  {/* ── SEDAN LAYOUT ── */}

                  {/* ── Front view (top center) ── */}
                  <path d="M260 18 L445 18 L460 60 L470 100 L480 150 L225 150 L235 100 L245 60 Z" {...partProps('Front Bumper')} />
                  <rect x="270" y="105" width="40" height="25" rx="12" {...partProps('Headlights')} />
                  <rect x="395" y="105" width="40" height="25" rx="12" {...partProps('Headlights')} />

                  {/* ── Top-down view (center) ── */}
                  <path d="M258 200 Q352 185 448 200 L445 270 Q352 258 260 270 Z" {...partProps('Hood')} />
                  <path d="M260 272 Q352 258 445 272 L435 330 Q352 320 270 330 Z" {...partProps('Windshield')} />
                  <ellipse cx="218" cy="298" rx="10" ry="16" {...partProps('Left Mirror')} />
                  <ellipse cx="488" cy="298" rx="10" ry="16" {...partProps('Right Mirror')} />
                  <path d="M270 332 Q352 322 435 332 L435 480 Q352 490 270 480 Z" {...partProps('Roof')} />
                  <path d="M226 300 L268 300 L268 400 L224 400 Z" {...partProps('Left Front Door')} />
                  <path d="M224 402 L268 402 L268 500 L228 500 Z" {...partProps('Left Rear Door')} />
                  <path d="M438 300 L480 300 L482 400 L438 400 Z" {...partProps('Right Front Door')} />
                  <path d="M438 402 L480 402 L478 500 L438 500 Z" {...partProps('Right Rear Door')} />
                  <path d="M270 482 Q352 492 435 482 L440 530 Q352 542 265 530 Z" {...partProps('Rear Window')} />
                  <path d="M262 532 Q352 544 442 532 L448 580 Q352 595 258 580 Z" {...partProps('Trunk/Liftgate')} />
                  <path d="M255 582 Q352 598 450 582 L455 610 Q352 625 252 610 Z" {...partProps('Rear Bumper')} />
                  <rect x="264" y="332" width="6" height="200" rx="2" {...partProps('Left Drip Rail')} />
                  <rect x="436" y="332" width="6" height="200" rx="2" {...partProps('Right Drip Rail')} />

                  {/* ── Left side view ── */}
                  <path d="M30 230 L100 220 L170 220 Q180 230 180 260 L180 310 L100 310 Q45 310 30 280 Z" {...partProps('Left Fender')} />
                  <circle cx="100" cy="305" r="50" {...partProps('Left Front Wheel')} />
                  <path d="M20 370 L185 370 L185 560 L30 560 Z" {...partProps('Left Rocker')} />
                  <circle cx="75" cy="630" r="50" {...partProps('Left Rear Wheel')} />
                  <path d="M15 560 L180 560 L180 620 Q175 680 120 710 L40 720 Q15 710 10 670 Z" {...partProps('Left Quarter Panel')} />

                  {/* ── Right side view ── */}
                  <path d="M525 260 L525 220 L615 220 L680 230 Q695 250 695 280 L695 310 L610 310 Q540 310 525 280 Z" {...partProps('Right Fender')} />
                  <circle cx="610" cy="305" r="50" {...partProps('Right Front Wheel')} />
                  <path d="M525 370 L695 370 L695 560 L525 560 Z" {...partProps('Right Rocker')} />
                  <circle cx="635" cy="630" r="50" {...partProps('Right Rear Wheel')} />
                  <path d="M525 560 L695 560 L695 670 Q690 710 660 720 L575 720 Q540 710 530 680 L525 620 Z" {...partProps('Right Quarter Panel')} />

                  {/* ── Rear view (bottom center) ── */}
                  <path d="M238 780 L468 780 L478 820 L488 870 L485 920 L220 920 L218 870 L228 820 Z" {...partProps('Rear Bumper')} />
                  <rect x="268" y="855" width="35" height="25" rx="8" {...partProps('Taillights')} />
                  <rect x="405" y="855" width="35" height="25" rx="8" {...partProps('Taillights')} />
                </>
              )}
            </svg>
          </>
        )}
      </div>
    </div>
  );
}
