/**
 * Canonical marketplace slug for a template. Uses the backend slug when the
 * catalog provides one, otherwise a stable slugification of the template name
 * (the detail endpoint resolves either form).
 */

export function slugifyTemplateName(name: string) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function templateSlug(template: {
  slug?: string | null;
  name?: string | null;
  id?: string | null;
}) {
  const slug = (template.slug ?? "").trim();
  if (slug) return slug;
  const name = (template.name ?? template.id ?? "").toString();
  return slugifyTemplateName(name);
}

export function templateDetailPath(template: {
  slug?: string | null;
  name?: string | null;
  id?: string | null;
}) {
  return `/templates/${encodeURIComponent(templateSlug(template))}`;
}
