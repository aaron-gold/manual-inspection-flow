# Sharing Inspecto with colleagues

## Quick start (local)

1. **Node.js 18+** installed.
2. Clone or copy this `inspecto-frame` folder.
3. In the folder:

   ```bash
   npm install
   cp .env.example .env
   ```

4. The app ships with an **embedded internal UVeye key** in `src/services/uveyeApi.ts`. Optionally override via `.env` as `VITE_UVEYE_API_KEY` without editing code.

5. Run:

   ```bash
   npm run dev
   ```

   Open the URL shown (usually `http://localhost:8080`).

## Production build (static hosting)

```bash
npm run build
npm run preview   # optional local check of dist/
```

Upload the contents of `dist/` to any static host (Netlify, S3, internal IIS/Nginx). Colleagues still need the built JS to include the API key **or** you must add a small UVeye proxy—browser-only apps cannot hide a secret key from users who open DevTools. For trusted internal pilots, many teams accept env-injected keys at build time.

## Data & exports

- Inspections and **device captures** persist in **this browser only** (IndexedDB via `localforage`).
- Use **“Today’s pack (CSV + photos)”** on the dashboard to download a ZIP: spreadsheet + `captured-photos/` folders. Share that file with the team—no central server required.

## Security note

The UVeye key is in the frontend bundle (embedded constant or `VITE_*`). Anyone with the app can see it in DevTools—use only on trusted internal networks; rotate the key at the API provider if it leaks.
