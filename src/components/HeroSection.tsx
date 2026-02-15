import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="relative pt-16 overflow-hidden">
      {/* Blue radial glow background — strong to match reference */}
      <div className="absolute inset-0 bg-background" />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 90% 70% at 55% 50%, hsl(199 89% 48% / 0.18) 0%, transparent 65%)",
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse 60% 50% at 50% 45%, hsl(199 89% 48% / 0.12) 0%, transparent 55%)",
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
