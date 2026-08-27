import { supabase } from "@/integrations/supabase/client";

export type NotificationType =
  | "generation_complete"
  | "generation_failed"
  | "new_template_drop"
  | "new_feature"
  | "creator_submission"
  | "creator_approved"
  | "creator_reward"
  | "low_credits"
  | "billing"
  | "system"
  | "achievement_unlocked"
  | "creator_followed"
  | "creator_new_template"
  | "creator_verified";

export type UserNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  action_label: string | null;
  action_url: string | null;
  read_at: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const COLUMNS = "id,user_id,type,title,body,action_label,action_url,read_at,metadata,created_at";

/** Newest-first notifications for the signed-in user (RLS scoped). */
export async function fetchNotifications(limit = 30): Promise<UserNotification[]> {
  const { data, error } = await supabase
    .from("user_notifications")
    .select(COLUMNS)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as UserNotification[];
}

/** Marks every unread notification for the current user as read. */
export async function markAllNotificationsRead(userId: string) {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);

  if (error) throw error;
}

export async function markNotificationRead(id: string) {
  const { error } = await supabase
    .from("user_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .is("read_at", null);

  if (error) throw error;
}

/* ---------------------------------------------------------------------------
 * BRAND ACTIVATION reminders (Phase 4)
 * One notification per reminder type at a time. Users may only insert their
 * own `brand_activation` rows (RLS), everything else stays server-created.
 * ------------------------------------------------------------------------- */

export const BRAND_ACTIVATION_TYPE = "brand_activation";

export type BrandActivationReminderType = "build_brand" | "add_product" | "add_creative_dna";

/** True when an unread — or recent — reminder of this type already exists. */
export async function hasActiveBrandActivationReminder(
  userId: string,
  reminderType: BrandActivationReminderType,
  recentWindowMs = 7 * 24 * 60 * 60 * 1000,
): Promise<boolean> {
  const since = new Date(Date.now() - recentWindowMs).toISOString();
  const { data, error } = await supabase
    .from("user_notifications")
    .select("id,read_at,created_at")
    .eq("user_id", userId)
    .eq("type", BRAND_ACTIVATION_TYPE)
    .contains("metadata", { activation_reminder_type: reminderType })
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) throw error;
  return (data ?? []).some((row) => !row.read_at || row.created_at >= since);
}

/** Inserts one reminder after the dedup check passes. Never throws upward. */
export async function createBrandActivationReminder(input: {
  userId: string;
  reminderType: BrandActivationReminderType;
  title: string;
  body: string;
  actionLabel: string;
  actionUrl: string;
  brandId: string | null;
  completionState: number;
}): Promise<boolean> {
  if (await hasActiveBrandActivationReminder(input.userId, input.reminderType)) return false;

  const { error } = await supabase.from("user_notifications").insert({
    user_id: input.userId,
    type: BRAND_ACTIVATION_TYPE,
    title: input.title,
    body: input.body,
    action_label: input.actionLabel,
    action_url: input.actionUrl,
    metadata: {
      activation_reminder_type: input.reminderType,
      brand_id: input.brandId,
      completion_state: input.completionState,
    } as never,
  });

  if (error) throw error;
  return true;
}
