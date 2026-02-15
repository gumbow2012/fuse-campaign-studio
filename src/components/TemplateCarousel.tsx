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
    <section className="pb-24 pt-8 relative">
      <div className="container mx-auto px-6">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-foreground mb-8">
          Select Your Template
        </h2>

        <div className="relative">
          <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
            {templates.map((template, i) => (
              <div
                key={i}
                className="flex-shrink-0 group cursor-pointer"
              >
                <div className="w-[180px] aspect-[9/16] rounded-xl overflow-hidden border border-primary/30 relative transition-all duration-300 group-hover:border-primary/60 group-hover:glow-blue-sm group-hover:-translate-y-1">
                  <img
                    src={template.image}
                    alt={template.name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export default TemplateCarousel;
