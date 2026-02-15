import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="relative pt-16 overflow-hidden">
      {/* Deep background */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Vibrant blue/cyan radial glow — intense to match reference */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 120% 90% at 50% 30%, hsl(190 100% 50% / 0.35) 0%, hsl(210 100% 50% / 0.20) 25%, hsl(220 80% 30% / 0.10) 50%, transparent 70%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 35%, hsl(185 100% 55% / 0.25) 0%, transparent 55%)",
        }}
      />

      <div className="max-w-[1300px] mx-auto px-8 py-20 relative z-10">
        <div className="flex flex-col lg:flex-row items-start gap-8 pt-12">
          {/* Left — copy */}
          <div className="flex-1 max-w-xl pt-8">
            <h1 className="font-display text-5xl md:text-[3.5rem] lg:text-[4rem] font-bold leading-[1.08] tracking-tight mb-6 text-foreground">
              Create Full
              <br />
              Campaign Content.
              <br />
              One Click.
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

          {/* Right — upload card + example output side by side */}
          <div className="flex items-start gap-5 flex-shrink-0">
            <UploadCard />
            <ExampleOutput />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
