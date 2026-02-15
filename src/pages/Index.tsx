import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import TemplateCarousel from "@/components/TemplateCarousel";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <TemplateCarousel />
    </div>
  );
};

export default Index;
