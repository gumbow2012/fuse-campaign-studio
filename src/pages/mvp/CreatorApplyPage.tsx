/**
 * Public creator application form (ADDITIVE).
 *
 * Inserts into `public.creator_applications`. No rewards or earnings are
 * promised anywhere on this page. No Stripe, billing, credit or generation
 * logic is touched.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Loader2, Send } from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import PageMeta from "@/components/mvp/PageMeta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/contexts/AuthContext";
import {
  submitCreatorApplication,
  validateCreatorApplication,
} from "@/services/creatorApplications";

const panelClass =
  "rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm";

const labelClass = "text-[11px] uppercase tracking-[0.24em] text-muted-foreground";

export default function CreatorApplyPage() {
  const { user } = useAuth();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [portfolioUrl, setPortfolioUrl] = useState("");
  const [instagram, setInstagram] = useState("");
  const [tiktok, setTiktok] = useState("");
  const [xHandle, setXHandle] = useState("");
  const [pitch, setPitch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (user?.email) setEmail((current) => current || user.email!);
  }, [user]);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const payload = {
      email,
      name,
      portfolio_url: portfolioUrl,
      instagram,
      tiktok,
      x_handle: xHandle,
      pitch,
      user_id: user?.id ?? null,
    };

    const invalid = validateCreatorApplication(payload);
    if (invalid) {
      setError(invalid);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await submitCreatorApplication(payload);
      setSubmitted(true);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Something went wrong sending your application. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SiteShell>
      <PageMeta
        title="Apply to the FUSE Creator Program | FUSE"
        description="Request an invite to the FUSE Creator Program and tell us what you make."
        path="/creators/apply"
      />

      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <Link
          to="/creators"
          className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.24em] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Creator Program
        </Link>

        <header className="mt-6">
          <h1 className="font-display text-4xl font-black text-foreground sm:text-5xl">
            Request an invite
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            Tell us who you are and what you make. The FUSE team reviews every application manually
            and reaches out by email when an invite is available.
          </p>
        </header>

        {submitted ? (
          <div className={`mt-8 ${panelClass}`}>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-cyan-200" />
              <h2 className="font-display text-lg font-bold text-foreground">
                Application received
              </h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Application received — the FUSE team will review it. We'll email you at{" "}
              <span className="text-foreground">{email}</span> if there's a fit.
            </p>
            <div className="mt-5">
              <Button
                asChild
                variant="outline"
                className="rounded-full border-white/15 bg-white/5 text-foreground hover:bg-white/10"
              >
                <Link to="/creators">Back to the program</Link>
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={onSubmit} className={`mt-8 space-y-5 ${panelClass}`}>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="apply-email" className={labelClass}>
                  Email *
                </Label>
                <Input
                  id="apply-email"
                  type="email"
                  required
                  maxLength={255}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@studio.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apply-name" className={labelClass}>
                  Name
                </Label>
                <Input
                  id="apply-name"
                  maxLength={120}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name or studio"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-portfolio" className={labelClass}>
                Portfolio URL
              </Label>
              <Input
                id="apply-portfolio"
                maxLength={500}
                value={portfolioUrl}
                onChange={(event) => setPortfolioUrl(event.target.value)}
                placeholder="https://"
              />
            </div>

            <div className="grid gap-5 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="apply-instagram" className={labelClass}>
                  Instagram
                </Label>
                <Input
                  id="apply-instagram"
                  maxLength={120}
                  value={instagram}
                  onChange={(event) => setInstagram(event.target.value)}
                  placeholder="@handle"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apply-tiktok" className={labelClass}>
                  TikTok
                </Label>
                <Input
                  id="apply-tiktok"
                  maxLength={120}
                  value={tiktok}
                  onChange={(event) => setTiktok(event.target.value)}
                  placeholder="@handle"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="apply-x" className={labelClass}>
                  X
                </Label>
                <Input
                  id="apply-x"
                  maxLength={120}
                  value={xHandle}
                  onChange={(event) => setXHandle(event.target.value)}
                  placeholder="@handle"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apply-pitch" className={labelClass}>
                Why you want to join / what you make
              </Label>
              <Textarea
                id="apply-pitch"
                rows={6}
                maxLength={2000}
                value={pitch}
                onChange={(event) => setPitch(event.target.value)}
                placeholder="The work you make, the brands you shoot for, and the templates you'd want to build."
              />
              <p className="text-xs text-muted-foreground">{pitch.length}/2000</p>
            </div>

            {error ? <p className="text-sm text-red-300">{error}</p> : null}

            <Button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-cyan-300 px-6 text-slate-950 hover:bg-cyan-200"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Submit application
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </SiteShell>
  );
}
