import { Link } from "react-router-dom";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/useNotifications";
import { notificationVisual, relativeTime } from "@/lib/notificationPresentation";
import { cn } from "@/lib/utils";

export default function NotificationsPage() {
  const { notifications, unreadCount, isLoading, markAllAsRead, markingAll, markAsRead } =
    useNotifications(100);

  return (
    <SiteShell>
      <main className="container mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-black uppercase tracking-tight text-white">
              Notifications
            </h1>
            <p className="mt-1 font-sans text-sm text-muted-foreground">
              Campaign updates, drops, and account activity.
            </p>
          </div>
          {unreadCount > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => markAllAsRead()}
              disabled={markingAll}
              className="rounded-full border-white/15 bg-white/[0.04] font-sans text-xs"
            >
              Mark all as read
            </Button>
          ) : null}
        </header>

        <section className="mt-6 space-y-2">
          {isLoading ? (
            <p className="py-10 text-center font-sans text-sm text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-6 py-12 text-center">
              <p className="font-display text-xs font-bold uppercase tracking-[0.2em] text-muted-foreground">
                All quiet
              </p>
              <p className="mt-2 font-sans text-sm text-muted-foreground">
                Updates from your campaigns and new template drops will show up here.
              </p>
            </div>
          ) : (
            notifications.map((notification) => {
              const { icon: Icon, tone } = notificationVisual(notification.type);
              const unread = !notification.read_at;

              return (
                <article
                  key={notification.id}
                  className={cn(
                    "flex gap-3 rounded-2xl border px-4 py-3.5",
                    unread ? "border-cyan-300/20 bg-white/[0.05]" : "border-white/10 bg-white/[0.02]"
                  )}
                >
                  <Icon size={16} className={cn("mt-0.5 shrink-0", tone)} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      {unread ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" aria-label="Unread" />
                      ) : null}
                      <h2 className="font-sans text-sm font-semibold text-foreground">{notification.title}</h2>
                    </div>
                    {notification.body ? (
                      <p className="mt-1 font-sans text-xs text-muted-foreground">{notification.body}</p>
                    ) : null}
                    <div className="mt-1.5 flex items-center gap-3">
                      <span className="font-sans text-[11px] text-muted-foreground">
                        {relativeTime(notification.created_at)}
                      </span>
                      {notification.action_url && notification.action_label ? (
                        <Link
                          to={notification.action_url}
                          onClick={() => unread && markAsRead(notification.id)}
                          className="font-sans text-[11px] font-semibold text-cyan-300 underline-offset-2 hover:underline"
                        >
                          {notification.action_label}
                        </Link>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </main>
    </SiteShell>
  );
}
