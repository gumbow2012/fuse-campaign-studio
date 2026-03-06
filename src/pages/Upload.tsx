import { useState } from "react"

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev"
const API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7"
const USER_ID = "7a20bd20-b93b-4742-a502-07648cb834e6"

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDebug, setUploadDebug] = useState<any>(null)
  const [runResult, setRunResult] = useState("")

  async function handleUpload() {
    if (!file) { alert("choose file first"); return }

    setUploading(true)
    setUploadDebug(null)
    setRunResult("")

    try {
      const fd = new FormData()
      fd.append("file", file)

      const uploadRes = await fetch(`${WORKER_URL}/api/uploads`, {
        method: "POST",
        headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        body: fd,
      })

      const rawText = await uploadRes.text()
      let uploadJson: any = null
      try { uploadJson = JSON.parse(rawText) } catch {}

      setUploadDebug({ status: uploadRes.status, rawText, parsed: uploadJson })

      if (!uploadJson?.ok || !uploadJson?.assetKey) {
        throw new Error(`Upload failed. Status: ${uploadRes.status}. Raw response: ${rawText}`)
      }

      // Trigger template run
      const runRes = await fetch(`${WORKER_URL}/api/run/armored_truck_template.json`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
          "X-User-Id": USER_ID,
        },
        body: JSON.stringify({ assetKey: uploadJson.assetKey }),
      })

      const runJson = await runRes.json()
      setRunResult(JSON.stringify(runJson, null, 2))
    } catch (err: any) {
      setRunResult(`Error: ${err.message}`)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "monospace" }}>
      <h1>Fuse Upload Test (API-Key path)</h1>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <br /><br />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Uploading…" : "Upload & Run"}
      </button>

      {uploadDebug && (
        <>
          <h3 style={{ marginTop: 24 }}>Upload Debug</h3>
          <pre style={{ background: "#111", color: "#0f0", padding: 16, borderRadius: 8, overflow: "auto" }}>
            {JSON.stringify(uploadDebug, null, 2)}
          </pre>
        </>
      )}

      {runResult && (
        <>
          <h3 style={{ marginTop: 16 }}>Run Response</h3>
          <pre style={{ background: "#111", color: "#0ff", padding: 16, borderRadius: 8, overflow: "auto" }}>{runResult}</pre>
        </>
      )}
    </div>
  )
}
