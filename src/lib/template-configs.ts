export interface TemplateInputField {
  key: string;
  label: string;
  type: "image";
  required: boolean;
}

export interface TemplateConfig {
  slug: string;
  name: string;
  weavyFlowId: string;
  estimatedCredits: number;
  inputs: TemplateInputField[];
}

export const templateConfigs: Record<string, TemplateConfig> = {
  "urban-graffiti-style": {
    slug: "urban-graffiti-style",
    name: "Urban Graffiti Style",
    weavyFlowId: "VFCSb8jQZrVYqhqkwQSc5g",
    estimatedCredits: 250,
    inputs: [
      { key: "shirt_image", label: "Shirt Image", type: "image", required: true },
      { key: "shorts_image", label: "Shorts Image", type: "image", required: true },
      { key: "logo_overlay", label: "Logo Overlay", type: "image", required: false },
      { key: "background_reference", label: "Background Reference", type: "image", required: false },
    ],
  },
};

export const getTemplateBySlug = (slug: string): TemplateConfig | undefined =>
  templateConfigs[slug];
