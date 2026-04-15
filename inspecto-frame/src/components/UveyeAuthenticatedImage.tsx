import { useEffect, useState } from "react";
import { fetchUveyeImageBlobUrl, isUveyeApiImageUrl } from "@/services/uveyeApi";

interface Props extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
}

/**
 * Loads UVeye `v1/image` URLs with the API key (plain &lt;img&gt; cannot send headers).
 */
export default function UveyeAuthenticatedImage({ src, className, alt, ...rest }: Props) {
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
        className={`flex flex-col items-center justify-center text-muted-foreground text-xs p-4 ${className ?? ""}`}
      >
        Could not load image (check API key / network).
      </div>
    );
  }

  if (!resolved) {
    return (
      <div
        className={`animate-pulse bg-muted/40 ${className ?? ""}`}
        aria-hidden
      />
    );
  }

  return <img src={resolved} className={className} alt={alt ?? ""} {...rest} />;
}
