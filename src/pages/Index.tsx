import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import TemplateCategories from "@/components/TemplateCategories";

const LiveDropStrip = () => (
  <div className="fixed top-16 inset-x-0 z-40 bg-white/[0.03] border-b border-white/[0.05] backdrop-blur-sm">
    <div className="container mx-auto px-6 py-1.5 flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/50">
          Live Drop: Raw Street Vol 01
        </span>
      </div>
      <span className="text-[8px] uppercase tracking-[0.15em] text-white/20 font-medium">
        New Templates Added
      </span>
    </div>
  </div>
);

const Index = () => {
  return (
    <div className="min-h-screen bg-[#04060d]">
      <Navbar />
      <LiveDropStrip />
      <div className="pt-[calc(4rem+30px)]">
        <HeroSection />
        <TemplateCategories />
      </div>
    </div>
  );
};

export default Index;
