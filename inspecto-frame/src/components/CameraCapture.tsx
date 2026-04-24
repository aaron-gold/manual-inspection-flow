import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, Image, ImagePlus, X, RotateCcw, Trash2 } from 'lucide-react';
import { humanizeDetectionType } from '@/services/uveyeApi';
import { UVeye_CATALOG_DAMAGE_CHECK_TYPES } from '@/lib/uveyeCatalogDamageTypes';
import {
  CATALOG_AREA_ORDER,
  indexCatalogByCategory,
  UNIQUE_PARTS_AND_DAMAGES,
  type CatalogArea,
} from '@/lib/partDamageCatalog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { SearchableOptionPicker } from '@/components/SearchableOptionPicker';

/** Cap per missed-damage save to keep the browser responsive with large JPEG data URLs. */
const MAX_MANUAL_PHOTOS = 15;

export const MANUAL_DAMAGE_TYPES = [
  'Scratch',
  'Dent',
  'Paint Damage',
  'Crack',
  'Missing Part',
  'Other',
] as const;

function newCaptureId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cap_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export type CapturedPhotoPayload = {
  /** Evidence images (empty if the inspector saves without photos). */
  dataUrls: string[];
  partName: string;
  damageType: string;
  /** Links saved photos to the matching manual damage row in the inspection. */
  captureId: string;
};

interface CameraCaptureProps {
  /** All inspectable car part labels (same as vehicle map list). */
  partNames: string[];
  /** When opened from a part, pre-select this name if it exists in `partNames`. */
  suggestedPartName?: string;
  /** Extra humanized labels from this scan (payload + AI rows) if not already in manual list or catalog. */
  additionalDamageTypes?: string[];
  onCapture: (payload: CapturedPhotoPayload) => void;
  onClose: () => void;
}

/** iOS/Android: getUserMedia is often blocked; `<input capture>` opens the native camera reliably. */
function shouldUseNativeCameraCapture(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/iP(hone|ad|od)/.test(ua)) return true;
  if (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) return true;
  return /Android/i.test(ua);
}

