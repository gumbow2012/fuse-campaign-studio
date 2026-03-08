export interface Env {
  FUSE_TEMPLATES: R2Bucket;
  FUSE_ASSETS: R2Bucket;
  SUPABASE_URL: string;
SUPABASE_SERVICE_ROLE_KEY: string;
  FUSE_API_KEY?: string;
  SUPABASE_ANON_KEY: string;
  // Legacy Weavy (kept for HAR import only)
  WEAVY_API_KEY?: string;
  WEAVY_API_BASE_URL?: string;
  WEAVY_FIREBASE_API_KEY?: string;
  WEAVY_REFRESH_TOKEN?: string;
  // Model API keys for direct execution
  FAL_API_KEY?: string;
  KLING_ACCESS_KEY?: string;  // also checked as KLING_AK
  KLING_SECRET_KEY?: string;  // also checked as KLING_SK
  KLING_AK?: string;
  KLING_SK?: string;
  GEMINI_API_KEY?: string;
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
