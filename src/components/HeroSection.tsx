import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {

  return (
    <section className="relative pt-16 pb-20 overflow-hidden min-h-screen flex flex-col justify-center">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at 25% 40%, rgba(34,141,214,0.9) 0%, rgba(20,95,155,0.7) 35%, rgba(10,45,80,0.3) 55%, rgba(0,0,0,0) 75%), linear-gradient(135deg, #071A2F 0%, #0C355C 100%)`,
        }}
      />

      {/* Vignette */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: "radial-gradient(circle at 90% 90%, #04060d 0%, #092744 30%, transparent 70%), radial-gradient(circle at 90% 10%, #092744 0%, transparent 50%), linear-gradient(to right, transparent 40%, #04060d 100%)" }}
      />

      {/* Contrast anchor — soft radial darkening behind headline */}
      <div
        className="absolute top-[15%] left-[8%] w-[45%] h-[65%] rounded-full pointer-events-none blur-[100px]"
        style={{ background: "radial-gradient(ellipse at center, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.2) 45%, transparent 75%)" }}
      />

      {/* Grain */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none mix-blend-overlay bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.06%27/%3E%3C/svg%3E')] bg-repeat" />

      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-12 lg:gap-20">
          {/* Left — copy with readability plate */}
          <div className="flex-1 max-w-xl text-center lg:text-left pt-12 relative">
            {/* Subtle readability plate — no box, just gradient */}
            <div className="absolute -inset-8 rounded-2xl bg-gradient-to-r from-black/25 via-black/10 to-transparent -z-10" />

            <p
              className="text-[9px] font-black uppercase tracking-[0.4em] mb-4"
              style={{ color: "rgba(255,255,255,0.65)", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
            >
              For Streetwear Brands
            </p>
            <h1
              className="font-display text-5xl md:text-7xl font-black leading-[1.05] tracking-tight mb-6 text-white"
              style={{ textShadow: "0 2px 20px rgba(0,0,0,0.4)" }}
            >
              Build Your
              <br />
              Entire Drop.
              <br />
              <span className="font-bold tracking-wide">One Run.</span>
            </h1>
            <p
              className="text-base md:text-lg leading-relaxed mb-4 max-w-md font-light mx-auto lg:mx-0"
              style={{ color: "rgba(255,255,255,0.85)", textShadow: "0 2px 14px rgba(0,0,0,0.4)" }}
            >
              Turn your garment into a campaign system. On-model. Closeups. Editorial. In one run.
            </p>

            {/* Process steps — pill with stronger border */}
            <div
              className="inline-flex items-center gap-3 mb-10 px-4 py-2.5 rounded-lg border border-white/[0.1] bg-[#04060d]/50 backdrop-blur-sm"
              style={{ textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
            >
              {["Upload the Garment", "Choose Creative Direction", "Run the Drop"].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {i > 0 && <span className="text-white/25 text-xs">→</span>}
                  <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60">{step}</span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-center lg:justify-start gap-4 mb-6">
              <Button className="h-11 px-8 rounded-lg bg-gradient-to-r from-cyan-400 to-blue-500 text-white font-black text-sm tracking-[0.1em] uppercase hover:opacity-90 transition-all shadow-[0_0_25px_rgba(6,182,212,0.35)] hover:shadow-[0_0_35px_rgba(6,182,212,0.55)] border-0">
                Launch Drop
              </Button>
              <Button
                variant="outline"
                className="h-11 px-8 rounded-lg border-white/15 bg-transparent text-white/70 hover:bg-white/5 hover:border-white/25 transition-all text-sm font-medium tracking-wide backdrop-blur-sm"
              >
                View Drops
              </Button>
            </div>

            {/* Social proof */}
            <p
              className="text-[10px] uppercase tracking-[0.2em] font-medium"
              style={{ color: "rgba(255,255,255,0.6)", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}
            >
              8,240 Campaign Runs Generated
            </p>
          </div>

          {/* Right — upload card + example output */}
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
