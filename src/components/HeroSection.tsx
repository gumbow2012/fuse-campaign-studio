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
      <div className="absolute inset-0 bg-[#0a0e1a]" />
      
      {/* Aurora green glow — center-left */}
      <div 
        className="absolute top-[-15%] left-[-5%] w-[60%] h-[130%] rounded-full opacity-70 blur-[140px]"
        style={{
          background: "radial-gradient(circle at center, #22c55e 0%, #10b981 30%, #059669 55%, transparent 100%)",
          transform: "rotate(-10deg)",
        }}
      />

      {/* Purple/violet wash — upper right */}
      <div 
        className="absolute top-[-20%] right-[5%] w-[55%] h-[100%] rounded-full opacity-60 blur-[130px]"
        style={{
          background: "radial-gradient(circle at center, #a855f7 0%, #7c3aed 35%, #6d28d9 60%, transparent 100%)",
          transform: "rotate(15deg)",
        }}
      />

      {/* Pink/magenta accent — lower center */}
      <div 
        className="absolute bottom-[-10%] left-[25%] w-[45%] h-[70%] rounded-full opacity-40 blur-[120px]"
        style={{
          background: "radial-gradient(circle at center, #ec4899 0%, #db2777 40%, transparent 100%)",
        }}
      />

      {/* Teal secondary — right side mid */}
      <div 
        className="absolute top-[20%] left-[40%] w-[40%] h-[60%] rounded-full opacity-50 blur-[110px]"
        style={{
          background: "radial-gradient(circle at center, #2dd4bf 0%, #14b8a6 40%, transparent 80%)",
        }}
      />

      {/* Dark vignette — edges */}
      <div 
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
            radial-gradient(circle at 95% 95%, #0a0e1a 0%, transparent 50%),
            radial-gradient(circle at 95% 5%, #0a0e1a 0%, transparent 40%),
            radial-gradient(circle at 5% 95%, #0a0e1a 0%, transparent 40%),
            linear-gradient(to bottom, transparent 60%, #0a0e1a 100%)
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
