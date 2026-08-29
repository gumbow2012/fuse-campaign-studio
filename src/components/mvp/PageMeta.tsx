import { Helmet } from "react-helmet-async";

const SITE_URL = "https://app.fuse-us.com";

/** Existing brand asset — no generated OG artwork. */
export const DEFAULT_OG_IMAGE = `${SITE_URL}/fuse-logo.png`;

/** Absolute-ise a real asset path; drop anything that isn't usable by crawlers. */
function absoluteImage(image?: string | null) {
  const value = (image ?? "").trim();
  if (!value) return DEFAULT_OG_IMAGE;
  if (value.startsWith("http://") || value.startsWith("https://")) return value;
  if (value.startsWith("/")) return `${SITE_URL}${value}`;
  return DEFAULT_OG_IMAGE;
}

export default function PageMeta({
  title,
  description,
  path,
  image,
  type = "website",
  noindex = false,
}: {
  title: string;
  description: string;
  path: string;
  /** Real page-specific preview (template preview_url, creator avatar, drop cover). */
  image?: string | null;
  type?: "website" | "article" | "profile";
  noindex?: boolean;
}) {
  const url = `${SITE_URL}${path}`;
  const ogImage = absoluteImage(image);

  return (
    <Helmet>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      {noindex ? <meta name="robots" content="noindex, follow" /> : null}
      <meta property="og:site_name" content="FUSE" />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:type" content={type} />
      <meta property="og:image" content={ogImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
    </Helmet>
  );
}
