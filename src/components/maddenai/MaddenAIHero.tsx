import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { PS2, Ps2Glyph, ps2Button, ps2Ghost } from "@/components/maddenai/ps2";
import { track } from "@/lib/analytics/track";

/** FUSE homepage MADDEN AI spotlight (one clip + one photo), under the campaign hero. */
export default function MaddenAIHero() {
  return (
    <section className="relative isolate overflow-hidden border-b border-sky-300/15" style={{ background: PS2.ground, color: PS2.text }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 70% 60% at 75% 0%, rgba(70,150,255,0.35), transparent 65%), linear-gradient(180deg, #04103a 0%, #020617 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-[-20%] bottom-0 -z-10 h-[55%] origin-bottom opacity-35"
        style={{
          transform: "perspective(600px) rotateX(62deg)",
          backgroundImage:
            "linear-gradient(rgba(110,180,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(110,180,255,0.4) 1px, transparent 1px)",
          backgroundSize: "56px 56px",
          maskImage: "linear-gradient(to top, black 10%, transparent 90%)",
          WebkitMaskImage: "linear-gradient(to top, black 10%, transparent 90%)",
        }}
      />
      <div aria-hidden className="crt-overlay" />
      <div className="container relative z-[2] grid items-center gap-10 py-10 lg:min-h-[600px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:py-14">
        <div className="text-center lg:text-left">
          <p className="flex items-center justify-center gap-3 lg:justify-start">
            <img src="/maddenai/wordmark.png" alt="MADDEN AI" className="maddenai-glow h-7 w-auto sm:h-8" />
            <span className="rounded-md border border-sky-300/40 bg-sky-400/10 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: PS2.glow }}>New</span>
          </p>
          <h2
            className="crt-text mt-4 text-balance font-display font-black uppercase text-white"
            style={{ fontSize: "clamp(34px, 4.6vw, 68px)", lineHeight: 0.98, letterSpacing: "0.01em" }}
          >
            Put your clothes on anyone. In any video.
          </h2>
          <p className="mx-auto mt-5 max-w-[520px] text-[17px] leading-relaxed text-sky-100/70 lg:mx-0">
            Drop a clip, add a photo of your piece, and MADDEN AI restyles the video. No set, no model, no prompts.
          </p>
          <ol className="mx-auto mt-6 flex max-w-[520px] flex-wrap justify-center gap-2 lg:mx-0 lg:justify-start">
            {([["□", "Upload a clip"], ["△", "Add your piece"], ["○", "Get the video"]] as const).map(([glyph, step]) => (
              <li key={step} className="inline-flex items-center gap-2 rounded-lg border border-sky-300/25 bg-sky-400/[0.07] py-1 pl-1 pr-3 text-sm text-sky-50">
                <Ps2Glyph glyph={glyph} /> {step}
              </li>
            ))}
          </ol>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <Link to="/maddenai" onClick={() => track("hero_maddenai_click")} className={`${ps2Button} h-14 px-7`}>
              <Ps2Glyph /> Try MADDEN AI
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <Link to="/app/templates" onClick={() => track("hero_explore_campaigns_click")} className={`${ps2Ghost} h-14 px-6`}>
              Browse campaigns
            </Link>
          </div>
        </div>

        <div className="relative mx-auto flex w-full max-w-[560px] items-center gap-3 sm:gap-5">
          <figure className="w-[34%] shrink-0">
            <img src="/cro-preview/pairs/changing-room-input.jpg" alt="Product photo of pink shorts" className="aspect-square w-full rounded-2xl border border-sky-200/30 bg-white object-contain" />
            <figcaption className="mt-2 text-center font-display text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/50">Your piece</figcaption>
          </figure>
          <ArrowRight className="shrink-0 text-sky-200/60" />
          <figure className="min-w-0 flex-1">
            <div className="relative overflow-hidden rounded-2xl border border-sky-200/40 shadow-[0_30px_80px_-30px_rgba(77,168,255,0.8)]">
              <img src="/cro-preview/pairs/changing-room-output.jpg" alt="The same shorts worn in a generated scene" className="w-full object-cover" />
              <span className="absolute left-3 top-3 rounded-md border border-sky-200/40 bg-[#020820]/75 px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.18em] text-sky-50">
                MADDEN AI
              </span>
            </div>
            <figcaption className="mt-2 text-center font-display text-[10px] font-bold uppercase tracking-[0.2em] text-sky-100/50">On camera</figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
