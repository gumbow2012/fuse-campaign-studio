/**
 * Brand website importer (Phase 2) — DETERMINISTIC only.
 * Returns extraction candidates; nothing is persisted until the user approves
 * and the existing onboarding step autosave writes it.
 */
import { supabase } from "@/integrations/supabase/client";

export interface BrandImportProduct {
  title: string;
  type: string;
  imageUrl: string | null;
  url: string | null;
}

export interface BrandImportCandidates {
  ok: true;
  source: "shopify" | "storefront";
  url: string;
  domain: string;
  storeName: string;
  description: string;
  faviconUrl: string | null;
  logoCandidates: string[];
  colorCandidates: string[];
  products: BrandImportProduct[];
  counts: { logos: number; colors: number; products: number };
}

export interface BrandImportFailure {
  ok: false;
  reason: string;
}

export type BrandImportResponse = BrandImportCandidates | BrandImportFailure;

/** Human label for imported data — never "Connected to Shopify". */
export function importSourceLabel(result: BrandImportCandidates) {
  return result.domain ? `Imported from ${result.domain}` : "Imported from your storefront";
}

export async function importBrandFromWebsite(url: string): Promise<BrandImportResponse> {
  const { data, error } = await supabase.functions.invoke("brand-import", { body: { url } });
  if (error) {
    return { ok: false, reason: "We couldn't read this store." };
  }
  const payload = data as BrandImportResponse | null;
  if (!payload || typeof payload !== "object" || !("ok" in payload)) {
    return { ok: false, reason: "We couldn't read this store." };
  }
  return payload;
}
