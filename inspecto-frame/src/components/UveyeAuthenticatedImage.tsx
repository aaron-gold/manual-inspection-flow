import { useEffect, useState } from "react";
import { fetchUveyeImageBlobUrl, isUveyeApiImageUrl } from "@/services/uveyeApi";
import { cn } from "@/lib/utils";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Loads UVeye `v1/image` URLs with the API key (plain &lt;img&gt; cannot send headers).
 */
export default function UveyeAuthenticatedImage({ src, className, alt, onError, ...rest }: Props) {
  const [resolved, setResolved] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!src) {
      setResolved(null);
      return;
    }
    if (!isUveyeApiImageUrl(src)) {
      setResolved(src);
      return;
    }

    let cancelled = false;
    setFailed(false);
    setResolved(null);

    fetchUveyeImageBlobUrl(src)
      .then((url) => {
        if (!cancelled) setResolved(url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
      // Blob URLs may be shared from uveyeApi cache — do not revoke here.
    };
  }, [src]);

  if (failed) {
    return (
      <div
        className={cn(
          "flex min-h-[120px] w-full flex-col items-center justify-center rounded-md border border-border/60 bg-muted/20 p-4 text-center text-muted-foreground text-xs",
          className,
        )}
      >
        Could not load image (check API key / network).
      </div>
    );
  }

  if (!resolved) {
    /* Do not merge `className` here — callers often pass bg-transparent for &lt;img&gt;, which made the loader invisible on dark viewports. */
    return (
      <div
        className="min-h-[min(45vh,520px)] w-full max-w-full shrink-0 self-stretch animate-pulse rounded-md bg-muted/35 ring-1 ring-inset ring-border/30"
        aria-hidden
      />
    );
  }

  return (
    <img
      src={resolved}
      className={className}
      alt={alt ?? ""}
      onError={(e) => {
        onError?.(e);
        setFailed(true);
      }}
      {...rest}
    />
  );
}
