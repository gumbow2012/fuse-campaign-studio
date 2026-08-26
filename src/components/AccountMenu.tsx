import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpRight, Boxes, CreditCard, LayoutDashboard, LogOut, Shield, Star, Ticket, User, Users, Zap } from "lucide-react";
import { FuseCore } from "@/components/fuse/FuseCore";

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AccountMenuContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, profile, signOut, isCreator, roles } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const email = user?.email || profile?.email || "";
  const displayName = profile?.name || email.split("@")[0] || "Account";
  const plan = profile?.plan;
  const isActivePlan =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";
  const credits = profile?.credits_balance ?? 0;
  const cycleCredits = profile?.subscription_cycle_credits ?? 0;
  const hasCycle = cycleCredits > 0;
  const ratio = hasCycle ? Math.min(1, Math.max(0, credits / cycleCredits)) : credits > 0 ? 1 : 0;
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const periodEnd = profile?.subscription_period_end
    ? new Date(profile.subscription_period_end)
    : null;
  const resetLabel =
    periodEnd && !Number.isNaN(periodEnd.getTime())
      ? periodEnd.toLocaleDateString(undefined, { month: "short", day: "numeric" })
      : null;

  const roleLine = [
    plan && isActivePlan ? plan : null,
    roles.includes("admin") ? "Admin" : null,
    roles.includes("creator") ? "Creator" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut();
  };

  const linkClass =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors";

  return (
    <div className="w-[264px] max-w-full">
      {/* Header */}
      <div className={cn("flex items-center gap-3", panelClass)}>
        <Avatar className="h-10 w-10 rounded-full border border-white/10">
          <AvatarImage src={avatarUrl || ""} alt={displayName} />
          <AvatarFallback className="bg-cyan-200/10 text-cyan-300 text-sm font-bold">
            {getInitials(displayName)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-bold text-foreground">{displayName}</p>
          <p className="truncate font-display text-[10px] font-bold uppercase tracking-[0.18em] text-cyan-300">
            {roleLine || "No active plan"}
          </p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* Credits block */}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Credits</span>
          <span className="flex items-center gap-1 text-xs font-bold text-foreground">
            <Zap size={10} className="text-primary" />
            {credits.toLocaleString()} left
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-blue to-electric-cyan transition-[width] duration-700 ease-out"
            style={{ width: mounted ? `${ratio * 100}%` : "0%" }}
          />
        </div>
        {hasCycle ? (
          <p className="mt-2 text-[10px] text-muted-foreground">
            Monthly allotment {cycleCredits.toLocaleString()}
          </p>
        ) : null}
        {resetLabel ? (
          <p className="mt-1 text-[10px] text-muted-foreground">Monthly reset {resetLabel}</p>
        ) : null}
        <Button
          asChild
          size="sm"
          className="mt-3 w-full rounded-full bg-cyan-300 text-slate-950 hover:bg-cyan-200"
          onClick={onNavigate}
        >
          <Link to="/membership?tab=credits">+ Buy Credits</Link>
        </Button>
      </div>

      {/* Links */}
      <div className="my-3 h-px bg-white/10" />
      <div className="space-y-1">
        {isCreator ? (
          <Link to="/app/creator" onClick={onNavigate} className={linkClass}>
            <Star size={14} />
            View Profile
          </Link>
        ) : (
          <Link to="/account" onClick={onNavigate} className={linkClass}>
            <User size={14} />
            View Profile
          </Link>
        )}
        {isCreator && (
          <Link to="/app/creator" onClick={onNavigate} className={linkClass}>
            <LayoutDashboard size={14} />
            Creator Dashboard
          </Link>
        )}
        <Link to="/account" onClick={onNavigate} className={linkClass}>
          <User size={14} />
          Manage Account
        </Link>
        <Link to="/app/brand" onClick={onNavigate} className={linkClass}>
          <Boxes size={14} />
          Brand &amp; Products
        </Link>

        <Link to="/app/avatars" onClick={onNavigate} className={linkClass}>
          <Users size={14} />
          My Avatars
        </Link>

        <Link to="/membership?tab=usage" onClick={onNavigate} className={linkClass}>
          <Zap size={14} />
          Usage & Credits
        </Link>
        <Link to="/membership?tab=upgrade" onClick={onNavigate} className={linkClass}>
          <ArrowUpRight size={14} />
          Upgrade Plan
        </Link>
        <Link to="/membership?tab=upgrade" onClick={onNavigate} className={linkClass}>
          <CreditCard size={14} />
          Billing
        </Link>
        <Link to="/membership?tab=credits" onClick={onNavigate} className={linkClass}>
          <Ticket size={14} />
          Promo Code
        </Link>
      </div>

      {isAdminOrDev && (
        <>
          <div className="my-2 h-px bg-white/10" />
          <Link to="/admin" onClick={onNavigate} className={cn(linkClass, "justify-between")}>
            <span className="flex items-center gap-2">
              <Shield size={14} />
              Admin
            </span>
            <span className="text-muted-foreground">&rsaquo;</span>
          </Link>
        </>
      )}

      <div className="my-2 h-px bg-white/10" />

      <button onClick={handleSignOut} className={cn(linkClass, "w-full text-left")}>
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}


export function AccountPopover() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="group flex min-h-11 min-w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] p-1.5 backdrop-blur-sm transition-colors hover:bg-white/[0.07] motion-reduce:transition-none sm:min-h-0 sm:min-w-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          aria-label="Open account menu"
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <FuseCore size={28} active={open} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 backdrop-blur-xl shadow-2xl w-auto"
      >
        <AccountMenuContent onNavigate={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}
