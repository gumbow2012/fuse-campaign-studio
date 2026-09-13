import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FREE_SAMPLE } from "@/lib/croOffer";

/**
 * The free first video, kept well away from any paid offer. This is presentation
 * only — the free route, gate and entitlement are unchanged.
 */
export default function FreeSampleSection({ className = "" }: { className?: string }) {
  return (
    <section className={`container pb-16 ${className}`}>
      <div className="rounded-[2rem] border border-white/10 bg-white/[0.03] p-6 md:p-8">
        <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-white">
          {FREE_SAMPLE.title}
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">{FREE_SAMPLE.body}</p>
        <Button
          asChild
          className="mt-5 rounded-full border border-white/15 bg-white/5 text-foreground hover:bg-white/10"
        >
          <Link to="/auth?mode=signup">Get your free video</Link>
        </Button>
      </div>
    </section>
  );
}
