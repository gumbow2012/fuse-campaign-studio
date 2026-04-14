/**
 * Static fallback for template input fields.
 * Used when the worker /api/templates/:name endpoint is unreachable or returns 404.
 * Keys are normalised: lowercase, parens stripped, spaces → underscores.
 */

export interface InputField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  hint?: string;
}

const MAP: Record<string, InputField[]> = {
  armored_truck: [
    { key: "front-garment", label: "Front of Garment", type: "image", required: true },
    { key: "back-garment", label: "Back of Garment", type: "image", required: false },
    { key: "logo", label: "Logo", type: "image", required: true },
  ],
  blue_lab: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  copy_of_unboxing: [
    { key: "product_image", label: "Product", type: "image", required: true },
    { key: "second_item", label: "Second Item", type: "image", required: false },
  ],
  delivery_amazon_guy: [
    { key: "front_outfit", label: "Front Outfit", type: "image", required: true },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  doctor: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  garage_guy: [
    { key: "front_top_bottoms", label: "Front Top + Bottoms", type: "image", required: true },
    { key: "logo", label: "Logo", type: "image", required: false },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  gas_station_w_snow: [
    { key: "front_top_bottoms", label: "Front Top + Bottoms", type: "image", required: true },
    { key: "back_top_bottoms", label: "Back Top + Bottoms", type: "image", required: false },
    { key: "logo", label: "Logo", type: "image", required: false },
  ],
  ice_2: [
    { key: "hoodie", label: "Hoodie", type: "image", required: true },
    { key: "bottoms", label: "Bottoms", type: "image", required: true },
  ],
  ice_original: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  jeans: [
    { key: "product_image", label: "Jeans (Front)", type: "image", required: true },
    { key: "product_back", label: "Jeans (Back)", type: "image", required: false },
  ],
  pack_theif_pants: [
    { key: "product_image", label: "Pants (Front)", type: "image", required: true },
    { key: "product_back", label: "Pants (Back)", type: "image", required: false },
  ],
  paparazzi_original: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  paparazzi: [
    { key: "front_outfit", label: "Front Outfit", type: "image", required: true },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  raven_original: [
    { key: "product_image", label: "Product Image", type: "image", required: true },
  ],
  raven: [
    { key: "front_outfit", label: "Front Outfit", type: "image", required: true },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  skate_park: [
    { key: "t_shirt", label: "T-Shirt", type: "image", required: true },
    { key: "shorts", label: "Shorts", type: "image", required: true },
    { key: "sun_glasses", label: "Sun Glasses", type: "image", required: false },
  ],
  ugc_mirror: [
    { key: "front_outfit", label: "Front Outfit", type: "image", required: true },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  ugc_studio: [
    { key: "front_outfit", label: "Front Outfit", type: "image", required: true },
    { key: "back_outfit", label: "Back Outfit", type: "image", required: false },
  ],
  unboxing: [
    { key: "product_image", label: "Product", type: "image", required: true },
    { key: "second_item", label: "Second Item", type: "image", required: false },
  ],
};

function normalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[()]/g, "")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

/** Look up static input fields for a template by name. Returns null if not found. */
export function getStaticInputs(templateName: string): InputField[] | null {
  if (!templateName) return null;
  const n = normalise(templateName);
  // Exact match
  if (MAP[n]) return MAP[n];
  // Prefix match: e.g. "garage" matches "garage_guy", or "ice_2.0" matches "ice_2"
  const key = Object.keys(MAP).find(
    (k) => k.startsWith(n + "_") || n.startsWith(k + "_") || k === n,
  );
  return key ? MAP[key] : null;
}
