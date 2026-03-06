import { useState } from "react"
import { supabase } from "@/integrations/supabase/client"

const API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7"
const USER_ID = "7a20bd20-b93b-4742-a502-07648cb834e6"
const WORKER = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev"

// Pick any active template — change as needed
const TEMPLATE_ID = "7a924959-e168-4a0e-bb25-8db08d8ca4be" // GARAGE

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadDebug, setUploadDebug] = useState<any>(null)
  const [runTemplateDebug, setRunTemplateDebug] = useState<any>(null)
  const [enqueueDebug, setEnqueueDebug] = useState<any>(null)
  const [pollDebug, setPollDebug] = useState<any>(null)
  const [finalResult, setFinalResult] = useState<any>(null)

  async function handleUpload() {
    if (!file) { alert("choose file first"); return }

    setUploading(true)
    setUploadDebug(null)
    setRunTemplateDebug(null)
    setEnqueueDebug(null)
    setPollDebug(null)

    try {
      // ── Step 1: Upload to CF Worker R2 ──
      const fd = new FormData()
      fd.append("file", file)

      const uploadUrl = `${WORKER}/api/uploads`
      console.log("STEP 1 — UPLOAD URL:", uploadUrl)

      const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: { "X-Api-Key": API_KEY, "X-User-Id": USER_ID },
        body: fd,
      })

      const uploadRaw = await uploadRes.text()
      let uploadJson: any = null
      try { uploadJson = JSON.parse(uploadRaw) } catch {}

      setUploadDebug({ url: uploadUrl, method: "POST", status: uploadRes.status, rawText: uploadRaw, parsed: uploadJson })
      console.log("STEP 1 RESULT:", uploadJson)

      if (!uploadJson?.ok || !uploadJson?.assetKey) {
        throw new Error(`Upload failed. Status: ${uploadRes.status}. Raw: ${uploadRaw}`)
      }

      // ── Step 2: Call run-template edge function ──
      // This creates the project row in Supabase + deducts credits + enqueues to CF Worker
      const { data: { session } } = await supabase.auth.getSession()
      const accessToken = session?.access_token
      if (!accessToken) throw new Error("Not logged in — no Supabase session")

      const runTemplateBody = {
        templateId: TEMPLATE_ID,
        inputs: {
          product_image: uploadJson.assetUrl,
          asset_key: uploadJson.assetKey,
        },
      }

      console.log("STEP 2 — run-template request body:", JSON.stringify(runTemplateBody, null, 2))

      const rtRes = await supabase.functions.invoke("run-template", {
        body: runTemplateBody,
      })

      const rtData = rtRes.data
      const rtError = rtRes.error

      setRunTemplateDebug({
        functionName: "run-template",
        requestBody: runTemplateBody,
        response: rtData,
        error: rtError ? { message: rtError.message, name: rtError.name } : null,
      })
      console.log("STEP 2 RESULT:", rtData, rtError)

      if (rtError || !rtData?.projectId) {
        throw new Error(`run-template failed: ${rtError?.message || JSON.stringify(rtData)}`)
      }

      const projectId = rtData.projectId

      // ── Step 3: Explicitly call /api/enqueue (belt-and-suspenders, edge fn already does this) ──
      const enqueueUrl = `${WORKER}/api/enqueue`
      const enqueueBody = { projectId }

      console.log("STEP 3 — ENQUEUE URL:", enqueueUrl, "BODY:", enqueueBody)

      const enqueueRes = await fetch(enqueueUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-Key": API_KEY,
          "X-User-Id": USER_ID,
        },
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
      console.log("STEP 3 RESULT:", enqueueJson)

      // ── Step 4: Poll status ──
      const pollUrl = `${WORKER}/api/projects/${projectId}`
      console.log("STEP 4 — POLL URL:", pollUrl)

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
          projectId,
          attempt: attempts,
          status: pollRes.status,
          rawText: pollRaw,
          parsed: pollJson,
        })
        console.log(`STEP 4 POLL #${attempts}:`, pollJson)

        const st = pollJson?.status
        if (st === "complete" || st === "failed") {
          done = true
        }
      }
    } catch (err: any) {
      console.error("UPLOAD FLOW ERROR:", err)
      setRunTemplateDebug((prev: any) => ({ ...(prev || {}), error: err.message }))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div style={{ padding: 40, fontFamily: "monospace" }}>
      <h1>Fuse Upload Test (Edge Function path)</h1>
      <p style={{ color: "#aaa" }}>Template: GARAGE ({TEMPLATE_ID})</p>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <br /><br />
      <button onClick={handleUpload} disabled={uploading}>
        {uploading ? "Working…" : "Upload → run-template → Enqueue → Poll"}
      </button>

      {uploadDebug && <Section title="1. Upload to R2" color="#0f0" data={uploadDebug} />}
      {runTemplateDebug && <Section title="2. run-template (creates project)" color="#f90" data={runTemplateDebug} />}
      {enqueueDebug && <Section title="3. Enqueue (kick runner)" color="#ff0" data={enqueueDebug} />}
      {pollDebug && <Section title="4. Poll Status" color="#0ff" data={pollDebug} />}
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
