const PROD_SITE_URL = "https://fuse-us.com";

function normalizeUrl(value: string | undefined) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.replace(/\/+$/, "");
}

export function getSiteUrl() {
  const envUrl = normalizeUrl(import.meta.env.VITE_SITE_URL);
  if (envUrl) return envUrl;
  return PROD_SITE_URL;
}

export function getAbsoluteSiteUrl(path: string) {
  const base = getSiteUrl();
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
