import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import BeforeAfterProofPreview from "@/components/cro/BeforeAfterProofPreview";

/** Outcome-first hero. Visual proof is the real pair grid — no node diagram. */
export default function CroHero({ internalLabels = false }: { internalLabels?: boolean }) {
  return (
    <section className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
      <div className="space-y-5">
        <h1 className="text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Your product. In a real campaign. Five minutes.
        </h1>
        <p className="max-w-xl text-base text-muted-foreground">
          Upload the garment, pick a proven shoot, get images and clips with your graphics
          intact. No prompts.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link to="/app/templates">See Campaigns</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/pricing">Start for $20</Link>
          </Button>
        </div>
      </div>
      <BeforeAfterProofPreview compact internalLabels={internalLabels} />
    </section>
  );
}
