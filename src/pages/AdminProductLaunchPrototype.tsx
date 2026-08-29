/**
 * PRODUCT LINK CAMPAIGN — UX PROTOTYPE (admin-only, NOT LIVE).
 *
 * This is a click-through UX draft for approval. Nothing here is wired to real
 * data or real generation:
 *  - No Shopify OAuth, no importer backend, no network calls at all.
 *  - "Imported" product data is HARDCODED DEMO DATA (see DEMO_PRODUCT below).
 *  - Deliverable counts / credit numbers are PROTOTYPE PLACEHOLDERS and must
 *    never be treated as production pricing or capacity numbers.
 *  - The final "Generate campaign" button intentionally does NOT generate.
 *
 * State lives in this component so navigating back never loses anything.
 */

import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Check,
  Film,
  ImageIcon,
  Layers,
  Link2,
  Loader2,
  Megaphone,
  Rocket,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import SiteShell from "@/components/mvp/SiteShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ demo data */

/** DEMO ONLY — hardcoded stand-in for a "product import". Not a real integration. */
const DEMO_PRODUCT = {
  brand: "SOT",
  title: "Heavyweight Hoodie",
  price: "$120",
  colors: [
    { name: "Black", hsl: "0 0% 8%" },
    { name: "Gray", hsl: "220 6% 55%" },
    { name: "Cream", hsl: "40 30% 88%" },
  ],
  images: [
    { id: "front", label: "Front" },
    { id: "back", label: "Back" },
    { id: "detail-1", label: "Detail" },
    { id: "detail-2", label: "Detail" },
    { id: "lifestyle-1", label: "Lifestyle" },
    { id: "lifestyle-2", label: "Lifestyle" },
  ],
};

type CampaignKey = "launch" | "paid_social" | "pdp_refresh";

const CAMPAIGNS: {
  key: CampaignKey;
  title: string;
  blurb: string;
  icon: typeof Rocket;
  parts: string[];
  /** PROTOTYPE placeholders only. */
  outputs: { label: string; count: number; kind: "image" | "video" }[];
  credits: number;
}[] = [
  {
    key: "launch",
    title: "Product Launch",
    blurb: "The full drop kit — everything you need the day it goes live.",
    icon: Rocket,
    parts: ["Hero", "Product", "Lifestyle", "Social", "Video"],
    outputs: [
      { label: "Hero", count: 2, kind: "image" },
      { label: "Product", count: 4, kind: "image" },
      { label: "Detail", count: 3, kind: "image" },
      { label: "Lifestyle", count: 4, kind: "image" },
      { label: "Social", count: 3, kind: "image" },
      { label: "Video", count: 1, kind: "video" },
    ],
    credits: 940,
  },
  {
    key: "paid_social",
    title: "Paid Social Pack",
    blurb: "Ad-ready creative built to test fast across feeds and reels.",
    icon: Megaphone,
    parts: ["Ad creative", "UGC", "Product", "Video"],
    outputs: [
      { label: "Ad creative", count: 4, kind: "image" },
      { label: "UGC", count: 4, kind: "image" },
      { label: "Product", count: 3, kind: "image" },
      { label: "Video", count: 2, kind: "video" },
    ],
    credits: 820,
  },
  {
    key: "pdp_refresh",
    title: "Product Page Refresh",
    blurb: "Upgrade the page itself — hero, detail and supporting PDP assets.",
    icon: Layers,
    parts: ["Hero", "Detail", "Lifestyle", "PDP support"],
    outputs: [
      { label: "Hero", count: 2, kind: "image" },
      { label: "Detail", count: 4, kind: "image" },
      { label: "Lifestyle", count: 3, kind: "image" },
      { label: "PDP support", count: 3, kind: "image" },
    ],
    credits: 610,
  },
];

type Step = "hero" | "product" | "campaign" | "preview" | "review" | "done";

/* ------------------------------------------------------------------ fragments */

function PrototypeTag({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-primary",
        className,
      )}
    >
      prototype
    </span>
  );
}

function StepFrame({
  eyebrow,
  title,
  subtitle,
  onBack,
  children,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  onBack?: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl">
      {onBack ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onBack}
          className="mb-4 -ml-2 rounded-full text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      ) : null}
      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary">{eyebrow}</p>
      <h1 className="mt-3 font-display text-3xl font-black leading-[1.05] tracking-tight text-foreground sm:text-4xl">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{subtitle}</p>
      ) : null}
      <div className="mt-8">{children}</div>
    </div>
  );
}

