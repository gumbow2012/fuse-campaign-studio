import { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { Upload, X, Loader2, Download, ImageIcon } from "lucide-react";
import { toast } from "sonner";

const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL || "";

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token || "";
}

async function uploadToR2(token: string, file: File): Promise<string> {
  const presignRes = await fetch(`${CF_WORKER_URL}/api/uploads/presign`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filename: file.name,
      contentType: file.type,
    }),
  });
  if (!presignRes.ok) throw new Error("Presign failed");
  const { key, uploadUrl } = await presignRes.json();

  await fetch(uploadUrl || `${CF_WORKER_URL}/api/uploads/${key}`, {
    method: "PUT",
    headers: { "Content-Type": file.type, Authorization: `Bearer ${token}` },
    body: file,
  });

  return key;
}

interface ImageSlot {
  label: string;
  file: File | null;
  key: string | null;
}

export default function NanoRun() {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState("");
  const [slots, setSlots] = useState<ImageSlot[]>([
    { label: "Base Image", file: null, key: null },
    { label: "Clothing / Overlay", file: null, key: null },
    { label: "Logo / Brand", file: null, key: null },
  ]);
  const [running, setRunning] = useState(false);
  const [outputUrl, setOutputUrl] = useState<string | null>(null);

  const updateSlot = useCallback((idx: number, file: File | null) => {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, file, key: null } : s))
    );
  }, []);

  const handleRun = async () => {
    if (!prompt.trim()) {
      toast.error("Enter a prompt");
      return;
    }
    setRunning(true);
    setOutputUrl(null);

    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");

      // Upload files that have been selected
      const imageUrls: string[] = [];
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (slot.file) {
          const key = await uploadToR2(token, slot.file);
          setSlots((prev) =>
            prev.map((s, j) => (j === i ? { ...s, key } : s))
          );
          imageUrls.push(key);
        }
      }

      // Call nano endpoint
      const res = await fetch(`${CF_WORKER_URL}/api/nano/run`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt,
          imageUrls,
          model: "gemini-2.0-flash-exp-image-generation",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error((err as any).error || `HTTP ${res.status}`);
      }

      const data = await res.json() as { outputUrl: string };
      setOutputUrl(data.outputUrl);
      toast.success("Image generated!");
    } catch (e: any) {
      toast.error(e.message || "Generation failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16">
        <h1 className="text-2xl font-bold mb-1">Nano Banana Run</h1>
        <p className="text-muted-foreground text-sm mb-8">
          Generate images with Gemini — upload inputs, write a prompt, hit Run.
        </p>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: Inputs */}
          <div className="space-y-5">
            {/* Image upload slots */}
            {slots.map((slot, idx) => (
              <div key={idx}>
                <label className="text-sm font-medium mb-1 block">
                  {slot.label}
                  <span className="text-muted-foreground ml-1 text-xs">(optional)</span>
                </label>
                {slot.file ? (
                  <div className="relative rounded-lg border overflow-hidden">
                    <img
                      src={URL.createObjectURL(slot.file)}
                      alt={slot.label}
                      className="w-full h-36 object-cover"
                    />
                    <button
                      onClick={() => updateSlot(idx, null)}
                      className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1 hover:bg-black/80"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center h-28 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/40 transition-colors">
                    <Upload className="w-5 h-5 text-muted-foreground mb-1" />
                    <span className="text-xs text-muted-foreground">Click to upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0] || null;
                        updateSlot(idx, f);
                      }}
                    />
                  </label>
                )}
              </div>
            ))}

            {/* Prompt */}
            <div>
              <label className="text-sm font-medium mb-1 block">Prompt</label>
              <Textarea
                rows={4}
                placeholder="Describe the output you want..."
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
              />
            </div>

            <Button
              onClick={handleRun}
              disabled={running || !prompt.trim()}
              className="w-full"
              size="lg"
            >
              {running ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating…
                </>
              ) : (
                "Run"
              )}
            </Button>
          </div>

          {/* Right: Output */}
          <div className="flex flex-col items-center justify-center min-h-[300px] border rounded-xl bg-muted/20">
            {outputUrl ? (
              <div className="space-y-3 w-full p-4">
                <img
                  src={outputUrl}
                  alt="Generated output"
                  className="w-full rounded-lg border"
                />
                <a
                  href={outputUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </a>
              </div>
            ) : running ? (
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-sm">Calling Gemini…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-muted-foreground">
                <ImageIcon className="w-10 h-10 opacity-40" />
                <span className="text-sm">Output will appear here</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
