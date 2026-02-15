import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="min-h-screen flex items-center relative grain vignette pt-16">
      <div className="container mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1fr_auto_auto] gap-10 items-center">
          {/* Left — copy */}
          <div className="max-w-lg">
            <h1 className="font-display text-5xl md:text-6xl font-bold leading-[1.08] tracking-tight mb-6">
              <span className="text-gradient-warm">Create Full</span>
              <br />
              <span className="text-gradient-warm">Campaign Content.</span>
              <br />
              <span className="text-gradient-warm">One Click.</span>
            </h1>
            <p className="text-base text-muted-foreground leading-relaxed mb-10 max-w-md">
              Upload your product and logo. FUSE generates on-model shots, closeups, and drop-ready content automatically.
            </p>
            <div className="flex items-center gap-4">
              <Button className="rounded-full gradient-primary text-primary-foreground font-medium h-11 px-7 glow-blue-sm hover:opacity-90 transition-opacity border-0">
                Start Creating
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-border/60 text-foreground hover:text-foreground hover:border-foreground/30 bg-transparent h-11 px-7"
              >
                View Templates
              </Button>
            </div>
          </div>

          {/* Center — upload card */}
          <UploadCard />

          {/* Right — example output */}
          <ExampleOutput />
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
