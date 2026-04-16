/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UVeye API key (browser bundle in production—use only in trusted internal deployments). */
  readonly VITE_UVEYE_API_KEY?: string;
  /** Set to `true` to call `https://us.api.uveye.app` directly (requires UVeye CORS to allow your origin). */
  readonly VITE_UVEYE_DIRECT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
