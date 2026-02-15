import ravenOriginal from "@/assets/templates/raven-original.png";
import ugcWhiteGirl from "@/assets/templates/ugc-white-girl.png";
import garageEdit from "@/assets/templates/garage-edit.png";
import ugcStudio from "@/assets/templates/ugc-studio.png";

const templates = [
  { name: "Street Raven", image: ravenOriginal, category: "Street" },
  { name: "UGC Natural", image: ugcWhiteGirl, category: "UGC" },
  { name: "Garage Editorial", image: garageEdit, category: "Editorial" },
  { name: "Studio Shoot", image: ugcStudio, category: "Studio" },
  { name: "Street Raven II", image: ravenOriginal, category: "Street" },
  { name: "UGC Natural II", image: ugcWhiteGirl, category: "UGC" },
];

const TemplateCarousel = () => {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-6">
        <h2 className="font-display text-3xl md:text-4xl font-bold text-foreground mb-12 text-center">
          Select Your Template
        </h2>

        {/* Horizontal scroll container */}
        <div className="relative">
          <div className="flex gap-5 overflow-x-auto pb-4 scrollbar-hide snap-x snap-mandatory">
            {templates.map((template, i) => (
              <div
                key={i}
                className="flex-shrink-0 snap-start group cursor-pointer"
              >
                <div className="w-[200px] aspect-[9/16] rounded-2xl overflow-hidden border border-border/40 relative transition-all duration-300 group-hover:border-primary/40 group-hover:glow-blue-sm group-hover:-translate-y-1">
                  <img
                    src={template.image}
                    alt={template.name}
                    className="w-full h-full object-contain bg-card"
                    loading="lazy"
                  />
                </div>
                <div className="mt-3 px-1">
                  <p className="text-sm font-medium text-foreground">{template.name}</p>
                  <p className="text-xs text-muted-foreground">{template.category}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Fade edges */}
          <div className="absolute top-0 left-0 w-16 h-full bg-gradient-to-r from-background to-transparent pointer-events-none z-10" />
          <div className="absolute top-0 right-0 w-16 h-full bg-gradient-to-l from-background to-transparent pointer-events-none z-10" />
        </div>
      </div>
    </section>
  );
};

export default TemplateCarousel;
