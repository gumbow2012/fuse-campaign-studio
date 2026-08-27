import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Bell, Boxes, CreditCard, FolderHeart, LayoutDashboard, LogOut, Shield, Ticket, User, Users, Zap } from "lucide-react";
import CreditPackDialog from "@/components/mvp/CreditPackDialog";
import FeatureNewBadge from "@/components/FeatureNewBadge";
import { avatarInitials } from "@/lib/avatarImage";
import { useIsMobile } from "@/hooks/use-mobile";
import type { FeatureKey } from "@/lib/featureRegistry";

/** Resolved account photo: profile avatar → OAuth photo → initials (never the FUSE logo). */
export function useAccountIdentity() {
  const { user, profile } = useAuth();
  const email = profile?.email || user?.email || "";
  const displayName = profile?.name || email.split("@")[0] || "Account";
  const oauthAvatar = (user?.user_metadata?.avatar_url as string | undefined) || undefined;
  const avatarUrl = profile?.avatar_url || oauthAvatar || "";

  return { email, displayName, avatarUrl, initials: avatarInitials(profile?.name || email) };
}

const itemClass =
  "flex min-h-9 items-center gap-2 rounded-lg px-3 py-2 font-sans text-sm text-foreground/80 transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80";

const sectionLabelClass =
  "px-3 pb-1 font-display text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground";

