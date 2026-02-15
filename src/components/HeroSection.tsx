import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="relative pt-20 pb-20 overflow-hidden min-h-screen flex flex-col justify-center">
      {/* Deep background */}
      <div className="absolute inset-0 bg-[#020617]" />
      
      {/* Intense blue/cyan glow - positioned behind text and cards */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[1200px] h-[1200px] rounded-full blur-[120px]"
          style={{
            top: "-500px",
            left: "10%",
            background: "radial-gradient(circle, rgba(6,182,212,0.25) 0%, rgba(59,130,246,0.15) 40%, transparent 70%)",
            opacity: 1,
            zIndex: 0,
          }}
        />
        <div
          className="absolute w-[800px] h-[800px] rounded-full blur-[100px]"
          style={{
            top: "-200px",
            left: "30%",
            background: "radial-gradient(circle, rgba(14,165,233,0.3) 0%, transparent 60%)",
            opacity: 0.8,
            zIndex: 0,
          }}
        />
      </div>

      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-12 lg:gap-20">
          {/* Left — copy */}
          <div className="flex-1 max-w-xl text-center lg:text-left pt-12">
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-8 text-white drop-shadow-2xl">
              Create Full
              <br />
              Campaign Content.
              <br />
              One Click.
            </h1>
            <p className="text-lg md:text-xl text-blue-100/70 leading-relaxed mb-10 max-w-lg font-light mx-auto lg:mx-0">
              Upload your product and logo. FUSE generates on-model shots, closeups, and drop-ready content automatically.
            </p>
            <div className="flex items-center justify-center lg:justify-start gap-4">
              <Button className="h-12 px-8 rounded-xl bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-semibold hover:opacity-90 transition-all text-base shadow-[0_0_20px_rgba(6,182,212,0.4)] hover:shadow-[0_0_30px_rgba(6,182,212,0.6)] border-0">
                Start Creating
              </Button>
              <Button
                variant="outline"
                className="h-12 px-8 rounded-xl border-white/20 bg-transparent text-white hover:bg-white/10 hover:border-white/40 transition-all text-base font-normal backdrop-blur-sm"
              >
                View Templates
              </Button>
            </div>
          </div>

          {/* Right — upload card + example output side by side */}
          <div className="flex flex-row items-center gap-6 lg:gap-8 transform scale-95 lg:scale-100 origin-top">
            <UploadCard />
            <ExampleOutput />
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
