import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import TemplateCategories from "@/components/TemplateCategories";

const Index = () => {
  return (
    <div className="min-h-screen bg-[#04060d]">
      <Navbar />
      <HeroSection />
      <TemplateCategories />
    </div>
  );
};

export default Index;
