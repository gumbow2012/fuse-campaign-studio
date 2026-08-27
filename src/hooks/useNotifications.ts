import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  countUnreadNotifications,
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type UserNotification,
} from "@/services/notifications";

export const notificationsQueryKey = (userId?: string) => ["user-notifications", userId ?? "anon"];

/**
 * Notifications for the header bell. Data comes from `user_notifications` (RLS
 * scoped) and stays fresh through Supabase Realtime — no aggressive polling.
 */
export function useNotifications(limit = 30) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;
  const key = useMemo(() => notificationsQueryKey(userId), [userId]);

  const query = useQuery({
    queryKey: key,
    queryFn: () => fetchNotifications(limit),
    enabled: Boolean(userId),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  /* Exact unread total (not limited to the fetched page) for the bell badge. */
  const unreadQuery = useQuery({
    queryKey: [...key, "unread-count"],
    queryFn: countUnreadNotifications,
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`user-notifications-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_notifications", filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: notificationsQueryKey(userId) });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const notifications = (query.data ?? []) as UserNotification[];
  const pageUnread = notifications.filter((item) => !item.read_at).length;
  const unreadCount = Math.max(unreadQuery.data ?? 0, pageUnread);

  const markAll = useMutation({
    mutationFn: async () => {
      if (!userId) return;
      await markAllNotificationsRead(userId);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: key }),
  });

  return {
    notifications,
    unreadCount,
    isLoading: query.isLoading,
    markAllAsRead: markAll.mutate,
    markingAll: markAll.isPending,
    markAsRead: markOne.mutate,
  };
}