export default function CameraCapture({
  partNames,
  suggestedPartName,
  additionalDamageTypes = [],
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraCaptureInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<'menu' | 'live' | 'details'>('menu');
  /** When `append`, the next camera/gallery result adds to `pendingDataUrls` instead of opening a fresh details form. */
  const [menuIntent, setMenuIntent] = useState<'default' | 'append'>('default');
  const [error, setError] = useState<string | null>(null);
  const [pendingDataUrls, setPendingDataUrls] = useState<string[]>([]);
  const [selectedPart, setSelectedPart] = useState('');
  const [damageType, setDamageType] = useState<string>(MANUAL_DAMAGE_TYPES[0]);
  const [useCatalogPicker, setUseCatalogPicker] = useState(false);
  const [catalogArea, setCatalogArea] = useState<CatalogArea>(CATALOG_AREA_ORDER[0]);

  const { partsByCategory, damagesByCategory } = useMemo(
    () => indexCatalogByCategory(UNIQUE_PARTS_AND_DAMAGES),
    [],
  );

  const catalogParts = partsByCategory.get(catalogArea) ?? [];
  const catalogDamages = damagesByCategory.get(catalogArea) ?? [];

  const damageTypeOptions = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const add = (label: string) => {
      const s = (label || '').trim();
      if (!s) return;
      const k = s.toLowerCase();
      if (seen.has(k)) return;
      seen.add(k);
      out.push(s);
    };
    for (const t of MANUAL_DAMAGE_TYPES) add(t);
    const fromCatalog = UVeye_CATALOG_DAMAGE_CHECK_TYPES.map((raw) => humanizeDetectionType(raw));
    fromCatalog.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    for (const t of fromCatalog) add(t);
    const extras = [...additionalDamageTypes].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
    for (const t of extras) add(t);
    return out;
  }, [additionalDamageTypes]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const openDetailsFromCapture = useCallback(
    (urls: string[], resetFormFields: boolean) => {
      stopStream();
      setError(null);
      setMode('details');
      setPendingDataUrls(urls);
      setMenuIntent('default');
      if (resetFormFields) {
        setUseCatalogPicker(false);
        setCatalogArea(CATALOG_AREA_ORDER[0]);
        const suggested =
          suggestedPartName && partNames.includes(suggestedPartName) ? suggestedPartName : '';
        setSelectedPart(suggested || partNames[0] || '');
        setDamageType(MANUAL_DAMAGE_TYPES[0]);
      }
    },
    [partNames, suggestedPartName],
  );

  const applyVehicleMapDefaults = useCallback(() => {
    const suggested =
      suggestedPartName && partNames.includes(suggestedPartName) ? suggestedPartName : '';
    setSelectedPart(suggested || partNames[0] || '');
    setDamageType(MANUAL_DAMAGE_TYPES[0]);
  }, [partNames, suggestedPartName]);

  /** Same as after a capture, but part + damage only (no images). */
  const goToDetailsWithoutPhoto = () => {
    openDetailsFromCapture([], true);
  };

  const applyCatalogDefaultsForArea = useCallback(
    (area: CatalogArea) => {
      const parts = partsByCategory.get(area) ?? [];
      const dmgs = damagesByCategory.get(area) ?? [];
      setSelectedPart(parts[0] || '');
      setDamageType(dmgs[0] || MANUAL_DAMAGE_TYPES[0]);
    },
    [partsByCategory, damagesByCategory],
  );

  const onCatalogToggle = (checked: boolean) => {
    setUseCatalogPicker(checked);
    if (checked) {
      applyCatalogDefaultsForArea(catalogArea);
    } else {
      applyVehicleMapDefaults();
    }
  };

  const openNativeCameraPicker = () => {
    setError(null);
    cameraCaptureInputRef.current?.click();
  };

  const startCamera = async () => {
    setError(null);
    if (shouldUseNativeCameraCapture()) {
      openNativeCameraPicker();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      setMode('live');
      requestAnimationFrame(() => {
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          v.play().catch(() => {});
        }
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Camera unavailable';
      setError(
        `${msg}. Allow camera in the site settings, use HTTPS or localhost, or try “Choose from gallery”.`,
      );
    }
  };

  const captureFrame = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    stopStream();
    if (menuIntent === 'append') {
      setPendingDataUrls((prev) => {
        const merged = [...prev, dataUrl];
        if (merged.length > MAX_MANUAL_PHOTOS) {
          setError(`Maximum ${MAX_MANUAL_PHOTOS} photos per finding.`);
        }
        return merged.slice(0, MAX_MANUAL_PHOTOS);
      });
      setMode('details');
      setMenuIntent('default');
    } else {
      openDetailsFromCapture([dataUrl], true);
    }
  };

  const readFilesAsDataUrls = (files: FileList | File[]) =>
    Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              if (typeof reader.result === 'string') resolve(reader.result);
              else reject(new Error('Invalid read result'));
            };
            reader.onerror = () => reject(reader.error ?? new Error('Read failed'));
            reader.readAsDataURL(file);
          }),
      ),
    );

  const handleGalleryFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    setError(null);
    let dataUrls: string[];
    try {
      dataUrls = await readFilesAsDataUrls(files);
    } catch {
      setError('Could not read one or more images. Try again.');
      e.target.value = '';
      return;
    }
    e.target.value = '';

    if (menuIntent === 'append') {
      setPendingDataUrls((prev) => {
        const merged = [...prev, ...dataUrls];
        if (merged.length > MAX_MANUAL_PHOTOS) {
          setError(`Only the first ${MAX_MANUAL_PHOTOS} photos are kept for this finding.`);
        }
        return merged.slice(0, MAX_MANUAL_PHOTOS);
      });
      setMode('details');
      setMenuIntent('default');
    } else {
      const capped = dataUrls.slice(0, MAX_MANUAL_PHOTOS);
      openDetailsFromCapture(capped, true);
      if (dataUrls.length > MAX_MANUAL_PHOTOS) {
        setError(`Only the first ${MAX_MANUAL_PHOTOS} photos are kept for this finding.`);
      }
    }
  };

  const submitDetails = () => {
    if (!selectedPart.trim() || mode !== 'details') return;
    let dt: string;
    if (useCatalogPicker) {
      const resolved =
        catalogDamages.includes(damageType) ? damageType : catalogDamages[0] || MANUAL_DAMAGE_TYPES[0];
      dt = resolved.trim() || MANUAL_DAMAGE_TYPES[0];
    } else {
      const t = damageType.trim();
      dt = t || damageTypeOptions[0] || MANUAL_DAMAGE_TYPES[0];
    }
    onCapture({
      dataUrls: pendingDataUrls.slice(0, MAX_MANUAL_PHOTOS),
      partName: selectedPart.trim(),
      damageType: dt,
      captureId: newCaptureId(),
    });
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  if (mode === 'details') {
    const photoCount = pendingDataUrls.length;
    const primaryPreview = pendingDataUrls[0];
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200 p-4">
        <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <h3 className="font-bold text-foreground text-base">Document missed damage</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {photoCount > 0
                  ? photoCount > 1
                    ? 'Pick part and damage type. Every photo below is saved with this single finding.'
                    : 'Pick the car part and damage type so this finding matches the vehicle map and reports.'
                  : 'No photo — choose part and damage so this missed finding appears on the map and in reports.'}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
            <div className="space-y-3">
              {photoCount > 0 ? (
                <>
                  <div className="rounded-xl overflow-hidden border border-border bg-muted/30 aspect-video flex items-center justify-center">
                    <img
                      src={primaryPreview}
                      alt="Primary capture"
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {pendingDataUrls.map((url, idx) => (
                      <div
                        key={`${idx}-${url.slice(0, 48)}`}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-border shrink-0"
                      >
                        <img src={url} alt="" className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => setPendingDataUrls((prev) => prev.filter((_, i) => i !== idx))}
                          className="absolute top-0.5 right-0.5 rounded-full bg-black/65 p-1 text-white hover:bg-black/80"
                          aria-label={`Remove photo ${idx + 1}`}
                        >
                          <Trash2 size={12} strokeWidth={2.5} />
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="rounded-xl overflow-hidden border border-border bg-muted/30 aspect-video flex items-center justify-center">
                  <div className="flex flex-col items-center justify-center gap-2 px-6 text-center text-muted-foreground">
                    <Image className="opacity-40" size={40} aria-hidden />
                    <p className="text-sm font-medium text-foreground">No photo attached</p>
                    <p className="text-xs max-w-sm">
                      You can go back to add a picture, or save this entry with part and damage only.
                    </p>
                  </div>
                </div>
              )}
              {photoCount < MAX_MANUAL_PHOTOS ? (
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setMenuIntent('append');
                    setMode('menu');
                  }}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-border text-sm font-medium text-foreground hover:bg-muted/50"
                >
                  <ImagePlus size={18} />
                  {photoCount === 0 ? 'Add photo' : 'Add another photo'}
                </button>
              ) : null}
            </div>

            <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <div className="min-w-0">
                <Label htmlFor="camera-catalog-picker" className="text-xs font-semibold text-foreground">
                  Catalog picker
                </Label>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                  Exterior, interior, mechanical, or structural frame — then part and damage for that area.
                </p>
              </div>
              <Switch
                id="camera-catalog-picker"
                checked={useCatalogPicker}
                onCheckedChange={onCatalogToggle}
                className="shrink-0"
              />
            </div>

            {useCatalogPicker ? (
              <>
                <div>
                  <label
                    htmlFor="camera-capture-area"
                    className="text-xs font-semibold text-foreground block mb-1.5"
                  >
                    Area
                  </label>
                  <select
                    id="camera-capture-area"
                    value={catalogArea}
                    onChange={(e) => {
                      const next = e.target.value as CatalogArea;
                      setCatalogArea(next);
                      applyCatalogDefaultsForArea(next);
                    }}
                    className="w-full px-3 py-2.5 text-sm rounded-lg border border-input bg-background text-foreground"
                  >
                    {CATALOG_AREA_ORDER.map((area) => (
                      <option key={area} value={area}>
                        {area === 'Frame' ? 'Frame (structural)' : area}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <SearchableOptionPicker
                    id="camera-capture-catalog-part"
                    label="Part (this area)"
                    value={
                      catalogParts.length === 0
                        ? ''
                        : catalogParts.includes(selectedPart)
                          ? selectedPart
                          : catalogParts[0] || ''
                    }
                    onChange={setSelectedPart}
                    options={catalogParts}
                    placeholder="Search parts…"
                    allowCustomValue={false}
                    emptyListHint="No parts in catalog for this area"
                  />
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <SearchableOptionPicker
                    id="camera-capture-catalog-damage"
                    label="Damage (this area)"
                    value={
                      catalogDamages.length === 0
                        ? MANUAL_DAMAGE_TYPES[0]
                        : catalogDamages.includes(damageType)
                          ? damageType
                          : catalogDamages[0] || MANUAL_DAMAGE_TYPES[0]
                    }
                    onChange={setDamageType}
                    options={catalogDamages.length === 0 ? [...MANUAL_DAMAGE_TYPES] : catalogDamages}
                    placeholder="Search damage types…"
                    allowCustomValue={false}
                    emptyListHint="No damage types in catalog for this area"
                  />
                </div>
              </>
            ) : (
              <>
                <div className="w-full min-w-0 max-w-full">
                  <SearchableOptionPicker
                    id="camera-capture-vehiclemap-part"
                    label="Car part"
                    value={selectedPart}
                    onChange={setSelectedPart}
                    options={partNames}
                    placeholder="Search or choose a panel…"
                    allowCustomValue
                    emptyListHint="Type a panel name, or pick a suggestion from the list."
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Suggestions from the vehicle map. Use “Use …” if your panel is not in the list.
                  </p>
                </div>

                <div className="w-full min-w-0 max-w-full">
                  <SearchableOptionPicker
                    id="camera-capture-vehiclemap-damage"
                    label="Damage type"
                    value={damageType || damageTypeOptions[0] || MANUAL_DAMAGE_TYPES[0]}
                    onChange={setDamageType}
                    options={damageTypeOptions}
                    placeholder="Search or choose damage type…"
                    allowCustomValue
                    emptyListHint="Type a damage name, or pick a suggestion. Use “Use …” to add a custom type."
                  />
                  <p className="text-[11px] text-muted-foreground mt-1.5">
                    Presets, full UVeye catalog, and any extra types from this scan. Custom types are
                    allowed.
                  </p>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-col gap-2 px-5 py-4 border-t border-border shrink-0 bg-card">
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!selectedPart.trim()}
                onClick={submitDetails}
                className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none"
              >
                {photoCount === 0
                  ? 'Save without photo'
                  : photoCount === 1
                    ? 'Save photo'
                    : `Save ${photoCount} photos`}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                stopStream();
                setMode('menu');
                setPendingDataUrls([]);
                setMenuIntent('default');
              }}
              className="text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-1"
            >
              Back to capture options
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200 p-4">
      <div className="bg-card rounded-2xl shadow-2xl border border-border p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="font-bold text-foreground text-base">Capture missed damage</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {menuIntent === 'append'
                ? 'Add another photo for this finding. You can pick several from the gallery at once.'
                : 'Document damage the scan did not flag — add one or more photos, then choose part and damage type.'}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {mode === 'live' && (
          <div className="space-y-3 mb-4">
            <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={captureFrame}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:bg-primary/90"
              >
                <Camera size={18} /> Capture
              </button>
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  setMode('menu');
                }}
                className="px-4 py-3 rounded-xl border border-border text-sm font-medium hover:bg-accent"
                title="Back to options"
              >
                <RotateCcw size={18} />
              </button>
            </div>
            {menuIntent === 'append' ? (
              <button
                type="button"
                onClick={() => {
                  stopStream();
                  setMode('details');
                  setMenuIntent('default');
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-2"
              >
                Back to part & damage
              </button>
            ) : (
              <button
                type="button"
                onClick={goToDetailsWithoutPhoto}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-2"
              >
                Skip photo
              </button>
            )}
          </div>
        )}

        {mode === 'menu' && (
          <div className="space-y-3">
            {error && (
              <p className="text-xs text-destructive bg-destructive/10 border border-destructive/20 rounded-lg px-3 py-2">
                {error}
              </p>
            )}
            <button
              type="button"
              onClick={startCamera}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                <Camera size={20} />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground block">Use camera</span>
                <span className="text-xs text-muted-foreground">
                  {shouldUseNativeCameraCapture()
                    ? 'Opens your camera app, then continue here'
                    : 'Live preview, then capture'}
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => galleryInputRef.current?.click()}
              className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-border hover:bg-primary/5 hover:border-primary/30 transition-all text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-accent flex items-center justify-center text-foreground">
                <Image size={20} />
              </div>
              <div>
                <span className="text-sm font-semibold text-foreground block">Choose from gallery</span>
                <span className="text-xs text-muted-foreground">
                  {menuIntent === 'append'
                    ? 'Select one or more images (multi-select supported)'
                    : 'Select one or more existing images'}
                </span>
              </div>
            </button>

            {menuIntent === 'append' ? (
              <button
                type="button"
                onClick={() => {
                  setMode('details');
                  setMenuIntent('default');
                }}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-2"
              >
                Back to part & damage
              </button>
            ) : (
              <button
                type="button"
                onClick={goToDetailsWithoutPhoto}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline py-2"
              >
                Skip photo
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              className="w-full text-center text-[11px] text-muted-foreground/80 hover:text-muted-foreground underline-offset-2 hover:underline py-1"
            >
              Cancel — close
            </button>
          </div>
        )}

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void handleGalleryFile(e)}
          className="hidden"
        />
        <input
          ref={cameraCaptureInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => void handleGalleryFile(e)}
          className="hidden"
        />
      </div>
    </div>
  );
}
