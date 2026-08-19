/* eslint-disable @typescript-eslint/no-explicit-any */
import { createAdminClient, type BuilderAccess } from "./supabase-admin.ts";

type Admin = ReturnType<typeof createAdminClient>;

export const FORBIDDEN_TEMPLATE_MESSAGE = "You do not have access to this template";
export const FORBIDDEN_PUBLISH_MESSAGE = "Only admins can publish or approve templates";

/** True when the caller is limited to templates they created themselves. */
export function isScopedToOwnTemplates(access: BuilderAccess) {
  return access.isCreatorOnly;
}

export function assertCanPublish(access: BuilderAccess) {
  if (!access.canPublish) throw new Error(FORBIDDEN_PUBLISH_MESSAGE);
}

/** Verifies the caller may read/write the given template. Creators only own rows they created. */
export async function assertTemplateAccess(
  admin: Admin,
  access: BuilderAccess,
  templateId: string,
) {
  if (!isScopedToOwnTemplates(access)) return;
  if (!templateId) throw new Error(FORBIDDEN_TEMPLATE_MESSAGE);

  const { data, error } = await admin
    .from("fuse_templates")
    .select("id, created_by")
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || (data as any).created_by !== access.user.id) {
    throw new Error(FORBIDDEN_TEMPLATE_MESSAGE);
  }
}

export async function resolveVersionTemplateId(admin: Admin, versionId: string) {
  const { data, error } = await admin
    .from("template_versions")
    .select("id, template_id")
    .eq("id", versionId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Template version not found");
  return (data as any).template_id as string;
}

export async function assertVersionAccess(
  admin: Admin,
  access: BuilderAccess,
  versionId: string,
) {
  if (!isScopedToOwnTemplates(access)) return;
  if (!versionId) throw new Error(FORBIDDEN_TEMPLATE_MESSAGE);
  const templateId = await resolveVersionTemplateId(admin, versionId);
  await assertTemplateAccess(admin, access, templateId);
}

export async function assertNodeAccess(
  admin: Admin,
  access: BuilderAccess,
  nodeId: string,
) {
  if (!isScopedToOwnTemplates(access)) return;
  const { data, error } = await admin
    .from("nodes")
    .select("id, version_id")
    .eq("id", nodeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(FORBIDDEN_TEMPLATE_MESSAGE);
  await assertVersionAccess(admin, access, (data as any).version_id);
}

export async function assertEdgeAccess(
  admin: Admin,
  access: BuilderAccess,
  edgeId: string,
) {
  if (!isScopedToOwnTemplates(access)) return;
  const { data, error } = await admin
    .from("edges")
    .select("id, version_id")
    .eq("id", edgeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error(FORBIDDEN_TEMPLATE_MESSAGE);
  await assertVersionAccess(admin, access, (data as any).version_id);
}
