/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UVeye API key (browser bundle in production—use only in trusted internal deployments). */
  readonly VITE_UVEYE_API_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
