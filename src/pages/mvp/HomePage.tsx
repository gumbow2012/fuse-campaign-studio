import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, CheckCircle2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import SiteShell from "@/components/mvp/SiteShell";

type ShowcaseTemplate = {
  name: string;
  description: string;
  mediaSrc: string;
  accent: string;
  inputs: string;
  output: string;
};

const showcaseTemplates: ShowcaseTemplate[] = [
  {
    name: "GRILLZZZZ",
    description: "Iced-out cinematic grillz content built for vertical campaign drops.",
    mediaSrc: "https://ykrrwgkxgidoavtzcumk.supabase.co/storage/v1/object/public/fuse-assets/system/template-covers/6c7c10d8-4297-4c86-80cc-875cb28a578f/96cbb948-c78e-4923-bf91-3077dbad0b03-0213-copy-2-gif.bin",
    accent: "Template GIF",
    inputs: "Product / Model / Logo",
    output: "16 vertical videos",
  },
  {
    name: "UGC Mirror",
    description: "Turn garment shots into phone-native outfit content for social drops.",
    mediaSrc: "/template-previews/ugc-mirror.gif",
    accent: "Vertical video",
    inputs: "Garment / Model / Reference",
    output: "3 UGC videos",
  },
  {
    name: "Paparazzi",
    description: "Create street-style campaign frames with a candid fashion feel.",
    mediaSrc: "/template-previews/paparazzi.gif",
    accent: "Street capture",
    inputs: "Product / Model / Brand",
    output: "Editorial set",
  },
  {
    name: "Unboxing",
    description: "Show packaging, product reveal, and branded UGC in one workflow.",
    mediaSrc: "/template-previews/unboxing.gif",
    accent: "Product reveal",
    inputs: "Product / Box / Logo",
    output: "Reveal sequence",
  },
  {
    name: "Amazon Guy",
    description: "Generate delivery-style product content from logo and garment inputs.",
    mediaSrc: "/template-previews/amazon-guy.gif",
    accent: "Delivery UGC",
    inputs: "Garment / Logo / Reference",
    output: "Drop assets",
  },
];

