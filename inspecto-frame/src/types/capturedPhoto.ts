/** Inspector evidence photo — either in-memory (dataUrl) or stored (imageUrl). */
export type CapturedPhotoEntry = {
  partName: string;
  damageType: string;
  timestamp: Date;
  dataUrl?: string;
  imageUrl?: string;
  storagePath?: string;
  /** When set, matches `Damage.captureId` for the same camera capture. */
  captureId?: string;
};
