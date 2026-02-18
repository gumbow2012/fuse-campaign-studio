import { Button } from "@/components/ui/button";
import UploadCard from "./UploadCard";
import ExampleOutput from "./ExampleOutput";

const HeroSection = () => {
  return (
    <section className="relative pt-20 pb-20 overflow-hidden min-h-screen flex flex-col justify-center">
      {/* 
        Background Layer 
        Base: Deep inky navy/black-blue #0C1626 / #111322
      */}
      <div className="absolute inset-0 bg-[#0C1626]" />
      
      {/* 
        Main Glow Cloud
        Brighter energy from left/mid rolling right.
        #0787DE -> #0A72B9 -> #0866AA
        Positioned middle-left, bleeding into RHS.
      */}
      <div 
        className="absolute top-[-10%] left-[-10%] w-[70%] h-[120%] rounded-full opacity-90 blur-[120px]"
        style={{
          background: "radial-gradient(circle at center, #0787DE 0%, #0A72B9 40%, #0866AA 70%, transparent 100%)",
          transform: "rotate(-15deg)",
        }}
      />

      {/* 
        Secondary Glow / Bleed
        Softens the transition to the right
      */}
      <div 
        className="absolute top-[10%] left-[30%] w-[50%] h-[80%] rounded-full opacity-60 blur-[100px]"
        style={{
          background: "radial-gradient(circle at center, #0A72B9 0%, transparent 70%)",
        }}
      />

      {/* 
        Dark Falloff / Vignette
        Fades quickly into inky navy toward far right edge and corners.
        #094373 -> #092744 -> #0C1626
        Strong edge darkening top-right and bottom-right.
      */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 90% 90%, #0C1626 0%, #092744 30%, transparent 70%),
            radial-gradient(circle at 90% 10%, #092744 0%, transparent 50%),
            linear-gradient(to right, transparent 40%, #0C1626 100%)
          `
        }}
      />

      {/* 
        Texture Overlay
        Subtle smoky / fog blur texture with gentle noise.
      */}
      <div className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-repeat" />
      <div className="absolute inset-0 opacity-20 pointer-events-none mix-blend-soft-light bg-gradient-to-br from-white/10 to-transparent backdrop-blur-3xl" />


      <div className="container mx-auto px-6 relative z-10">
        <div className="flex flex-col lg:flex-row items-center lg:items-start justify-between gap-12 lg:gap-20">
          {/* Left — copy */}
          <div className="flex-1 max-w-xl text-center lg:text-left pt-12">
            <h1 className="font-display text-5xl md:text-7xl font-bold leading-[1.05] tracking-tight mb-8 text-[#FDFCF0] drop-shadow-2xl">
              Build Your
              <br />
              Entire Drop.
              <br />
              <span className="text-white/60">One Run.</span>
            </h1>
            <p className="text-lg md:text-xl text-blue-200/80 leading-relaxed mb-10 max-w-lg font-light mx-auto lg:mx-0">
              Turn your garment into a full campaign — on-model shots, closeups, and drop-ready content. Automatically.
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
