import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { LogOut, User, CreditCard, Star, Shield, Zap, ChevronDown } from "lucide-react";

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

  const email = user?.email || profile?.email || "";
  const displayName = profile?.name || email.split("@")[0] || "Account";
  const plan = profile?.plan;
  const isActivePlan =
    profile?.subscription_status === "active" ||
    profile?.subscription_status === "trialing";
  const credits = profile?.credits_balance ?? 0;
  const isAdminOrDev = roles.includes("admin") || roles.includes("dev");
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  const handleSignOut = async () => {
    onNavigate?.();
    await signOut();
  };

  const linkClass =
    "flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground/80 hover:bg-white/5 hover:text-foreground transition-colors";

  return (
    <div className="w-[260px]">
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
          <p className="truncate text-xs text-muted-foreground">{email}</p>
        </div>
      </div>

      {/* Plan + Credits */}
      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-xs text-muted-foreground">Plan</span>
          {plan && isActivePlan ? (
            <span className="rounded-full bg-cyan-300/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-300">
              {plan}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">No active plan</span>
          )}
        </div>
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
          <span className="text-xs text-muted-foreground">Credits</span>
          <span className="flex items-center gap-1 text-xs font-bold text-foreground">
            <Zap size={10} className="text-primary" />
            {credits.toLocaleString()} credits
          </span>
        </div>
      </div>

      {/* Links */}
      <div className="mt-3 space-y-1">
        <Link to="/account" onClick={onNavigate} className={linkClass}>
          <User size={14} />
          Account
        </Link>
        <Link to="/pricing" onClick={onNavigate} className={linkClass}>
          <CreditCard size={14} />
          Plans & Billing
        </Link>
        {isCreator && (
          <Link to="/app/creator" onClick={onNavigate} className={linkClass}>
            <Star size={14} />
            Creator Studio
          </Link>
        )}
        {isAdminOrDev && (
          <Link to="/admin" onClick={onNavigate} className={linkClass}>
            <Shield size={14} />
            Admin
          </Link>
        )}
      </div>

      <div className="my-2 h-px bg-white/10" />

      <button onClick={handleSignOut} className={cn(linkClass, "w-full text-left")}>
        <LogOut size={14} />
        Sign out
      </button>
    </div>
  );
}

export function AccountPopover() {
  const { user, profile } = useAuth();
  const email = user?.email || profile?.email || "";
  const displayName = profile?.name || email.split("@")[0] || "Account";
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 backdrop-blur-sm hover:bg-white/[0.06] transition-colors"
          aria-label="Open account menu"
        >
          <Avatar className="h-7 w-7 rounded-full">
            <AvatarImage src={avatarUrl || ""} alt={displayName} />
            <AvatarFallback className="bg-cyan-200/10 text-cyan-300 text-[10px] font-bold">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
          <span className="hidden md:inline max-w-[120px] truncate text-xs font-medium text-foreground">
            {displayName}
          </span>
          <ChevronDown size={12} className="text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        className="rounded-2xl border-white/10 bg-[#0B1120]/95 p-4 backdrop-blur-xl shadow-2xl w-auto"
      >
        <AccountMenuContent />
      </PopoverContent>
    </Popover>
  );
}
