export interface Env {
  ASSETS: R2Bucket;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  WEAVY_API_KEY: string;
  WEAVY_API_BASE_URL: string;
  WEAVY_FIREBASE_API_KEY: string;
  WEAVY_REFRESH_TOKEN: string;
}

export interface JobPayload {
  projectId: string;
  templateId: string;
  inputs: Record<string, string>;
}

export interface JobStatusResponse {
  status: "queued" | "running" | "complete" | "failed";
  progress?: number;
  outputs?: { items?: { type: string; url: string; label?: string }[] };
  error?: string;
}
