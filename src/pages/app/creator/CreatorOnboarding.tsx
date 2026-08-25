import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Loader2, UserRound, Layers3, Send } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getOwnCreatorProfile, type CreatorProfile } from "@/services/creatorProfile";
import { cn } from "@/lib/utils";

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm";

type Step = {
  id: string;
  number: number;
  title: string;
  note: string;
  href: string;
  done: boolean;
  icon: React.ReactNode;
};

export default function CreatorOnboarding() {
  const [profile, setProfile] = useState<CreatorProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const own = await getOwnCreatorProfile().catch(() => null);
      setProfile(own);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const steps: Step[] = [
    {
      id: "profile",
      number: 1,
      title: "Set up your public creator profile",
      note: "Choose your handle, add a display name, and upload an avatar and banner.",
      href: "/creator/settings/edit",
      done: !!profile,
      icon: <UserRound className="h-5 w-5" />,
    },
    {
      id: "template",
      number: 2,
      title: "Build your first template",
      note: "Open the template builder and create a campaign template from scratch.",
      href: "/app/lab/templates",
      done: false,
      icon: <Layers3 className="h-5 w-5" />,
    },
    {
      id: "submit",
      number: 3,
      title: "Submit for review",
      note: "When your template is ready, submit it. The FUSE admin team reviews every submission before it goes live.",
      href: "/app/creator",
      done: false,
      icon: <Send className="h-5 w-5" />,
    },
  ];

  return (
    <SiteShell>
      <PageMeta
        title="Welcome to FUSE Creator Studio | FUSE"
        description="Set up your creator profile and build your first template."
        path="/app/creator/welcome"
      />

      <div className="mx-auto max-w-3xl px-6 py-12">
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-200/70">Creator Studio</p>
          <h1 className="mt-3 font-display text-3xl font-black text-foreground sm:text-4xl">
            Welcome, creator
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
            Three quick steps to get your workspace ready. You can skip ahead anytime and come back later.
          </p>
        </header>

        <div className="mt-10 space-y-4">
          {loading ? (
            <div className={cn(panelClass, "flex items-center gap-3 text-sm text-muted-foreground")}>
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your creator data…
            </div>
          ) : (
            steps.map((step) => (
              <div
                key={step.id}
                className={cn(
                  panelClass,
                  "flex flex-col gap-4 sm:flex-row sm:items-start",
                  step.done && "border-cyan-200/20 bg-cyan-200/[0.04]",
                )}
              >
                <div
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-cyan-200",
                    step.done
                      ? "border-cyan-200/30 bg-cyan-200/20"
                      : "border-cyan-200/20 bg-cyan-200/10",
                  )}
                >
                  {step.done ? <Check className="h-5 w-5" /> : step.icon}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-display text-lg font-bold text-foreground">{step.title}</h2>
                    {step.done ? (
                      <Badge variant="outline" className="border-cyan-200/30 text-[11px] text-cyan-200">
                        Done
                      </Badge>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{step.note}</p>
                  <div className="mt-4">
                    <Button
                      asChild
                      variant={step.done ? "outline" : "default"}
                      className={cn(
                        "rounded-full px-5",
                        step.done
                          ? "border-white/15 bg-white/5 text-foreground hover:bg-white/10"
                          : "bg-cyan-300 text-slate-950 hover:bg-cyan-200",
                      )}
                    >
                      <Link to={step.href}>
                        {step.done ? "Review" : "Go"}
                        <ArrowRight className="ml-1 h-4 w-4" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            )))
          )}
        </div>

        <div className="mt-8 text-center">
          <Link
            to="/app/creator"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Skip to Creator Studio
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </SiteShell>
  );
}
