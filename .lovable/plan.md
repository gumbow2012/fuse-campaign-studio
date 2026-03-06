

## Assessment

The current `Upload.tsx` already implements the exact 5-step flow requested. The code matches the spec precisely:

1. **Upload** — POST `/api/uploads` with multipart form data
2. **run-template** — calls edge function with `{ templateId, inputs: { product_image, asset_key } }`
3. **Enqueue** — POST `/api/enqueue` with `{ projectId }`
4. **Poll** — GET `/api/projects/:id` every 3s
5. **Debug panels** — 4 sections showing raw responses

**What needs to change:**

The only missing piece is rendering **output URLs/previews** when the poll returns `status: "complete"`. Currently the poll just stops — it doesn't surface the outputs visually.

## Plan

**Single file change: `src/pages/Upload.tsx`**

1. Add a `finalResult` state to capture the final poll response when status is `complete` or `failed`.

2. After the polling loop, set `finalResult` from the last poll response.

3. Add a results section at the bottom of the UI:
   - If `status === "complete"`: render each output URL as a clickable link, and if the URL ends in an image/video extension, show an inline `<img>` or `<video>` preview.
   - If `status === "failed"`: render the error payload in a red debug block.

4. No other changes — no prompt editing, no template internals, no graph logic. The existing upload, run-template, enqueue, and poll logic stays exactly as-is.

