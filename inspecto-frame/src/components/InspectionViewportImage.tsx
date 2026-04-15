import React, { useCallback, useEffect, useRef, useState } from 'react';
import UveyeAuthenticatedImage from '@/components/UveyeAuthenticatedImage';

type Props = {
  src: string;
  alt: string;
  /** 1 = fit entire image in view; &gt;1 = magnify from that fit baseline */
  zoom: number;
  onZoomChange: (z: number) => void;
};

/**
 * Fits the image in the visible area at zoom 1 (contain).
 * When zoom &gt; 1, the bitmap is larger than the viewport and the user can scroll + drag to pan.
 */
export default function InspectionViewportImage({ src, alt, zoom, onZoomChange }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const dragRef = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

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

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      const withModifier = e.ctrlKey || e.metaKey;
      if (zoom > 1 && !withModifier) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? -0.07 : 0.07;
      onZoomChange(Math.min(4, Math.max(1, zoom + delta)));
    },
    [zoom, onZoomChange],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (zoom <= 1 || e.button !== 0) return;
      const el = scrollRef.current;
      if (!el) return;
      el.setPointerCapture(e.pointerId);
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
    dragRef.current = null;
    const el = scrollRef.current;
    try {
      if (el) el.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <div
      ref={scrollRef}
      className={`relative w-full h-full min-h-0 overflow-auto overscroll-contain ${
        zoom > 1 ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      style={{ touchAction: zoom > 1 ? 'none' : undefined }}
    >
      <div
        className="box-border flex min-h-full w-full min-w-0 flex-1 flex-col items-center justify-center p-2"
        style={{ minHeight: '100%' }}
      >
        <UveyeAuthenticatedImage
          src={src}
          alt={alt}
          onLoad={onImgLoad}
          draggable={false}
          className="select-none bg-transparent"
          style={
            displayW && displayH
              ? {
                  width: displayW,
                  height: displayH,
                  objectFit: 'contain',
                  maxWidth: 'none',
                  maxHeight: 'none',
                }
              : {
                  maxWidth: '100%',
                  maxHeight: '100%',
                  width: 'auto',
                  height: 'auto',
                  objectFit: 'contain',
                }
          }
        />
      </div>
    </div>
  );
}
