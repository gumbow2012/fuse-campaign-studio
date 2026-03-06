import { useState } from "react"

const WORKER_URL = "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev"
const API_KEY = "fuse_sk_live_k4d3m4dd3n2025xQ9zPv7"

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState("")

  async function upload() {
    if (!file) {
      alert("choose file first")
      return
    }

    const form = new FormData()
    form.append("file", file)

    setResult("Uploading...")

    try {
      const res = await fetch(`${WORKER_URL}/api/uploads`, {
        method: "POST",
        headers: {
          "X-Api-Key": API_KEY,
          "X-User-Id": "test-user-upload-page",
        },
        body: form,
      })

      const json = await res.json()
      setResult(JSON.stringify(json, null, 2))
    } catch (err: any) {
      setResult(`Error: ${err.message}`)
    }
  }

  return (
    <div style={{ padding: 40 }}>
      <h1>Fuse Upload Test</h1>
      <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      <br /><br />
      <button onClick={upload}>Upload</button>
      <pre style={{ marginTop: 30 }}>{result}</pre>
    </div>
  )
}
