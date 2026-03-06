import { useState } from "react"

const API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7"
const USER_ID = "7a20bd20-b93b-4742-a502-07648cb834e6"
const WORKER = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev"

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDebug, setUploadDebug] = useState<any>(null)
  const [enqueueDebug, setEnqueueDebug] = useState<any>(null)
  const [pollDebug, setPollDebug] = useState<any>(null)

  async function handleUpload() {
    if (!file) { alert("choose file first"); return }

    setUploading(true)
    setUploadDebug(null)
    setEnqueueDebug(null)
    setPollDebug(null)

    try {
      // ── Step 1: Upload ──
      const fd = new FormData()
      fd.append("file", file)

      const uploadUrl = `${WORKER}/api/uploads`
      console.log("UPLOAD URL:", uploadUrl)

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        body: fd,
      })

      const uploadRaw = await uploadRes.text()
      let uploadJson: any = null
      try { uploadJson = JSON.parse(uploadRaw) } catch {}

      setUploadDebug({ url: uploadUrl, method: "POST", status: uploadRes.status, rawText: uploadRaw, parsed: uploadJson })

      if (!uploadJson?.ok || !uploadJson?.assetKey) {
        throw new Error(`Upload failed. Status: ${uploadRes.status}. Raw: ${uploadRaw}`)
      }

      // ── Step 2: Enqueue ──
      const enqueueUrl = `${WORKER}/api/enqueue`
      const enqueueBody = {
        assetKey: uploadJson.assetKey,
        assetUrl: uploadJson.assetUrl,
        template: "armored_truck_template.json",
      }
      console.log("ENQUEUE URL:", enqueueUrl, "BODY:", enqueueBody)

      const enqueueRes = await fetch(enqueueUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        body: JSON.stringify(enqueueBody),
      })

      const enqueueRaw = await enqueueRes.text()
      let enqueueJson: any = null
      try { enqueueJson = JSON.parse(enqueueRaw) } catch {}

      setEnqueueDebug({
        url: enqueueUrl,
        method: "POST",
        requestBody: enqueueBody,
        status: enqueueRes.status,
        rawText: enqueueRaw,
        parsed: enqueueJson,
      })

      if (!enqueueJson?.projectId) {
        throw new Error(`Enqueue did not return projectId. Status: ${enqueueRes.status}. Raw: ${enqueueRaw}`)
      }

      // ── Step 3: Poll status ──
      const projectId = enqueueJson.projectId
      const pollUrl = `${WORKER}/api/projects/${projectId}`
      console.log("POLL URL:", pollUrl)

      let done = false
      let attempts = 0
      while (!done && attempts < 60) {
        attempts++
        await new Promise((r) => setTimeout(r, 3000))

        const pollRes = await fetch(pollUrl, {
          headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        })

        const pollRaw = await pollRes.text()
        let pollJson: any = null
        try { pollJson = JSON.parse(pollRaw) } catch {}

        setPollDebug({
          url: pollUrl,
          attempt: attempts,
          status: pollRes.status,
          rawText: pollRaw,
          parsed: pollJson,
        })

        const st = pollJson?.status
        if (st === "complete" || st === "failed") {
          done = true
        }
      }
    } catch (err: any) {
      setEnqueueDebug((prev: any) => ({ ...(prev || {}), error: err.message }))
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
        {uploading ? "Working…" : "Upload → Enqueue → Poll"}
      </button>

      {uploadDebug && (
        <Section title="1. Upload" color="#0f0" data={uploadDebug} />
      )}
      {enqueueDebug && (
        <Section title="2. Enqueue" color="#ff0" data={enqueueDebug} />
      )}
      {pollDebug && (
        <Section title="3. Poll Status" color="#0ff" data={pollDebug} />
      )}
    </div>
  )
}

function Section({ title, color, data }: { title: string; color: string; data: any }) {
  return (
    <>
      <h3 style={{ marginTop: 24 }}>{title}</h3>
      <pre style={{ background: "#111", color, padding: 16, borderRadius: 8, overflow: "auto", maxHeight: 400 }}>
        {JSON.stringify(data, null, 2)}
      </pre>
    </>
  )
}
