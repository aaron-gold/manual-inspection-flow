import React, { useCallback, useEffect, useRef, useState } from 'react';
import UveyeAuthenticatedImage from '@/components/UveyeAuthenticatedImage';

type Props = {
  src: string;
  alt: string;
  /** 1 = fit entire image in view; &gt;1 = magnify from that fit baseline */
  zoom: number;
  onZoomChange: (z: number) => void;
  /** Single tap / click on the photo (after a pinch, clicks are ignored briefly). */
  onPhotoTap?: () => void;
  /**
   * CSS `filter: brightness(X)` applied to the rendered image. 1 = untouched, &gt;1 = lighter,
   * &lt;1 = darker. Used for inspecting underexposed scan frames.
   */
  brightness?: number;
};

/**
 * Fits the image in the visible area at zoom 1 (contain).
 * When zoom &gt; 1, the bitmap is larger than the viewport and the user can scroll + drag to pan.
 * Pinch-to-zoom uses two-finger spread on touch devices.
 */
export default function InspectionViewportImage({
  src,
  alt,
  zoom,
  onZoomChange,
  onPhotoTap,
  brightness = 1,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);
  const panDownRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  const pinchRef = useRef<{ dist0: number; z0: number } | null>(null);
  const lastPinchEndRef = useRef(0);

  useEffect(() => {
    setNatural(null);
  }, [src]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setBox({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setBox({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const onImgLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (w > 0 && h > 0) setNatural({ w, h });
  }, []);

  const fit =
    natural && box.w > 0 && box.h > 0
      ? Math.min(box.w / natural.w, box.h / natural.h)
      : 0;

  const displayW =
    natural && fit > 0 ? Math.max(1, Math.round(natural.w * fit * zoom)) : undefined;
  const displayH =
    natural && fit > 0 ? Math.max(1, Math.round(natural.h * fit * zoom)) : undefined;

  /** After fit or zoom change, keep view roughly centered when zooming back to 1 */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !natural || fit <= 0) return;
    if (zoom > 1) return;
    const sw = el.scrollWidth - el.clientWidth;
    const sh = el.scrollHeight - el.clientHeight;
    el.scrollLeft = sw > 0 ? sw / 2 : 0;
    el.scrollTop = sh > 0 ? sh / 2 : 0;
  }, [zoom, natural, fit, box.w, box.h, displayW, displayH]);

  /** React's `onWheel` is passive in many browsers — `preventDefault` throws. Use `{ passive: false }`. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      const withModifier = e.ctrlKey || e.metaKey;
      if (zoom > 1 && !withModifier) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.07 : 0.07;
      onZoomChange(Math.min(4, Math.max(1, zoom + delta)));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, [zoom, onZoomChange]);

  /** Two-finger pinch zoom (touch screens). */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const distance = (a: Touch, b: Touch) =>
      Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          dist0: distance(e.touches[0], e.touches[1]),
          z0: zoomRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 2 || !pinchRef.current) return;
      const d = distance(e.touches[0], e.touches[1]);
      const { dist0, z0 } = pinchRef.current;
      if (dist0 <= 0) return;
      e.preventDefault();
      const next = Math.min(4, Math.max(1, z0 * (d / dist0)));
      onZoomChange(next);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchRef.current && e.touches.length < 2) {
        lastPinchEndRef.current = Date.now();
        pinchRef.current = null;
      }
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd);
    el.addEventListener('touchcancel', onTouchEnd);
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, [onZoomChange]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (zoom <= 1) return;
      // Only the primary pointer starts a pan — prevents a second finger (pinch-zoom) or a
      // right-click from also starting a drag. Works uniformly for mouse, touch, and pen.
      if (!e.isPrimary) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const el = scrollRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
      panDownRef.current = { x: e.clientX, y: e.clientY };
      dragRef.current = {
        x: e.clientX,
        y: e.clientY,
        sl: el.scrollLeft,
        st: el.scrollTop,
      };
    },
    [zoom],
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    const dx = e.clientX - dragRef.current.x;
    const dy = e.clientY - dragRef.current.y;
    el.scrollLeft = dragRef.current.sl - dx;
    el.scrollTop = dragRef.current.st - dy;
  }, []);

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (zoomRef.current > 1 && panDownRef.current) {
      const dx = e.clientX - panDownRef.current.x;
      const dy = e.clientY - panDownRef.current.y;
      if (Math.hypot(dx, dy) > 12) suppressClickRef.current = true;
    }
    panDownRef.current = null;
    dragRef.current = null;
    const el = scrollRef.current;
    try {
      if (el) el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  const onPhotoClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onPhotoTap) return;
      if (suppressClickRef.current) {
        suppressClickRef.current = false;
        return;
      }
      if (Date.now() - lastPinchEndRef.current < 500) return;
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.tagName !== 'IMG') return;
      onPhotoTap();
    },
    [onPhotoTap],
  );

  return (
    <div
      ref={scrollRef}
      className={`relative w-full h-full min-h-0 overflow-auto overscroll-contain ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onClick={onPhotoClick}
      style={{ touchAction: 'none' }}
    >
      {/*
        At zoom=1 the wrapper is exactly the viewport (min-width/height 100%) so the fit image
        centers cleanly. At zoom>1 the wrapper grows to `max-content` in both axes, which lets
        the scroll container see a wider/taller child and enables pan in any direction.
      */}
      <div
        className="box-border flex items-center justify-center p-2"
        style={{
          minWidth: '100%',
          minHeight: '100%',
          width: 'max-content',
          height: 'max-content',
        }}
      >
        <UveyeAuthenticatedImage
          src={src}
          alt={alt}
          onLoad={onImgLoad}
          draggable={false}
          className="select-none bg-transparent"
          style={{
            ...(displayW && displayH
              ? {
                  width: displayW,
                  height: displayH,
                  objectFit: 'contain' as const,
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
              : {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain' as const,
                }),
            // Brightness filter is applied here so both zoom modes (fit + magnified) benefit.
            ...(brightness !== 1 ? { filter: `brightness(${brightness})` } : {}),
          }}
        />
      </div>
    </div>
  );
}
