import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="relative pt-16">
      {/* Deep background */}
      <div className="absolute inset-0 bg-background" />
      
      {/* Bright cyan/blue glow blobs */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute w-[1200px] h-[800px] rounded-full"
          style={{
            top: "-400px",
            left: "40%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, hsl(190 100% 50%) 0%, hsl(195 100% 55%) 30%, transparent 70%)",
            opacity: 0.5,
            filter: "blur(90px)",
          }}
        />
        <div
          className="absolute w-[800px] h-[600px] rounded-full"
          style={{
            top: "-200px",
            left: "50%",
            transform: "translateX(-50%)",
            background: "radial-gradient(circle, hsl(185 100% 60%) 0%, hsl(190 100% 50%) 50%, transparent 75%)",
            opacity: 0.3,
            filter: "blur(60px)",
          }}
        />
      </div>

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
