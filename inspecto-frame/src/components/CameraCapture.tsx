import React, { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { Camera, Image, X, RotateCcw, Check } from 'lucide-react';

export const MANUAL_DAMAGE_TYPES = [
  'Scratch',
  'Dent',
  'Paint Damage',
  'Crack',
  'Missing Part',
  'Other',
] as const;

export type CapturedPhotoPayload = {
  dataUrl: string;
  partName: string;
  damageType: string;
};

interface CameraCaptureProps {
  /** All inspectable car part labels (same as vehicle map list). */
  partNames: string[];
  /** When opened from a part, pre-select this name if it exists in `partNames`. */
  suggestedPartName?: string;
  onCapture: (payload: CapturedPhotoPayload) => void;
  onClose: () => void;
}

export default function CameraCapture({
  partNames,
  suggestedPartName,
  onCapture,
  onClose,
}: CameraCaptureProps) {
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [mode, setMode] = useState<'menu' | 'live' | 'details'>('menu');
  const [error, setError] = useState<string | null>(null);
  const [pendingDataUrl, setPendingDataUrl] = useState<string | null>(null);
  const [partFilter, setPartFilter] = useState('');
  const [selectedPart, setSelectedPart] = useState('');
  const [damageType, setDamageType] = useState<string>(MANUAL_DAMAGE_TYPES[0]);

  const filteredParts = useMemo(() => {
    const q = partFilter.trim().toLowerCase();
    if (!q) return partNames;
    return partNames.filter((p) => p.toLowerCase().includes(q));
  }, [partNames, partFilter]);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  const goToDetails = (dataUrl: string) => {
    stopStream();
    setMode('details');
    setPendingDataUrl(dataUrl);
    setPartFilter('');
    const suggested =
      suggestedPartName && partNames.includes(suggestedPartName) ? suggestedPartName : '';
    setSelectedPart(suggested || partNames[0] || '');
    setDamageType(MANUAL_DAMAGE_TYPES[0]);
  };

  const startCamera = async () => {
    setError(null);
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
        `${msg}. On desktop, allow camera in the browser prompt; HTTPS or localhost is required.`,
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
    setMode('menu');
    goToDetails(dataUrl);
  };

  const handleGalleryFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        goToDetails(reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const submitDetails = () => {
    if (!pendingDataUrl || !selectedPart.trim()) return;
    const dt = damageType.trim() || MANUAL_DAMAGE_TYPES[0];
    onCapture({ dataUrl: pendingDataUrl, partName: selectedPart.trim(), damageType: dt });
  };

  const handleClose = () => {
    stopStream();
    onClose();
  };

  if (mode === 'details' && pendingDataUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center animate-in fade-in duration-200 p-4">
        <div className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-lg max-h-[92vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
            <div>
              <h3 className="font-bold text-foreground text-base">Link photo to a part</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose which panel this evidence belongs to and the damage type.
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
            <div className="rounded-xl overflow-hidden border border-border bg-muted/30 aspect-video flex items-center justify-center">
              <img src={pendingDataUrl} alt="Captured" className="max-h-full max-w-full object-contain" />
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-1.5">Car part</label>
              <input
                type="text"
                value={partFilter}
                onChange={(e) => setPartFilter(e.target.value)}
                placeholder="Search parts…"
                className="w-full px-3 py-2 text-sm rounded-lg border border-input bg-background text-foreground placeholder:text-muted-foreground mb-2"
              />
              <div className="max-h-36 overflow-y-auto rounded-lg border border-border bg-muted/20 divide-y divide-border">
                {filteredParts.length === 0 ? (
                  <p className="text-xs text-muted-foreground p-3">No matching parts.</p>
                ) : (
                  filteredParts.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setSelectedPart(name)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between gap-2 ${
                        selectedPart === name ? 'bg-primary/15 text-primary font-semibold' : 'hover:bg-accent text-foreground'
                      }`}
                    >
                      <span className="truncate">{name}</span>
                      {selectedPart === name && <Check size={14} className="shrink-0" />}
                    </button>
                  ))
                )}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-foreground block mb-2">Damage type</label>
              <div className="flex flex-wrap gap-2">
                {MANUAL_DAMAGE_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDamageType(t)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                      damageType === t
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-foreground hover:bg-muted/60'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border shrink-0 bg-card">
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
              Save photo
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
            <h3 className="font-bold text-foreground text-base">Add photo evidence</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Capture or choose an image, then pick part + damage type.
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
                title="Cancel camera"
              >
                <RotateCcw size={18} />
              </button>
            </div>
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
                <span className="text-xs text-muted-foreground">Live preview, then capture</span>
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
                <span className="text-xs text-muted-foreground">Select an existing photo</span>
              </div>
            </button>
          </div>
        )}

        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          onChange={handleGalleryFile}
          className="hidden"
        />
      </div>
    </div>
  );
}
