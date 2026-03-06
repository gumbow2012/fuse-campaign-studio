import { useState } from "react"

export default function UploadPage() {

  const [file,setFile] = useState<File | null>(null)
  const [result,setResult] = useState("")

  async function upload(){

    if(!file){
      alert("choose file first")
      return
    }

    const form = new FormData()
    form.append("file",file)

    setResult("Uploading...")

    const res = await fetch(
      "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/api/uploads",
      {
        method:"POST",
        headers:{
          "X-Api-Key":"fuse_sk_live_k4d3m4dd3n2025xQ9zPv7"
        },
        body:form
      }
    )

    const text = await res.text()

    setResult(text)
  }

  return (

    <div style={{padding:40}}>

      <h1>Fuse Upload Test</h1>

      <input
        type="file"
        onChange={(e)=>setFile(e.target.files?.[0] || null)}
      />

      <br/><br/>

      <button onClick={upload}>
        Upload
      </button>

      <pre style={{marginTop:30}}>
        {result}
      </pre>

    </div>

  )
}
