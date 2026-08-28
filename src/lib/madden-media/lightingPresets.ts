import type { MaddenPreset } from "@/lib/madden-media/presetTypes";

/** Curated lighting presets. Code-owned, not DB rows. */
export const MADDEN_LIGHTING_PRESETS: MaddenPreset[] = [
  {
    id: "soft-key",
    name: "Soft key",
    description: "Large diffused key, gentle shadow falloff.",
    promptFragment:
      "large soft key light from camera left, wrapping diffusion, gentle shadow transitions, clean skin rendering",
    tags: ["soft", "flattering", "studio"],
  },
  {
    id: "hard-flash",
    name: "Hard direct flash",
    description: "On-camera flash, crunchy paparazzi energy.",
    promptFragment:
      "hard direct on-camera flash, sharp specular highlights, deep hard-edged shadow behind the subject, slight overexposure",
    tags: ["flash", "paparazzi", "harsh"],
  },
  {
    id: "golden-hour",
    name: "Golden hour",
    description: "Low warm sun raking across the frame.",
    promptFragment:
      "low golden-hour sunlight raking across the frame, warm amber tone, long shadows, soft atmospheric haze",
    tags: ["natural", "warm", "sunset"],
  },
  {
    id: "neon-night",
    name: "Neon night",
    description: "Saturated street signage as practical sources.",
    promptFragment:
      "night lighting driven by saturated neon practicals, magenta and cyan color separation, wet reflective highlights",
    tags: ["night", "neon", "urban"],
  },
  {
    id: "studio-softbox",
    name: "Studio softbox",
    description: "Clean commercial two-light setup.",
    promptFragment:
      "controlled studio softbox setup with key and fill, even exposure, neutral white balance, catchlights in the eyes",
    tags: ["studio", "clean", "commercial"],
  },
  {
    id: "rim-light",
    name: "Rim light",
    description: "Backlight carving the silhouette edge.",
    promptFragment:
      "strong rim light from behind the subject, bright edge separation along shoulders and hair, dim ambient front fill",
    tags: ["rim", "backlight", "separation"],
  },
  {
    id: "chiaroscuro",
    name: "Chiaroscuro",
    description: "Single hard source, mostly darkness.",
    promptFragment:
      "chiaroscuro lighting, one hard source, most of the frame in deep shadow, dramatic sculpted highlights",
    tags: ["dramatic", "dark", "contrast"],
  },
  {
    id: "overcast-flat",
    name: "Overcast flat",
    description: "Grey-sky softness, no visible shadow.",
    promptFragment:
      "overcast diffuse daylight, flat shadowless illumination, cool neutral grey tone, true material color",
    tags: ["natural", "flat", "cool"],
  },
  {
    id: "top-down-hard",
    name: "Overhead hard",
    description: "Source directly above, sunken eyes.",
    promptFragment:
      "hard overhead light directly above the subject, short downward shadows, sculpted cheekbones",
    tags: ["overhead", "hard", "moody"],
  },
  {
    id: "mixed-practicals",
    name: "Mixed practicals",
    description: "Uncorrected room lamps and screens.",
    promptFragment:
      "mixed uncorrected practical sources, tungsten and screen light coexisting, natural color temperature clash",
    tags: ["interior", "practical", "candid"],
  },
  {
    id: "window-daylight",
    name: "Window daylight",
    description: "Single large window as the only source.",
    promptFragment:
      "single large window as the only source, directional daylight falling across the subject, soft shadow gradient into the room",
    tags: ["natural", "interior", "soft"],
  },
  {
    id: "streetlamp-sodium",
    name: "Sodium streetlamp",
    description: "Orange overhead pools on wet asphalt.",
    promptFragment:
      "sodium-vapour streetlamp lighting, orange pooled overhead spill, deep unlit surroundings",
    tags: ["night", "street", "warm"],
  },
  {
    id: "underlit-uplight",
    name: "Uplight",
    description: "Source below the face, unsettling glow.",
    promptFragment:
      "light source below the subject's face, upward shadows, unsettling stage-like glow",
    tags: ["stylized", "low", "stage"],
  },
  {
    id: "high-key-white",
    name: "High key white",
    description: "Blown-out bright, near-zero shadow.",
    promptFragment:
      "high-key lighting on white, near-shadowless bright exposure, airy clean feel, crisp garment edges",
    tags: ["bright", "clean", "editorial"],
  },
  {
    id: "spot-jewelry-sparkle",
    name: "Sparkle spot",
    description: "Tight hard source that fires stone brilliance.",
    promptFragment:
      "small tight hard light aimed to fire maximum stone brilliance and metal specular, dark surrounding falloff",
    tags: ["jewelry", "sparkle", "specular"],
  },
];