export default function HomePage() {
  const swipeStartX = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const goToTemplate = (nextIndex: number) => {
    setActiveIndex((nextIndex + showcaseTemplates.length) % showcaseTemplates.length);
  };

  const getRelativePosition = (index: number) => {
    const length = showcaseTemplates.length;
    const raw = (index - activeIndex + length) % length;
    return raw > length / 2 ? raw - length : raw;
  };

  const handleSwipeEnd = (clientX: number) => {
    if (swipeStartX.current === null) return;
    const delta = clientX - swipeStartX.current;
    swipeStartX.current = null;
    if (Math.abs(delta) < 35) return;
    goToTemplate(activeIndex + (delta < 0 ? 1 : -1));
  };

  return (
    <SiteShell>
      <section className="container py-6 md:py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 md:gap-6">
          <div className="max-w-3xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-100">
              No account needed to browse
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold leading-tight text-white sm:text-5xl">
              Create clothing videos without wasting time, money, or credits.
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-slate-300">
              Pick a template, upload your product, model, logo, or reference assets, and Fuse generates campaign-ready vertical videos without expensive shoots, slow editors, or rebuilt prompts.
            </p>
          </div>

          <div className="w-full">
            <div
              className="relative z-20 mx-auto max-w-[980px] overflow-hidden"
              style={{ height: "clamp(430px, 108vw, 520px)" }}
              aria-label="Featured Fuse templates"
              onTouchStart={(event) => {
                swipeStartX.current = event.touches[0]?.clientX ?? null;
              }}
              onTouchEnd={(event) => {
                handleSwipeEnd(event.changedTouches[0]?.clientX ?? 0);
              }}
            >
              <div
                className="absolute inset-0"
                onMouseDown={(event) => {
                  swipeStartX.current = event.clientX;
                }}
                onMouseUp={(event) => {
                  handleSwipeEnd(event.clientX);
                }}
              >
                {showcaseTemplates.map((template, index) => (
                  <CarouselCard
                    key={template.name}
                    template={template}
                    isActive={activeIndex === index}
                    relativePosition={getRelativePosition(index)}
                    onSelect={() => goToTemplate(index)}
                  />
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous template"
                onClick={() => goToTemplate(activeIndex - 1)}
                className="absolute left-2 top-1/2 z-40 h-11 w-11 -translate-y-1/2 rounded-full border-white/15 bg-slate-950/80 text-white hover:bg-slate-900"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next template"
                onClick={() => goToTemplate(activeIndex + 1)}
                className="absolute right-2 top-1/2 z-40 h-11 w-11 -translate-y-1/2 rounded-full border-white/15 bg-slate-950/80 text-white hover:bg-slate-900"
              >
                <ChevronRight className="h-5 w-5" />
              </Button>
            </div>

            <div className="relative z-30 mt-3 flex justify-center gap-2 md:mt-4" aria-label="Template selector">
              {showcaseTemplates.map((template, index) => (
                <button
                  key={template.name}
                  type="button"
                  aria-label={`Show ${template.name}`}
                  onClick={() => goToTemplate(index)}
                  className={`h-2.5 rounded-full transition-all ${
                    activeIndex === index ? "w-8 bg-cyan-200" : "w-2.5 bg-white/25 hover:bg-white/45"
                  }`}
                />
              ))}
            </div>
          </div>

          <Button asChild size="lg" className="rounded-full bg-cyan-300 px-8 text-slate-950 hover:bg-cyan-200">
            <Link to="/app/templates">
              Try these templates
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>

          <section className="grid w-full max-w-5xl gap-3 border-t border-white/10 pt-7 sm:grid-cols-3 md:pt-10">
            {[
              "Browse templates before buying",
              "Unlock the selected template at checkout",
              "Open a preloaded studio after payment",
            ].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-200">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-200" />
                <span>{item}</span>
              </div>
            ))}
          </section>
        </div>
      </section>
    </SiteShell>
  );
}

function CarouselCard({
  template,
  isActive,
  relativePosition,
  onSelect,
}: {
  template: ShowcaseTemplate;
  isActive: boolean;
  relativePosition: number;
  onSelect: () => void;
}) {
  const hidden = Math.abs(relativePosition) > 2;
  const transform = `translateX(calc(-50% + ${relativePosition * 58}%)) translateY(${
    Math.abs(relativePosition) * 14
  }px) scale(${isActive ? 1 : Math.abs(relativePosition) === 1 ? 0.88 : 0.76}) rotate(${
    relativePosition * -4
  }deg)`;

  return (
    <article
      className={`absolute left-1/2 top-2 flex aspect-[9/16] w-[240px] cursor-pointer select-none overflow-hidden rounded-[1.5rem] border bg-slate-950 shadow-[0_28px_80px_rgba(0,0,0,0.38)] transition-all duration-500 ease-out sm:w-[270px] md:w-[255px] ${
        isActive ? "border-cyan-200/50 opacity-100" : "border-white/10 opacity-60 hover:opacity-80"
      } ${hidden ? "pointer-events-none opacity-0" : ""}`}
      style={{
        transform,
        zIndex: 30 - Math.abs(relativePosition),
        width: "clamp(190px, 58vw, 270px)",
      }}
      onClick={onSelect}
      aria-hidden={hidden}
    >
      <img
        src={template.mediaSrc}
        alt=""
        className="h-full w-full object-cover"
        loading={isActive ? "eager" : "lazy"}
        draggable={false}
      />

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/70 to-transparent p-4 pt-20 transition-all duration-300 ease-out ${
          isActive ? "translate-y-0 scale-100 opacity-100" : "translate-y-4 scale-95 opacity-0"
        }`}
        aria-hidden={!isActive}
      >
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-100 transition-opacity duration-300">
          {template.accent}
        </p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-white transition-opacity duration-300">
          Template: {isActive && template.name === "GRILLZZZZ" ? "Campaign Video" : template.name}
        </h2>
        <p className="mt-1 text-xs leading-5 text-slate-200 transition-opacity duration-300">
          {template.description}
        </p>
        <div className="mt-3 grid gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-white">
          <p className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
            Inputs: {template.inputs}
          </p>
          <p className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
            Output: {template.output}
          </p>
        </div>
      </div>
    </article>
  );
}
