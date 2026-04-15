

## Plan: Three New Features for the Inspection App

### 1. Production API Integration (UVeye)

**What**: Pull rear/scan data from the UVeye production API (`https://us.api.uveye.app/v1/inspection/`).

**How**:
- Create a Supabase Edge Function `fetch-uveye-inspection` that proxies requests to the UVeye API (keeps API key server-side)
- Store the UVeye API key as a project secret (you'll need to provide the key and any auth headers)
- Add a "Pull from Production" button on the inspection view that fetches data by VIN or inspection ID
- Map the UVeye response (damages, images, vehicle info) into the app's existing data model
- **Waiting on you**: API authentication details (API key, headers) and a sample response so we can map fields correctly

### 2. Summary Report Per Car

**What**: In-app summary page + downloadable PDF for each inspection.

**How**:
- Add a "Summary" tab/button on the inspection view
- **In-app summary**: A dedicated panel showing vehicle info, total damage count, damage list with severity/location, reviewed vs. pending parts, and thumbnail images
- **PDF export**: Use `jsPDF` library to generate a downloadable PDF with vehicle details header, damage table, and embedded damage thumbnails
- Add a "Download PDF" button on the summary view

### 3. Camera Capture + Gallery Upload

**What**: When adding a damage image, open the device camera directly or pick from gallery.

**How**:
- Use HTML `<input type="file" accept="image/*" capture="environment">` for camera capture
- Add a photo picker UI with two options: "Take Photo" (opens camera) and "Choose from Gallery" (opens file picker)
- Wire captured/selected images into the existing damage flow — associate the photo with the current part and frame
- Store images as base64 data URLs in the inspection state (or as blobs if we add storage later)
- Works on mobile browsers via the standard MediaCapture API

### Implementation Order

1. Camera capture (self-contained, no external dependencies)
2. Summary report (self-contained, uses existing data)
3. UVeye API integration (blocked until you share auth details + sample response)

### Files to Create/Edit

| File | Change |
|------|--------|
| `src/components/AssistedInspectionV3.tsx` | Add camera capture UI, summary button |
| `src/components/InspectionSummary.tsx` | New — in-app summary view |
| `src/components/InspectionPdfReport.tsx` | New — PDF generation logic |
| `supabase/functions/fetch-uveye-inspection/index.ts` | New — API proxy edge function |
| `src/pages/Index.tsx` | Wire summary view into navigation |
| `package.json` | Add `jspdf` dependency |

I'll start with features 1 and 2 once you approve, and wait for the UVeye auth details before building feature 3.

