/**
 * Who may see and run a template. "public" = everyone, "creators" = creators plus admins/devs,
 * "admins" = admins/devs only. One rule, used by the catalog, the template page and run start.
 */
export type TemplateVisibility = "public" | "creators" | "admins";

export function normalizeVisibility(value: unknown): TemplateVisibility {
  return value === "creators" || value === "admins" ? value : "public";
}

export function canSeeTemplate(visibility: unknown, roles: readonly string[]): boolean {
  const v = normalizeVisibility(visibility);
  if (v === "public") return true;
  if (roles.includes("admin") || roles.includes("dev")) return true;
  return v === "creators" && roles.includes("creator");
}
