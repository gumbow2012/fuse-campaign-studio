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
