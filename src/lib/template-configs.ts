export interface TemplateInput {
  key: string;
  label: string;
  type: "image";
  required: boolean;
}

export interface TemplateConfig {
  id: string;
  templateId: string;
  name: string;
  previewImage: string;
  credits: number;
  estimatedOutputs: string;
  includes: string[];
  inputs: TemplateInput[];
}

export const templateConfigs: TemplateConfig[] = [
  {
    id: "garage",
    templateId: "7a924959-e168-4a0e-bb25-8db08d8ca4be",
    name: "GARAGE",
    previewImage: "/placeholder.svg",
    credits: 15,
    estimatedOutputs: "6–12 Assets",
    includes: ["On-model", "Closeup", "Editorial"],
    inputs: [
      { key: "garment_file", label: "GARMENT FILE", type: "image", required: true },
      { key: "brand_asset", label: "BRAND ASSET", type: "image", required: true },
    ],
  },
  {
    id: "front-back",
    templateId: "front-back-placeholder",
    name: "FRONT + BACK",
    previewImage: "/placeholder.svg",
    credits: 18,
    estimatedOutputs: "8–16 Assets",
    includes: ["Front view", "Back view", "Flat lay"],
    inputs: [
      { key: "front_shirt", label: "FRONT OF SHIRT", type: "image", required: true },
      { key: "back_shirt", label: "BACK OF SHIRT", type: "image", required: true },
    ],
  },
  {
    id: "front-only",
    templateId: "front-only-placeholder",
    name: "FRONT ONLY",
    previewImage: "/placeholder.svg",
    credits: 12,
    estimatedOutputs: "4–8 Assets",
    includes: ["On-model", "Closeup"],
    inputs: [
      { key: "front_shirt", label: "FRONT OF SHIRT", type: "image", required: true },
    ],
  },
  {
    id: "front-back-logo",
    templateId: "front-back-logo-placeholder",
    name: "FRONT + BACK + LOGO",
    previewImage: "/placeholder.svg",
    credits: 20,
    estimatedOutputs: "10–18 Assets",
    includes: ["On-model", "Closeup", "Editorial", "Logo placement"],
    inputs: [
      { key: "front_shirt", label: "FRONT OF SHIRT", type: "image", required: true },
      { key: "back_shirt", label: "BACK OF SHIRT", type: "image", required: true },
      { key: "logo", label: "LOGO", type: "image", required: true },
    ],
  },
];

export const getTemplateById = (id: string): TemplateConfig | undefined =>
  templateConfigs.find((t) => t.id === id);

export const getTemplateByTemplateId = (templateId: string): TemplateConfig | undefined =>
  templateConfigs.find((t) => t.templateId === templateId);