export function AccountMenuContent({
  onNavigate,
  onTopUp,
}: {
  onNavigate?: () => void;
  /** Provided when the host renders the top-up dialog outside the menu surface. */
  onTopUp?: () => void;
}) {
  const { profile, signOut, isCreator, roles } = useAuth();
  const { email, displayName, avatarUrl, initials } = useAccountIdentity();
  const [mounted, setMounted] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const isActivePlan =
    profile?.subscription_status === "active" || profile?.subscription_status === "trialing";
  const credits = Number(profile?.credits_balance ?? 0);
  const cycleCredits = Number(profile?.subscription_cycle_credits ?? 0);
  const hasCycle = isActivePlan && cycleCredits > 0;
  const ratio = hasCycle ? Math.min(1, Math.max(0, credits / cycleCredits)) : credits > 0 ? 1 : 0;
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");

  const planLine = [
    profile?.plan && isActivePlan ? profile.plan : "No active plan",
    isCreator ? "Creator" : null,
    roles.includes("admin") ? "Admin" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut();
  };

  const MenuLink = ({
    to,
    icon: Icon,
    label,
    featureKey,
  }: {
    to: string;
    icon: typeof User;
    label: string;
    featureKey?: FeatureKey;
  }) => (
    <Link to={to} onClick={onNavigate} className={itemClass}>
      <Icon size={14} aria-hidden="true" />
      <span className="flex-1">{label}</span>
      {featureKey ? <FeatureNewBadge featureKey={featureKey} /> : null}
    </Link>
  );

  return (
    <div className="w-[264px] max-w-full font-sans">
      {/* Identity */}
      <div className="flex items-center gap-3 px-1">
        <Avatar className="h-10 w-10 rounded-full border border-white/10">
          <AvatarImage src={avatarUrl} alt={displayName} />
          <AvatarFallback className="bg-cyan-200/10 font-sans text-sm font-bold text-cyan-300">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{displayName}</p>
          <p className="truncate text-xs text-muted-foreground">{email}</p>
          <p className="truncate text-xs capitalize text-cyan-300">{planLine}</p>
        </div>
      </div>

      <div className="my-3 h-px bg-white/10" />

      {/* Credits */}
      <div className="px-1">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">Credits</span>
          <span className="flex items-center gap-1 font-semibold text-foreground">
            <Zap size={10} className="text-primary" aria-hidden="true" />
            {credits.toLocaleString()} left
          </span>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
          <div
            className="h-full rounded-full bg-gradient-to-r from-electric-blue to-electric-cyan transition-[width] duration-700 ease-out"
            style={{ width: mounted ? `${ratio * 100}%` : "0%" }}
          />
        </div>
        {onTopUp ? null : <CreditPackDialog open={topUpOpen} onOpenChange={setTopUpOpen} />}
        <Button
          size="sm"
          onClick={() => (onTopUp ? onTopUp() : setTopUpOpen(true))}
          className="mt-3 w-full rounded-full bg-cyan-300 font-sans text-xs font-bold uppercase tracking-[0.1em] text-slate-950 hover:bg-cyan-200"
        >
          Top up credits
        </Button>
      </div>

      <div className="my-3 h-px bg-white/10" />

      <div className="space-y-0.5">
        <MenuLink to="/account" icon={User} label="View Profile" />
        {isCreator ? (
          <MenuLink to="/app/creator" icon={LayoutDashboard} label="Creator Studio" featureKey="creator_studio" />
        ) : null}
        <MenuLink to="/app/brand" icon={Boxes} label="Brand & Products" />
        <MenuLink to="/app/avatars" icon={Users} label="My Avatars" featureKey="my_avatars" />
        <MenuLink to="/app/collections" icon={FolderHeart} label="My Drops" />
        <MenuLink to="/app/notifications" icon={Bell} label="Notifications" />
      </div>

      <div className="my-2 h-px bg-white/10" />

      <div className="space-y-0.5">
        <MenuLink to="/membership?tab=upgrade" icon={CreditCard} label="Membership" />
        <MenuLink to="/membership?tab=usage" icon={Zap} label="Usage" />
        <MenuLink to="/pricing" icon={CreditCard} label="Billing" />
        <MenuLink to="/membership?tab=credits" icon={Ticket} label="Promo Code" />
      </div>

      {isAdminOrDev ? (
        <>
          <div className="my-2 h-px bg-white/10" />
          <p className={sectionLabelClass}>Internal</p>
          <MenuLink to="/admin" icon={Shield} label="Admin" />
        </>
      ) : null}

      <div className="my-2 h-px bg-white/10" />

      <button type="button" onClick={handleSignOut} className={cn(itemClass, "w-full text-left")}>
        <LogOut size={14} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

/** Account trigger — the user's real photo or their initials. Never the FUSE logo. */
export function AccountPopover() {
  const [open, setOpen] = useState(false);
  const [topUpOpen, setTopUpOpen] = useState(false);
  const location = useLocation();
  const isMobile = useIsMobile();
  const { profile } = useAuth();
  const { displayName, avatarUrl, initials } = useAccountIdentity();
  const isMember =
    profile?.subscription_status === "active" || profile?.subscription_status === "trialing";

  useEffect(() => {
    setOpen(false);
  }, [location.pathname, location.search]);

  const trigger = (
    <button
      type="button"
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border bg-white/[0.04] p-0 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.08] motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isMember ? "border-cyan-300/50" : "border-white/10"
      )}
      aria-label={`Account menu for ${displayName}`}
      aria-haspopup="dialog"
      aria-expanded={open}
      title="Account"
    >
      <Avatar className="h-[30px] w-[30px] rounded-full">
        <AvatarImage src={avatarUrl} alt="" />
        <AvatarFallback className="bg-cyan-200/10 font-sans text-[11px] font-bold text-cyan-300">
          {initials}
        </AvatarFallback>
      </Avatar>
    </button>
  );

  const openTopUp = () => {
    setOpen(false);
    setTopUpOpen(true);
  };

  if (isMobile) {
    return (
      <>
        <CreditPackDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>{trigger}</SheetTrigger>
          <SheetContent side="right" className="w-[min(320px,92vw)] overflow-y-auto border-white/10 bg-[#0B1120]/97 p-4">
            <SheetTitle className="sr-only">Account menu</SheetTitle>
            <AccountMenuContent onNavigate={() => setOpen(false)} onTopUp={openTopUp} />
          </SheetContent>
        </Sheet>
      </>
    );
  }

  return (
    <>
      {/* Outside the popover so closing the popover cannot unmount it. */}
      <CreditPackDialog open={topUpOpen} onOpenChange={setTopUpOpen} />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>{trigger}</PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-auto rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 font-sans shadow-2xl backdrop-blur-xl"
        >
          <AccountMenuContent onNavigate={() => setOpen(false)} onTopUp={openTopUp} />
        </PopoverContent>
      </Popover>
    </>
  );
}
