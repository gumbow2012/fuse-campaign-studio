import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, supabase } from "@/integrations/supabase/client";

async function fileToDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("Could not read file"));
    reader.readAsDataURL(file);
  });
}

export async function uploadRunInputFile(file: File) {
  const dataUrl = await fileToDataUrl(file);
  const { data, error } = await supabase.functions.invoke("upload-run-input", {
    body: {
      dataUrl,
      filename: file.name,
    },
  });

  if (error) throw new Error(error.message || "Could not upload image.");
  if (data?.error) throw new Error(String(data.error));
  if (!data?.url) throw new Error("Image upload did not return a URL.");

  return String(data.url);
}

export async function uploadRunInputFileWithRunnerCode(file: File, runnerCode: string) {
  const dataUrl = await fileToDataUrl(file);
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-run-input`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_PUBLISHABLE_KEY,
      "x-runner-code": runnerCode,
    },
    body: JSON.stringify({
      dataUrl,
      filename: file.name,
    }),
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) throw new Error(data?.error ?? "Could not upload image.");
  if (!data?.url) throw new Error("Image upload did not return a URL.");

  return String(data.url);
}
