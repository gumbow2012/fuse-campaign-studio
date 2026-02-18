import ravenOriginal from "@/assets/templates/raven-original.png";
import ugcWhiteGirl from "@/assets/templates/ugc-white-girl.png";
import garageEdit from "@/assets/templates/garage-edit.png";
import ugcStudio from "@/assets/templates/ugc-studio.png";
import type { Template } from "./DropTemplateCard";
import type { FilterOption } from "./FilterDropdown";

export interface DropCollection {
  icon: string;
  title: string;
  slug: string;
  volume: string;
  releaseDate: string;
  description: string;
  builtFor: string;
  templates: Template[];
}

export const drops: DropCollection[] = [
  {
    icon: "🔥",
    title: "RAW STREET",
    slug: "street",
    volume: "VOL 01",
    releaseDate: "FEB 2026",
    description: "Harsh Flash / 28mm Distortion / Concrete Energy",
    builtFor: "Wide Lens + Harsh Flash",
    templates: [
      {
        id: "T-001", name: "PARKING GARAGE GRIT", image: garageEdit,
        tags: ["Low Angle", "28mm", "Harsh Flash", "Gritty"],
        includes: ["3 On-Model", "2 Closeup", "1 Editorial"],
        description: "Raw concrete energy. Harsh flash, wide angle.",
        badge: "HIGH DEMAND",
        energy: "Aggressive",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Flash", mood: "Gritty", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-002", name: "GAS STATION RAW", image: ravenOriginal,
        tags: ["Night", "Neon Glow", "35mm", "Street"],
        includes: ["2 On-Model", "1 Lifestyle", "1 Detail"],
        description: "Late night pump station. Neon spill, film grain.",
        badge: "NEW",
        energy: "Gritty",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Neon", mood: "Gritty", gender: "Male", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-003", name: "ROOFTOP SUNSET DROP", image: ugcWhiteGirl,
        tags: ["Golden Hour", "Wide", "Warm Tones"],
        includes: ["2 On-Model", "1 Editorial", "1 Landscape"],
        description: "City skyline backdrop. Warm golden hour light.",
        energy: "Cinematic",
        filters: { environment: "Rooftop", cameraAngle: "Wide", lighting: "Golden Hour", mood: "Warm", gender: "Female", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-004", name: "ALLEYWAY FLASH", image: ugcStudio,
        tags: ["Flash", "Tight Crop", "Urban", "Night"],
        includes: ["2 On-Model", "1 Closeup"],
        description: "Direct flash in narrow alleys. Bold and raw.",
        badge: "LIMITED",
        energy: "Flashy",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Flash", mood: "Gritty", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
    ],
  },
  {
    icon: "🧊",
    title: "LUXE EDITORIAL",
    slug: "luxury",
    volume: "VOL 02",
    releaseDate: "JAN 2026",
    description: "Chrome Reflections / Softbox Control / Premium Finish",
    builtFor: "Studio Light + Reflective Surfaces",
    templates: [
      {
        id: "T-005", name: "CHROME STUDIO", image: ugcStudio,
        tags: ["Studio", "Reflective", "Clean", "High-End"],
        includes: ["2 On-Model", "1 Product", "1 Detail"],
        description: "Chrome reflections. Controlled studio light.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Softbox", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-006", name: "GLOSS BLACK FLOOR", image: ravenOriginal,
        tags: ["Reflection", "Minimal", "Dark", "Softbox"],
        includes: ["2 On-Model", "1 Editorial"],
        description: "Black mirror floor. Dramatic soft lighting.",
        badge: "NEW",
        energy: "Dark",
        filters: { environment: "Studio", cameraAngle: "Low Angle", lighting: "Softbox", mood: "Dark", gender: "Male", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-007", name: "SOFTBOX EDITORIAL", image: ugcWhiteGirl,
        tags: ["Editorial", "Soft Light", "Premium"],
        includes: ["2 On-Model", "1 Closeup", "1 Lifestyle"],
        description: "Magazine-grade softbox. Clean and elevated.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Softbox", mood: "Clean", gender: "Female", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-008", name: "MINIMALIST WHITE SET", image: garageEdit,
        tags: ["White", "Clean", "Ecom-Ready", "Bright"],
        includes: ["2 On-Model", "1 Product", "1 Detail"],
        description: "Pure white backdrop. Let the garment speak.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
    ],
  },
  {
    icon: "🎥",
    title: "VIRAL POV",
    slug: "viral",
    volume: "VOL 03",
    releaseDate: "FEB 2026",
    description: "Fisheye Distortion / Phone-Native / Social-First",
    builtFor: "Social Platforms + Vertical Video",
    templates: [
      {
        id: "T-009", name: "FISHEYE PUNCH", image: garageEdit,
        tags: ["Fisheye", "14mm", "Distortion", "Bold"],
        includes: ["2 On-Model", "1 TikTok Ready"],
        description: "Wide fisheye distortion. Social-first energy.",
        badge: "HIGH DEMAND",
        energy: "Aggressive",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Natural", mood: "Bold", gender: "Male", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-010", name: "MIRROR SELFIE iPHONE", image: ugcWhiteGirl,
        tags: ["UGC", "Phone", "Mirror", "Authentic"],
        includes: ["2 On-Model", "1 Social Post"],
        description: "Mirror selfie aesthetic. iPhone-native feel.",
        energy: "Romantic",
        filters: { environment: "Indoor", cameraAngle: "Eye Level", lighting: "Natural", mood: "Warm", gender: "Female", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-011", name: "PAPARAZZI FLASH", image: ravenOriginal,
        tags: ["Flash", "Night", "Candid", "Celebrity"],
        includes: ["2 On-Model", "1 Editorial"],
        description: "Caught-off-guard pap shot. Direct flash chaos.",
        badge: "NEW",
        energy: "Flashy",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Flash", mood: "Bold", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-012", name: "LOW ANGLE POWER", image: ugcStudio,
        tags: ["Low Angle", "Power", "Wide", "Dramatic"],
        includes: ["2 On-Model", "1 Hero Shot"],
        description: "Ground-up perspective. Dominance and presence.",
        energy: "Aggressive",
        filters: { environment: "Urban", cameraAngle: "Low Angle", lighting: "Natural", mood: "Bold", gender: "Male", timeOfDay: "Day", style: "Editorial" },
      },
    ],
  },
  {
    icon: "🩸",
    title: "UNDERGROUND",
    slug: "dark",
    volume: "VOL 04",
    releaseDate: "DEC 2025",
    description: "Shadow Play / Silhouette-Forward / Lo-Fi Grain",
    builtFor: "Low Key Light + Dark Environments",
    templates: [
      {
        id: "T-013", name: "HOODED SHADOW FIGURE", image: ravenOriginal,
        tags: ["Shadow", "Mystery", "Dark", "Silhouette"],
        includes: ["2 On-Model", "1 Mood Shot"],
        description: "Face obscured. Hoodie-forward. Pure mood.",
        badge: "LIMITED",
        energy: "Dark",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Low Key", mood: "Dark", gender: "Male", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-014", name: "INDUSTRIAL RUST WALL", image: garageEdit,
        tags: ["Rust", "Texture", "Industrial", "Warm"],
        includes: ["2 On-Model", "1 Editorial", "1 Detail"],
        description: "Corroded metal backdrop. Warm decay.",
        energy: "Gritty",
        filters: { environment: "Industrial", cameraAngle: "Eye Level", lighting: "Natural", mood: "Gritty", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
      {
        id: "T-015", name: "TUNNEL BACKLIGHT", image: ugcStudio,
        tags: ["Backlit", "Tunnel", "Halo", "Dramatic"],
        includes: ["2 On-Model", "1 Silhouette"],
        description: "Light from behind. Halo silhouette effect.",
        energy: "Cinematic",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Backlit", mood: "Dark", gender: "Unisex", timeOfDay: "Night", style: "Editorial" },
      },
      {
        id: "T-016", name: "VHS GRAIN NIGHT", image: ugcWhiteGirl,
        tags: ["VHS", "Grain", "Night", "Lo-Fi"],
        includes: ["2 On-Model", "1 Lifestyle"],
        description: "VHS tape aesthetic. Heavy grain, lo-fi color.",
        badge: "NEW",
        energy: "Gritty",
        filters: { environment: "Urban", cameraAngle: "Eye Level", lighting: "Low Key", mood: "Gritty", gender: "Female", timeOfDay: "Night", style: "UGC" },
      },
    ],
  },
  {
    icon: "🧼",
    title: "CLEAN COMMERCE",
    slug: "ecom",
    volume: "VOL 05",
    releaseDate: "NOV 2025",
    description: "Studio Clean / Detail Macro / Shopify-Ready",
    builtFor: "Product Photography + E-Commerce",
    templates: [
      {
        id: "T-017", name: "STUDIO FRONT", image: ugcStudio,
        tags: ["Front View", "Clean", "Studio", "Ecom"],
        includes: ["1 Product", "1 Front Shot"],
        description: "Straight-on studio shot. Ready for your store.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-018", name: "BACK + DETAIL CLOSEUP", image: garageEdit,
        tags: ["Back View", "Detail", "Macro", "Clean"],
        includes: ["1 Product", "1 Back Shot", "1 Detail"],
        description: "Back view with stitching details. Shopify-ready.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Eye Level", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-019", name: "SLEEVE FOCUS", image: ugcWhiteGirl,
        tags: ["Sleeve", "Detail", "Macro", "Branding"],
        includes: ["1 Detail", "1 Closeup"],
        description: "Arm detail. Brand tag and embroidery focus.",
        energy: "Clean",
        filters: { environment: "Studio", cameraAngle: "Close Up", lighting: "Soft Light", mood: "Clean", gender: "Female", timeOfDay: "Day", style: "UGC" },
      },
      {
        id: "T-020", name: "TEXTURE MACRO", image: ravenOriginal,
        tags: ["Macro", "Texture", "Fabric", "Premium"],
        includes: ["1 Detail", "1 Texture Shot"],
        description: "Extreme close fabric. Show the quality.",
        badge: "LIMITED",
        energy: "Cinematic",
        filters: { environment: "Studio", cameraAngle: "Close Up", lighting: "Soft Light", mood: "Clean", gender: "Unisex", timeOfDay: "Day", style: "Editorial" },
      },
    ],
  },
];

export const filterOptions: FilterOption[] = [
  { key: "environment", label: "Environment", icon: "🏙", options: ["Urban", "Studio", "Indoor", "Rooftop", "Industrial"] },
  { key: "cameraAngle", label: "Angle", icon: "📐", options: ["Eye Level", "Low Angle", "Wide", "Close Up"] },
  { key: "lighting", label: "Lighting", icon: "💡", options: ["Flash", "Natural", "Softbox", "Soft Light", "Neon", "Golden Hour", "Backlit", "Low Key"] },
  { key: "mood", label: "Mood", icon: "🎭", options: ["Gritty", "Clean", "Dark", "Bold", "Warm"] },
  { key: "gender", label: "Gender", icon: "👤", options: ["Male", "Female", "Unisex"] },
  { key: "timeOfDay", label: "Time", icon: "🌗", options: ["Day", "Night"] },
  { key: "style", label: "Style", icon: "🎨", options: ["Editorial", "UGC"] },
];
