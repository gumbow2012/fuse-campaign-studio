import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="min-h-screen flex items-center relative grain vignette pt-16">
      <div className="container mx-auto px-6 py-20">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          {/* Left side — copy */}
          <div className="max-w-xl">
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold text-foreground leading-[1.05] tracking-tight mb-6">
              Create Full Campaign Content.{" "}
              <span className="gradient-text">One Click.</span>
            </h1>
            <p className="text-lg text-muted-foreground leading-relaxed mb-10 max-w-md">
              Upload your product and logo. FUSE generates on-model shots, closeups, and drop-ready content automatically.
            </p>
            <div className="flex items-center gap-4">
              <Button className="rounded-full gradient-primary text-primary-foreground font-medium h-12 px-8 glow-blue hover:opacity-90 transition-opacity border-0 text-base">
                Start Creating
              </Button>
              <Button
                variant="outline"
                className="rounded-full border-border/60 text-muted-foreground hover:text-foreground hover:border-foreground/30 bg-transparent h-12 px-8 text-base"
              >
                View Templates
              </Button>
            </div>
          </div>

          {/* Right side — upload card + example output */}
          <div className="flex items-center justify-center gap-6 lg:gap-8">
            <UploadCard />
            <ExampleOutput />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
