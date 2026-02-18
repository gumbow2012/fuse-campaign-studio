import { useState, useRef, useEffect } from "react";
import { ChevronDown, X } from "lucide-react";
import ravenOriginal from "@/assets/templates/raven-original.png";
import ugcWhiteGirl from "@/assets/templates/ugc-white-girl.png";
import garageEdit from "@/assets/templates/garage-edit.png";
import ugcStudio from "@/assets/templates/ugc-studio.png";

interface Template {
  id: string;
  name: string;
  image: string;
  tags: string[];
  includes: string[];
  description: string;
  filters: {
    environment: string;
    cameraAngle: string;
    lighting: string;
    mood: string;
    gender: string;
    timeOfDay: string;
    style: string;
  };
}

interface Category {
  icon: string;
  title: string;
  slug: string;
  templates: Template[];
}

const categories: Category[] = [
  {
    icon: "🔥",
    title: "STREET CAMPAIGN",
    slug: "street",
    templates: [
      {
        id: "T-001", name: "PARKING GARAGE GRIT", image: garageEdit,
        tags: ["Low Angle", "28mm Lens", "Harsh Flash", "Gritty"],
        includes: ["On-model", "Closeup", "Editorial"],
        description: "Raw concrete energy. Harsh flash, wide angle.",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Flash", mood: "Gritty", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-002", name: "GAS STATION RAW", image: ravenOriginal,
        tags: ["Night", "Neon Glow", "35mm", "Street Energy"],
        includes: ["On-model", "Lifestyle", "Detail"],
        description: "Late night pump station. Neon spill, film grain.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Neon", mood: "Gritty", gender: "Male", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-003", name: "ROOFTOP SUNSET DROP", image: ugcWhiteGirl,
        tags: ["Golden Hour", "Wide Shot", "Warm Tones"],
        includes: ["On-model", "Editorial", "Landscape"],
        description: "City skyline backdrop. Warm golden hour light.",
        filters: { environment: "Rooftop", cameraAngle: "Wide", lighting: "Golden Hour", mood: "Warm", gender: "Female", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-004", name: "ALLEYWAY FLASH SHOOT", image: ugcStudio,
        tags: ["Flash", "Tight Crop", "Urban", "Night"],
        includes: ["On-model", "Closeup"],
        description: "Direct flash in narrow alleys. Bold and raw.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Flash", mood: "Gritty", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
    ],
  },
  {
    icon: "🧊",
    title: "LUXURY STREET",
    slug: "luxury",
    templates: [
      {
        id: "T-005", name: "CHROME STUDIO", image: ugcStudio,
        tags: ["Studio", "Reflective", "Clean", "High-End"],
        includes: ["On-model", "Product", "Detail"],
        description: "Chrome reflections. Controlled studio light.",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Softbox", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-006", name: "GLOSS BLACK FLOOR", image: ravenOriginal,
        tags: ["Reflection", "Minimal", "Dark", "Softbox"],
        includes: ["On-model", "Editorial"],
        description: "Black mirror floor. Dramatic soft lighting.",
        filters: { environment: "Studio", cameraAngle: "Low Angle", lighting: "Softbox", mood: "Dark", gender: "Male", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-007", name: "SOFTBOX EDITORIAL", image: ugcWhiteGirl,
        tags: ["Editorial", "Soft Light", "Premium"],
        includes: ["On-model", "Closeup", "Lifestyle"],
        description: "Magazine-grade softbox. Clean and elevated.",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Softbox", mood: "Clean", gender: "Female", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-008", name: "MINIMALIST WHITE SET", image: garageEdit,
        tags: ["White", "Clean", "Ecom-Ready", "Bright"],
        includes: ["On-model", "Product", "Detail"],
        description: "Pure white backdrop. Let the garment speak.",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
    ],
  },
  {
    icon: "🎥",
    title: "VIRAL CONTENT",
    slug: "viral",
    templates: [
      {
        id: "T-009", name: "FISHEYE PUNCH", image: garageEdit,
        tags: ["Fisheye", "14mm", "Distortion", "Bold"],
        includes: ["On-model", "TikTok Ready"],
        description: "Wide fisheye distortion. Social-first energy.",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Natural", mood: "Bold", gender: "Male", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-010", name: "MIRROR SELFIE iPHONE", image: ugcWhiteGirl,
        tags: ["UGC", "Phone", "Mirror", "Authentic"],
        includes: ["On-model", "Social Post"],
        description: "Mirror selfie aesthetic. iPhone-native feel.",
        filters: { environment: "Indoor", cameraAngle: "Eye Level", lighting: "Natural", mood: "Warm", gender: "Female", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-011", name: "PAPARAZZI FLASH", image: ravenOriginal,
        tags: ["Flash", "Night", "Candid", "Celebrity"],
        includes: ["On-model", "Editorial"],
        description: "Caught-off-guard pap shot. Direct flash chaos.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Flash", mood: "Bold", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-012", name: "LOW ANGLE POWER SHOT", image: ugcStudio,
        tags: ["Low Angle", "Power", "Wide", "Dramatic"],
        includes: ["On-model", "Hero Shot"],
        description: "Ground-up perspective. Dominance and presence.",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Natural", mood: "Bold", gender: "Male", timeOfDay: "Day", style: "Editorial" },
      },
    ],
  },
  {
    icon: "🩸",
    title: "DARK / UNDERGROUND",
    slug: "dark",
    templates: [
      {
        id: "T-013", name: "HOODED SHADOW FIGURE", image: ravenOriginal,
        tags: ["Shadow", "Mystery", "Dark", "Silhouette"],
        includes: ["On-model", "Mood Shot"],
        description: "Face obscured. Hoodie-forward. Pure mood.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Low Key", mood: "Dark", gender: "Male", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-014", name: "INDUSTRIAL RUST WALL", image: garageEdit,
        tags: ["Rust", "Texture", "Industrial", "Warm"],
        includes: ["On-model", "Editorial", "Detail"],
        description: "Corroded metal backdrop. Warm decay.",
        filters: { environment: "Industrial", cameraAngle: "Eye Level", lighting: "Natural", mood: "Gritty", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-015", name: "TUNNEL BACKLIGHT", image: ugcStudio,
        tags: ["Backlit", "Tunnel", "Halo", "Dramatic"],
        includes: ["On-model", "Silhouette"],
        description: "Light from behind. Halo silhouette effect.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Backlit", mood: "Dark", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-016", name: "VHS GRAIN NIGHT SHOOT", image: ugcWhiteGirl,
        tags: ["VHS", "Grain", "Night", "Lo-Fi"],
        includes: ["On-model", "Lifestyle"],
        description: "VHS tape aesthetic. Heavy grain, lo-fi color.",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Low Key", mood: "Gritty", gender: "Female", timeOfDay: "Night", style: "UGC" },
      },
    ],
  },
  {
    icon: "🧼",
    title: "CLEAN ECOM",
    slug: "ecom",
    templates: [
      {
        id: "T-017", name: "STUDIO FRONT", image: ugcStudio,
        tags: ["Front View", "Clean", "Studio", "Ecom"],
        includes: ["Product", "Front Shot"],
        description: "Straight-on studio shot. Ready for your store.",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-018", name: "BACK + DETAIL CLOSEUP", image: garageEdit,
        tags: ["Back View", "Detail", "Macro", "Clean"],
        includes: ["Product", "Back Shot", "Detail"],
        description: "Back view with stitching details. Shopify-ready.",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-019", name: "SLEEVE FOCUS", image: ugcWhiteGirl,
        tags: ["Sleeve", "Detail", "Macro", "Branding"],
        includes: ["Detail", "Closeup"],
        description: "Arm detail. Brand tag and embroidery focus.",
        filters: { environment: "Studio", cameraAngle: "Close Up", lighting: "Soft Light", mood: "Clean", gender: "Female", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-020", name: "TEXTURE MACRO", image: ravenOriginal,
        tags: ["Macro", "Texture", "Fabric", "Premium"],
        includes: ["Detail", "Texture Shot"],
        description: "Extreme close fabric. Show the quality.",
        filters: { environment: "Studio", cameraAngle: "Close Up", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
    ],
  },
];

// Filter definitions
const filterOptions: { key: keyof Template["filters"]; label: string; icon: string; options: string[] }[] = [
  { key: "environment", label: "Environment", icon: "🏙", options: ["Urban", "Studio", "Indoor", "Rooftop", "Industrial"] },
  { key: "cameraAngle", label: "Camera Angle", icon: "📐", options: ["Eye Level", "Low Angle", "Wide", "Close Up"] },
  { key: "lighting", label: "Lighting", icon: "💡", options: ["Flash", "Natural", "Softbox", "Soft Light", "Neon", "Golden Hour", "Backlit", "Low Key"] },
  { key: "mood", label: "Mood", icon: "🎭", options: ["Gritty", "Clean", "Dark", "Bold", "Warm"] },
  { key: "gender", label: "Gender", icon: "👤", options: ["Male", "Female", "Unisex"] },
  { key: "timeOfDay", label: "Time", icon: "🌗", options: ["Day", "Night"] },
  { key: "style", label: "Style", icon: "🎨", options: ["Editorial", "UGC"] },
];

// Dropdown component
const FilterDropdown = ({
  filter,
  value,
  onChange,
}: {
  filter: typeof filterOptions[number];
  value: string | null;
  onChange: (val: string | null) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg border transition-all duration-200 whitespace-nowrap ${
          value
            ? "bg-white/10 border-white/20 text-white"
            : "bg-white/[0.03] border-white/8 text-white/50 hover:text-white/70 hover:border-white/15"
        }`}
      >
        <span>{filter.icon}</span>
        <span>{value || filter.label}</span>
        {value ? (
          <X
            className="w-3 h-3 ml-0.5 text-white/40 hover:text-white"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
          />
        ) : (
          <ChevronDown className="w-3 h-3 ml-0.5 text-white/30" />
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 z-50 min-w-[160px] bg-[#1a1a2e] border border-white/10 rounded-lg shadow-2xl py-1 backdrop-blur-xl">
          {filter.options.map((opt) => (
            <button
              key={opt}
              onClick={() => { onChange(opt === value ? null : opt); setOpen(false); }}
              className={`w-full text-left text-xs px-3.5 py-2 transition-colors ${
                opt === value
                  ? "text-white bg-white/10"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const TemplateCard = ({ template }: { template: Template }) => (
  <div className="group cursor-pointer relative">
    <div className="w-full aspect-[9/16] rounded-xl overflow-hidden border border-white/10 relative transition-all duration-300 group-hover:border-white/25 group-hover:-translate-y-1 group-hover:shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
      <img
        src={template.image}
        alt={template.name}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
        loading="lazy"
      />
      {/* Hover overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        <p className="text-[10px] text-white/40 font-mono mb-1">{template.id}</p>
        <h4 className="text-sm font-bold text-white tracking-wide leading-tight mb-1">{template.name}</h4>
        <p className="text-[11px] text-white/60 mb-2 leading-snug">{template.description}</p>
        <div className="flex flex-wrap gap-1 mb-2">
          {template.tags.slice(0, 3).map((tag) => (
            <span key={tag} className="text-[9px] font-medium uppercase tracking-wider text-white/70 bg-white/10 backdrop-blur-sm px-1.5 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
        <p className="text-[10px] text-white/40">
          Includes: {template.includes.join(" · ")}
        </p>
      </div>
    </div>
    {/* Static label under card */}
    <div className="mt-2.5 px-0.5">
      <p className="text-[10px] text-white/30 font-mono">{template.id}</p>
      <p className="text-xs font-semibold text-white/80 tracking-wide">{template.name}</p>
    </div>
  </div>
);

const TemplateCategories = () => {
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [activeFilters, setActiveFilters] = useState<Record<string, string | null>>({});

  const hasActiveFilters = Object.values(activeFilters).some(Boolean);

  const setFilter = (key: string, value: string | null) => {
    setActiveFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearAllFilters = () => setActiveFilters({});

  // Apply filters
  const filteredCategories = (activeCategory === "all" ? categories : categories.filter((c) => c.slug === activeCategory))
    .map((cat) => ({
      ...cat,
      templates: cat.templates.filter((t) =>
        Object.entries(activeFilters).every(([key, val]) => {
          if (!val) return true;
          return t.filters[key as keyof Template["filters"]] === val;
        })
      ),
    }))
    .filter((cat) => cat.templates.length > 0);

  const totalVisible = filteredCategories.reduce((sum, c) => sum + c.templates.length, 0);

  return (
    <section className="py-20 relative">
      {/* Subtle grain texture */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none bg-[url('data:image/svg+xml,%3Csvg viewBox=%270 0 256 256%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27noise%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23noise)%27 opacity=%270.03%27/%3E%3C/svg%3E')] bg-repeat" />

      <div className="container mx-auto px-6 relative z-10">
        {/* Section header */}
        <div className="mb-8">
          <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-white/30 mb-3">
            Choose your creative direction
          </p>
          <h2 className="font-display text-3xl md:text-4xl font-bold text-white tracking-tight">
            Template Library
          </h2>
        </div>

        {/* Filter bar */}
        <div className="mb-4 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02]">
          <div className="flex flex-wrap items-center gap-2">
            {filterOptions.map((f) => (
              <FilterDropdown
                key={f.key}
                filter={f}
                value={activeFilters[f.key] || null}
                onChange={(val) => setFilter(f.key, val)}
              />
            ))}

            {hasActiveFilters && (
              <button
                onClick={clearAllFilters}
                className="text-[10px] uppercase tracking-wider text-white/30 hover:text-white/60 transition-colors ml-2 flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear all
              </button>
            )}

            <span className="ml-auto text-[10px] font-mono text-white/20">
              {totalVisible} templates
            </span>
          </div>
        </div>

        {/* Category filter pills */}
        <div className="flex flex-wrap gap-2 mb-12">
          <button
            onClick={() => setActiveCategory("all")}
            className={`text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg border transition-all duration-200 ${
              activeCategory === "all"
                ? "bg-gradient-to-r from-emerald-500/80 via-teal-400/80 to-blue-500/80 border-emerald-400/30 text-white shadow-[0_0_15px_rgba(16,185,129,0.3)]"
                : "bg-transparent border-white/8 text-white/40 hover:text-white/70 hover:border-white/15"
            }`}
          >
            All Templates
          </button>
          {categories.map((cat, i) => {
            const gradients = [
              "from-green-400/80 via-emerald-500/80 to-teal-500/80 border-green-400/30 shadow-[0_0_15px_rgba(74,222,128,0.3)]",
              "from-teal-400/80 via-cyan-400/80 to-blue-500/80 border-teal-400/30 shadow-[0_0_15px_rgba(45,212,191,0.3)]",
              "from-cyan-400/80 via-blue-500/80 to-violet-500/80 border-cyan-400/30 shadow-[0_0_15px_rgba(34,211,238,0.3)]",
              "from-blue-500/80 via-violet-500/80 to-purple-500/80 border-blue-400/30 shadow-[0_0_15px_rgba(139,92,246,0.3)]",
              "from-violet-500/80 via-purple-500/80 to-fuchsia-500/80 border-violet-400/30 shadow-[0_0_15px_rgba(168,85,247,0.3)]",
            ];
            return (
              <button
                key={cat.slug}
                onClick={() => setActiveCategory(cat.slug)}
                className={`text-xs font-semibold uppercase tracking-wider px-4 py-2 rounded-lg border transition-all duration-200 ${
                  activeCategory === cat.slug
                    ? `bg-gradient-to-r ${gradients[i % gradients.length]} text-white`
                    : "bg-transparent border-white/8 text-white/40 hover:text-white/70 hover:border-white/15"
                }`}
              >
                {cat.icon} {cat.title}
              </button>
            );
          })}
        </div>

        {/* Category sections */}
        <div className="space-y-16">
          {filteredCategories.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-white/30 text-sm">No templates match your filters.</p>
              <button onClick={clearAllFilters} className="text-xs text-white/50 hover:text-white/80 mt-2 underline underline-offset-4">
                Clear filters
              </button>
            </div>
          ) : (
            filteredCategories.map((category) => (
              <div key={category.slug}>
                <div className="flex items-center gap-3 mb-6">
                  <span className="text-xl">{category.icon}</span>
                  <h3 className="font-display text-lg font-bold text-white/90 tracking-wider uppercase">
                    {category.title}
                  </h3>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
                  <span className="text-[10px] font-mono text-white/20 uppercase">
                    {category.templates.length} templates
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 gap-4 md:gap-6">
                  {category.templates.map((template) => (
                    <TemplateCard key={template.id} template={template} />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
};

export default TemplateCategories;
