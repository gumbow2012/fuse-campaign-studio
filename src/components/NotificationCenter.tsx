import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationVisual, relativeTime } from "@/lib/notificationPresentation";
import type { UserNotification } from "@/services/notifications";

export const CLUSTER_CONTROL =
  "inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-sm transition-colors duration-200 hover:border-white/20 hover:bg-white/[0.08] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background";

function NotificationRow({
  notification,
  onNavigate,
  onRead,
}: {
  notification: UserNotification;
  onNavigate: () => void;
  onRead: (id: string) => void;
}) {
  const { icon: Icon, tone } = notificationVisual(notification.type);
  const unread = !notification.read_at;

  return (
    <li className={cn("rounded-xl transition-colors", unread ? "bg-white/[0.05]" : "hover:bg-white/[0.03]")}>
      <div
        className="flex gap-2.5 px-3 py-2.5"
        role={unread ? "button" : undefined}
        tabIndex={unread ? 0 : undefined}
        aria-label={unread ? `Mark "${notification.title}" as read` : undefined}
        onClick={unread ? () => onRead(notification.id) : undefined}
        onKeyDown={
          unread
            ? (event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onRead(notification.id);
                }
              }
            : undefined
        }
      >
        <span className="mt-0.5 shrink-0">
          <Icon size={15} className={tone} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            {unread ? (
              <span
                className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"
                aria-label="Unread"
              />
            ) : null}
            <p className="min-w-0 flex-1 font-sans text-sm font-medium leading-snug text-foreground">
              {notification.title}
            </p>
          </div>
          {notification.body ? (
            <p className="mt-0.5 font-sans text-xs leading-snug text-muted-foreground">{notification.body}</p>
          ) : null}
          <div className="mt-1 flex items-center gap-2">
            <span className="font-sans text-[11px] text-muted-foreground">
              {relativeTime(notification.created_at)}
            </span>
            {notification.action_url && notification.action_label ? (
              <Link
                to={notification.action_url}
                onClick={(event) => {
                  event.stopPropagation();
                  if (unread) onRead(notification.id);
                  onNavigate();
                }}
                className="font-sans text-[11px] font-semibold text-cyan-300 underline-offset-2 hover:underline"
              >
                {notification.action_label}
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </li>
  );
}

function NotificationList({ onNavigate }: { onNavigate: () => void }) {
  const { notifications, unreadCount, isLoading, markAllAsRead, markingAll, markAsRead } =
    useNotifications();

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-1 pb-2">
        <p className="font-display text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Notifications
        </p>
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={() => markAllAsRead()}
            disabled={markingAll}
            className="rounded-full px-2 py-1 font-sans text-[11px] font-semibold text-cyan-300 transition-colors hover:bg-white/5 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80"
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-3 py-6 text-center font-sans text-xs text-muted-foreground">Loading…</p>
        ) : notifications.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              You&rsquo;re all caught up.
            </p>
            <p className="mt-1.5 font-sans text-xs text-muted-foreground">
              Campaign updates and drops will show up here.
            </p>
          </div>
        ) : (
          <ul className="space-y-1">
            {notifications.map((notification) => (
              <NotificationRow
                key={notification.id}
                notification={notification}
                onNavigate={onNavigate}
                onRead={markAsRead}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="mt-2 border-t border-white/10 pt-2">
        <Link
          to="/app/notifications"
          onClick={onNavigate}
          className="block rounded-lg px-3 py-2 text-center font-sans text-xs text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80"
        >
          View all notifications
        </Link>
      </div>
    </div>
  );
}

/** Bell trigger + unread badge (badge only rendered when unread items exist). */
export function NotificationCenter() {
  const [open, setOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();
  const { unreadCount } = useNotifications();

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const trigger = (
    <button
      type="button"
      className={cn(CLUSTER_CONTROL, "relative w-9")}
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications, no unread notifications"
      }
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Notifications"
    >
      <Bell size={16} className="text-foreground/80" aria-hidden="true" />
      {unreadCount > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 max-w-[26px] items-center justify-center rounded-full bg-cyan-300 px-1 font-sans text-[9px] font-bold text-slate-950"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      ) : null}
    </button>
  );

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent
          side="right"
          className="flex w-[min(360px,92vw)] flex-col border-white/10 bg-[#0B1120]/97 p-4"
        >
          <SheetTitle className="sr-only">Notifications</SheetTitle>
          <NotificationList onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="w-[340px] rounded-2xl border-white/10 bg-[#0B1120]/95 p-3 font-sans shadow-2xl backdrop-blur-xl"
      >
        <div className="max-h-[420px]">
          <NotificationList onNavigate={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default NotificationCenter;
