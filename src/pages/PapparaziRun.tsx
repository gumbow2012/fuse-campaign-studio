import { useState, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Upload, Loader2, CheckCircle, AlertCircle, Image, Film, ArrowLeft } from "lucide-react";
import Navbar from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Phase = "idle" | "uploading" | "running" | "complete" | "error";

type RunResult = {
  outputImageUrl: string | null;
  outputVideoUrl: string | null;
};

const PapparaziRun = () => {
  const { user, profile, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hardcoded Weavy recipe ID for PAPPARAZI
  const templateId = "dvgEXt4aeShCeokMq5MIpZ";

  const uploadToStorage = async (userId: string, sourceFile: File): Promise<string> => {
    const ext = sourceFile.name.split(".").pop() || "png";
    const path = `${userId}/${Date.now()}-product_image.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from("template-inputs")
      .upload(path, sourceFile, { upsert: true });
    if (uploadErr) throw new Error(`Upload failed: ${uploadErr.message}`);

    const { data: signedData, error: signErr } = await supabase.storage
      .from("template-inputs")
      .createSignedUrl(path, 3600);
    if (signErr || !signedData?.signedUrl) throw new Error("Could not generate upload URL");

    return signedData.signedUrl;
  };

  const getWeavyJobStatus = async (projectId: string, token: string) => {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/weavy-job-status?projectId=${encodeURIComponent(projectId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      },
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((data as { error?: string }).error || `Status check failed (${res.status})`);
    }

    return data as {
      status: "running" | "complete" | "failed";
      outputs?: { items?: { type: string; url: string }[] };
      error?: string;
    };
  };

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const MAX_DIMENSION = 2048;
  const MAX_FILE_SIZE_MB = 10;

  const downscaleImage = useCallback((file: File): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const { width, height } = img;
        if (width <= MAX_DIMENSION && height <= MAX_DIMENSION && file.size <= MAX_FILE_SIZE_MB * 1024 * 1024) {
          resolve(file);
          return;
        }
        const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(width * scale);
        canvas.height = Math.round(height * scale);
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error("Downscale failed")); return; }
            const newFile = new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
            toast({ title: "Image resized", description: `Downscaled from ${width}×${height} to ${canvas.width}×${canvas.height} for compatibility.` });
            resolve(newFile);
          },
          "image/jpeg",
          0.85,
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not read image")); };
      img.src = url;
    });
  }, []);

  const handleFile = useCallback(async (f: File | null) => {
    setPhase("idle");
    setErrorMsg(null);
    setResult(null);
    if (!f) { setFile(null); setPreview(null); return; }

    if (f.size > 100 * 1024 * 1024) {
      toast({ title: "File too large", description: "Please use an image under 100 MB.", variant: "destructive" });
      return;
    }

    try {
      const processed = await downscaleImage(f);
      setFile(processed);
      setPreview(URL.createObjectURL(processed));
    } catch {
      toast({ title: "Error", description: "Could not process the image.", variant: "destructive" });
    }
  }, [downscaleImage]);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f && (f.type === "image/png" || f.type === "image/jpeg")) {
        handleFile(f);
      }
    },
    [handleFile],
  );

  const handleRun = async () => {
    if (!file || !templateId || !user) return;

    setPhase("uploading");
    setErrorMsg(null);
    setResult(null);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // 1) Upload image to storage and create signed URL
      const imageUrl = await uploadToStorage(user.id, file);

      // 2) Resolve template UUID by recipe ID
      const { data: templateRow, error: templateErr } = await supabase
        .from("templates")
        .select("id")
        .eq("weavy_recipe_id", templateId)
        .eq("is_active", true)
        .limit(1)
        .maybeSingle();

      if (templateErr || !templateRow?.id) {
        throw new Error("Template is not configured in the database");
      }

      // 3) Trigger backend template run
      setPhase("running");
      const { data: runData, error: runErr } = await supabase.functions.invoke("run-template", {
        body: {
          templateId: templateRow.id,
          inputs: { product_image: imageUrl },
        },
      });

      if (runErr) throw new Error(runErr.message);
      if (runData?.status === "failed") {
        throw new Error(runData.error || "Template run failed");
      }

      const projectId = runData?.projectId as string | undefined;
      if (!projectId) throw new Error("Run started but no project ID was returned");

      

      // 4) Poll for status
      pollRef.current = setInterval(async () => {
        try {
          const status = await getWeavyJobStatus(projectId, token);

          if (status.status === "complete") {
            clearInterval(pollRef.current!);
            pollRef.current = null;

            const items = status.outputs?.items || [];
            setResult({
              outputImageUrl: items.find((i) => i.type === "image")?.url ?? null,
              outputVideoUrl: items.find((i) => i.type === "video")?.url ?? null,
            });
            setPhase("complete");
            refreshProfile();
          } else if (status.status === "failed") {
            clearInterval(pollRef.current!);
            pollRef.current = null;
            const failMsg = status.error || "Run failed.";
            setErrorMsg(failMsg);
            setPhase("error");
            toast({ title: "Run Failed", description: failMsg, variant: "destructive" });
          }
        } catch {
          // Swallow transient poll errors
        }
      }, 2000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setErrorMsg(msg);
      setPhase("error");
      toast({ title: "Error", description: msg, variant: "destructive" });
    }
  };

  const reset = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    setFile(null);
    setPreview(null);
    setPhase("idle");
    setErrorMsg(null);
    
    setResult(null);
  };

  const isReady = !!file && !!templateId && phase === "idle";

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Navbar />
      <div className="container mx-auto max-w-2xl px-6 pt-28 pb-16">
        {/* Header */}
        <button
          onClick={() => navigate("/app/templates")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-3 h-3" /> Back to Templates
        </button>

        <h1 className="font-display text-3xl font-black tracking-tight mb-2">PAPPARAZI</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Upload a product image → AI generates styled editorial shots.
        </p>


        {/* Upload Zone */}
        <div
          onDrop={onDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => {
            if (phase !== "idle") return;
            const input = document.createElement("input");
            input.type = "file";
            input.accept = "image/png,image/jpeg";
            input.onchange = (e) => {
              const f = (e.target as HTMLInputElement).files?.[0];
              if (f) handleFile(f);
            };
            input.click();
          }}
          className={`
            relative rounded-xl border-2 border-dashed p-8 text-center cursor-pointer transition-all
            ${preview ? "border-primary/40 bg-primary/5" : "border-white/10 hover:border-white/20 bg-white/[0.02]"}
            ${phase !== "idle" ? "pointer-events-none opacity-70" : ""}
          `}
        >
          {preview ? (
            <div className="flex flex-col items-center gap-4">
              <img
                src={preview}
                alt="Product preview"
                className="max-h-64 rounded-lg object-contain"
              />
              <span className="text-xs text-muted-foreground">{file?.name}</span>
              {phase === "idle" && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleFile(null);
                  }}
                  className="text-xs text-destructive hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 py-8">
              <Upload className="w-8 h-8 text-muted-foreground" />
              <p className="text-sm font-medium">Upload Product Image</p>
              <p className="text-xs text-muted-foreground">PNG or JPG · Drag & drop or click</p>
            </div>
          )}
        </div>

        {/* Run Button */}
        <Button
          onClick={handleRun}
          disabled={!isReady}
          className="w-full mt-6 h-12 text-sm font-bold"
          size="lg"
        >
          {phase === "uploading" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {phase === "running" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          {phase === "uploading"
            ? "Uploading…"
            : phase === "running"
              ? "Running…"
              : "Run PAPPARAZI"}
        </Button>

        {profile && (
          <p className="text-[10px] text-muted-foreground text-center mt-2">
            Balance: {profile.credits_balance} credits
          </p>
        )}

        {/* Status Panel */}
        {phase === "error" && (
          <div className="mt-6 rounded-xl border border-destructive/30 bg-destructive/5 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-sm font-bold text-destructive">Error</span>
            </div>
            <p className="text-xs text-muted-foreground">{errorMsg}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={reset}>
              Try Again
            </Button>
          </div>
        )}

        {phase === "running" && (
          <div className="mt-6 rounded-xl border border-primary/20 bg-primary/5 p-5 text-center">
            <Loader2 className="w-6 h-6 mx-auto mb-3 animate-spin text-primary" />
            <p className="text-sm font-medium">Processing…</p>
            <p className="text-xs text-muted-foreground mt-1">
              Your image is being styled by Gemini AI. This may take 30–90 seconds.
            </p>
          </div>
        )}

        {/* Output Display */}
        {phase === "complete" && result && (
          <div className="mt-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-primary">
              <CheckCircle className="w-4 h-4" /> Complete
            </div>

            {result.outputImageUrl && (
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                  <Image className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Generated Image</span>
                </div>
                <img
                  src={result.outputImageUrl}
                  alt="Generated output"
                  className="w-full"
                />
                <div className="p-3">
                  <a
                    href={result.outputImageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Download Image ↗
                  </a>
                </div>
              </div>
            )}

            {result.outputVideoUrl && (
              <div className="rounded-xl border border-white/[0.06] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 bg-white/[0.02] border-b border-white/[0.06]">
                  <Film className="w-3 h-3 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground font-medium">Generated Video</span>
                </div>
                <video
                  src={result.outputVideoUrl}
                  controls
                  className="w-full"
                />
                <div className="p-3">
                  <a
                    href={result.outputVideoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-primary hover:underline"
                  >
                    Download Video ↗
                  </a>
                </div>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={reset}>
              Run Another
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PapparaziRun;