function Thumb({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <div className="group relative aspect-[3/4] overflow-hidden rounded-xl border border-border bg-muted/40">
      <div className="flex h-full w-full items-center justify-center">
        <ImageIcon className="h-5 w-5 text-muted-foreground" />
      </div>
      <span className="absolute inset-x-1 bottom-1 rounded-md bg-background/80 px-1.5 py-0.5 text-center text-[9px] uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label} image`}
        className="absolute right-1 top-1 rounded-full bg-background/85 p-1 text-muted-foreground opacity-0 transition hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------------- page */

export default function AdminProductLaunchPrototype() {
  const [step, setStep] = useState<Step>("hero");
  const [url, setUrl] = useState("");
  const [importing, setImporting] = useState(false);

  /* Editable copies of the DEMO data — UI-only edits, nothing persists anywhere. */
  const [title, setTitle] = useState(DEMO_PRODUCT.title);
  const [price, setPrice] = useState(DEMO_PRODUCT.price);
  const [colors, setColors] = useState(DEMO_PRODUCT.colors);
  const [images, setImages] = useState(DEMO_PRODUCT.images);
  const [campaignKey, setCampaignKey] = useState<CampaignKey | null>(null);

  const campaign = useMemo(
    () => CAMPAIGNS.find((entry) => entry.key === campaignKey) ?? null,
    [campaignKey],
  );
  const deliverables = campaign?.outputs.reduce((total, output) => total + output.count, 0) ?? 0;

  const startImport = () => {
    // DEMO: no network call — a short delay only so the transition feels real.
    setImporting(true);
    window.setTimeout(() => {
      setImporting(false);
      setStep("product");
    }, 700);
  };

  return (
    <SiteShell>
      <div className="sticky top-0 z-30 border-b border-primary/25 bg-primary/10 backdrop-blur">
        <div className="container mx-auto flex max-w-5xl items-center gap-2 px-4 py-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="font-display text-[10px] font-bold uppercase tracking-[0.22em] text-primary sm:text-[11px]">
            Product link campaign — UX prototype · not live
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 pb-24 pt-10 sm:pt-14">
        {step === "hero" ? (
          <StepFrame
            eyebrow="Step 1 · Input"
            title="Turn your product page into a campaign."
            subtitle="Paste the product link. FUSE handles the setup."
          >
            <div className="rounded-[1.75rem] border border-border bg-card/60 p-4 sm:p-6">
              <label
                htmlFor="product-url"
                className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
              >
                Product link
              </label>
              <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                <div className="relative flex-1">
                  <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="product-url"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://yourstore.com/products/..."
                    className="h-12 pl-9 text-sm sm:text-base"
                  />
                </div>
                <Button
                  size="lg"
                  onClick={startImport}
                  disabled={importing}
                  className="h-12 rounded-full px-6"
                >
                  {importing ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowRight className="mr-2 h-4 w-4" />
                  )}
                  Import product
                </Button>
              </div>
              <button
                type="button"
                onClick={() => undefined}
                className="mt-4 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition hover:text-foreground"
              >
                No product page? Upload manually →
              </button>
            </div>
          </StepFrame>
        ) : null}

        {step === "product" ? (
          <StepFrame
            eyebrow="Step 2 · Product found"
            title="Product found."
            subtitle="Check what we pulled in. Remove anything you don't want in the campaign."
            onBack={() => setStep("hero")}
          >
            <div className="rounded-[1.75rem] border border-border bg-card/60 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <BadgeCheck className="h-3.5 w-3.5 text-primary" />
                  Brand · {DEMO_PRODUCT.brand}
                </span>
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
                  demo data
                </span>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="demo-title"
                    className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                  >
                    Product
                  </label>
                  <Input
                    id="demo-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="mt-2 h-11 text-base font-semibold"
                  />
                </div>
                <div>
                  <label
                    htmlFor="demo-price"
                    className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
                  >
                    Price
                  </label>
                  <Input
                    id="demo-price"
                    value={price}
                    onChange={(event) => setPrice(event.target.value)}
                    className="mt-2 h-11 text-base font-semibold"
                  />
                </div>
              </div>

              <div className="mt-6">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Colors
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {colors.map((color) => (
                    <span
                      key={color.name}
                      className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/30 py-1 pl-1.5 pr-2 text-xs text-foreground"
                    >
                      <span
                        className="h-5 w-5 rounded-full border border-border"
                        style={{ backgroundColor: `hsl(${color.hsl})` }}
                        aria-hidden
                      />
                      {color.name}
                      <button
                        type="button"
                        aria-label={`Remove ${color.name}`}
                        onClick={() =>
                          setColors((current) => current.filter((entry) => entry.name !== color.name))
                        }
                        className="text-muted-foreground transition hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                  {!colors.length ? (
                    <span className="text-xs text-muted-foreground">No colors selected.</span>
                  ) : null}
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                    {images.length} image{images.length === 1 ? "" : "s"} found
                  </p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  {images.map((image) => (
                    <Thumb
                      key={image.id}
                      label={image.label}
                      onRemove={() =>
                        setImages((current) => current.filter((entry) => entry.id !== image.id))
                      }
                    />
                  ))}
                </div>
              </div>

              <Button
                size="lg"
                onClick={() => setStep("campaign")}
                className="mt-7 h-12 w-full rounded-full sm:w-auto sm:px-7"
              >
                Looks good → Choose campaign
              </Button>
            </div>
          </StepFrame>
        ) : null}

        {step === "campaign" ? (
          <StepFrame
            eyebrow="Step 3 · Campaign"
            title="What are we launching?"
            subtitle="Pick the campaign system. FUSE builds the whole set — not a single image."
            onBack={() => setStep("product")}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              {CAMPAIGNS.map((entry) => {
                const Icon = entry.icon;
                const active = campaignKey === entry.key;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    onClick={() => {
                      setCampaignKey(entry.key);
                      setStep("preview");
                    }}
                    className={cn(
                      "flex h-full flex-col rounded-[1.5rem] border bg-card/60 p-5 text-left transition",
                      active
                        ? "border-primary/60 bg-primary/10"
                        : "border-border hover:border-primary/40 hover:bg-card",
                    )}
                  >
                    <Icon className="h-6 w-6 text-primary" />
                    <h2 className="mt-4 font-display text-lg font-bold tracking-tight text-foreground">
                      {entry.title}
                    </h2>
                    <p className="mt-2 flex-1 text-xs leading-5 text-muted-foreground">{entry.blurb}</p>
                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {entry.parts.map((part) => (
                        <span
                          key={part}
                          className="rounded-full border border-border px-2 py-0.5 text-[9px] uppercase tracking-[0.16em] text-muted-foreground"
                        >
                          {part}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </StepFrame>
        ) : null}

        {step === "preview" && campaign ? (
          <StepFrame
            eyebrow="Step 4 · Campaign preview"
            title={`${campaign.title} · what will be built`}
            onBack={() => setStep("campaign")}
          >
            <div className="rounded-[1.75rem] border border-border bg-card/60 p-4 sm:p-6">
              <div className="flex items-center gap-3 rounded-2xl border border-border bg-muted/30 p-3">
                <div className="flex h-14 w-11 items-center justify-center rounded-lg border border-border bg-muted/50">
                  <ImageIcon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">Your input</p>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {title} · {DEMO_PRODUCT.brand}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex items-center gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Output map
                </p>
                <PrototypeTag />
                <span className="text-[10px] text-muted-foreground">placeholder counts</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                {campaign.outputs.map((output) => (
                  <div
                    key={output.label}
                    className="rounded-2xl border border-border bg-muted/20 p-3"
                  >
                    <div className="flex aspect-[4/5] items-center justify-center rounded-xl border border-dashed border-border bg-background/40">
                      {output.kind === "video" ? (
                        <Film className="h-5 w-5 text-muted-foreground" />
                      ) : (
                        <ImageIcon className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <p className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-foreground">
                        {output.label}
                      </p>
                      <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                        ×{output.count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                size="lg"
                onClick={() => setStep("review")}
                className="mt-7 h-12 w-full rounded-full sm:w-auto sm:px-7"
              >
                Continue to review
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </StepFrame>
        ) : null}

        {step === "review" && campaign ? (
          <StepFrame
            eyebrow="Step 5 · Final review"
            title="Ready to build."
            onBack={() => setStep("preview")}
          >
            <div className="rounded-[1.75rem] border border-border bg-card/60 p-4 sm:p-6">
              <ul className="space-y-2">
                {[
                  { label: "Product", value: `${title} · ${price}` },
                  { label: "Brand", value: DEMO_PRODUCT.brand },
                  { label: "Campaign", value: campaign.title },
                ].map((row) => (
                  <li
                    key={row.label}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-muted/20 px-4 py-3"
                  >
                    <span className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      <Check className="h-4 w-4 text-primary" />
                      {row.label}
                    </span>
                    <span className="truncate text-sm font-semibold text-foreground">{row.value}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Expected deliverables
                    </p>
                    <PrototypeTag />
                  </div>
                  <p className="mt-2 font-display text-2xl font-black text-foreground">{deliverables}</p>
                </div>
                <div className="rounded-2xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                      Estimated credits
                    </p>
                    <PrototypeTag />
                  </div>
                  <p className="mt-2 font-display text-2xl font-black text-foreground">{campaign.credits}</p>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-muted-foreground">
                Deliverable and credit numbers are placeholder values for this draft only — not real
                pricing or capacity.
              </p>

              <Button
                size="lg"
                onClick={() => setStep("done")}
                className="mt-6 h-12 w-full rounded-full sm:w-auto sm:px-7"
              >
                Generate campaign
              </Button>
            </div>
          </StepFrame>
        ) : null}

        {step === "done" ? (
          <StepFrame eyebrow="End state" title="Prototype complete." onBack={() => setStep("review")}>
            <div className="rounded-[1.75rem] border border-primary/40 bg-primary/10 p-6 text-center sm:p-10">
              <Sparkles className="mx-auto h-7 w-7 text-primary" />
              <p className="mt-4 font-display text-lg font-bold tracking-tight text-foreground">
                Generation is intentionally disabled in this draft.
              </p>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                Nothing was generated, nothing was charged. This flow exists to review the experience:
                paste link → confirm product → pick campaign → build.
              </p>
              <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => setStep("hero")}
                  className="rounded-full"
                >
                  Restart prototype
                </Button>
                <Button variant="ghost" onClick={() => setStep("campaign")} className="rounded-full">
                  Try another campaign
                </Button>
              </div>
            </div>
          </StepFrame>
        ) : null}
      </div>
    </SiteShell>
  );
}
