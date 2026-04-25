/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** UVeye API key (browser bundle in production—use only in trusted internal deployments). */
  readonly VITE_UVEYE_API_KEY?: string;
  /** Set to `true` to call `https://us.api.uveye.app` directly (requires UVeye CORS to allow your origin). */
  readonly VITE_UVEYE_DIRECT?: string;
  /** Set to `true` to always use `/uveye-api` proxy (e.g. Lovable custom domain with your own proxy). */
  readonly VITE_UVEYE_FORCE_PROXY?: string;
  /** Query param name for image URL auth when not using proxy (`key` vs `uveye-api-key`). */
  readonly VITE_UVEYE_IMAGE_KEY_QUERY?: string;
  /** Semver from package.json, injected at build/dev server start. */
  readonly VITE_APP_VERSION: string;
  /** Short git SHA (or CI commit), injected at build/dev server start. */
  readonly VITE_APP_GIT_SHA: string;
  /** `"1"` when the local tree had uncommitted changes at bundle time (dev only). */
  readonly VITE_APP_GIT_DIRTY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
