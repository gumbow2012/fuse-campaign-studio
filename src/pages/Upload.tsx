import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const [result, setResult] = useState<string>("");

  async function upload() {
    if (!file) {
      alert("Choose a file first");
      return;
    }

    setStatus("uploading");
    setResult("");

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setStatus("error");
        setResult("Not logged in. Please sign in first.");
        return;
      }

      const form = new FormData();
      form.append("file", file);

      const res = await fetch(
        "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev/api/uploads",
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        }
      );

      const text = await res.text();

      if (!res.ok) {
        setStatus("error");
        setResult(`Error ${res.status}: ${text}`);
        return;
      }

      setStatus("success");
      setResult(text);
    } catch (e: unknown) {
      setStatus("error");
      setResult(e instanceof Error ? e.message : "Unknown error");
    }
  }

  return (
    <div className="max-w-xl mx-auto p-10">
      <h1 className="text-2xl font-bold mb-6">Fuse Upload Test</h1>

      <input
        type="file"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
        className="mb-4 block"
      />

      <button
        onClick={upload}
        disabled={status === "uploading"}
        className="px-4 py-2 bg-primary text-primary-foreground rounded disabled:opacity-50"
      >
        {status === "uploading" ? "Uploading…" : "Upload"}
      </button>

      {result && (
        <pre
          className={`mt-6 p-4 rounded text-sm whitespace-pre-wrap ${
            status === "success"
              ? "bg-green-900/20 text-green-400"
              : status === "error"
              ? "bg-red-900/20 text-red-400"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {result}
        </pre>
      )}
    </div>
  );
}
