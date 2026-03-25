type InputNodeLike = {
  id: string;
  name: string;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

type SlotDefinition = {
  key: string;
  label: string;
  matchNames?: string[];
};

type TemplateInputPlan = {
  slots: Array<{
    id: string;
    name: string;
    expected: string;
    nodeIds: string[];
  }>;
  implicitReferenceNodeIds: string[];
  slotByNodeId: Record<string, { id: string; name: string; expected: string }>;
};

const SLOT_CONFIG: Record<string, SlotDefinition[]> = {
  "AMAZON GUY": [
    { key: "logo", label: "Logo" },
    { key: "garment", label: "Garment" },
  ],
  "ARMORED TRUCK": [
    { key: "logo", label: "Logo" },
    { key: "garment", label: "Garment" },
  ],
  "BLUE LAB": [
    { key: "logo", label: "Logo", matchNames: ["Logo"] },
    { key: "top-garment", label: "Top Garment", matchNames: ["HOODIE/ T-SHIRT"] },
    { key: "bottom-garment", label: "Bottom Garment", matchNames: ["BOTTOMS"] },
  ],
  "DOCTOR": [
    { key: "top-garment", label: "Top Garment", matchNames: ["CLOTHING ITEM"] },
  ],
  "GARAGE": [
    { key: "garment", label: "Garment" },
    { key: "logo", label: "Logo" },
  ],
  "GAS STATION": [
    { key: "garment-1", label: "Garment 1" },
    { key: "garment-2", label: "Garment 2" },
    { key: "logo", label: "Logo" },
  ],
  "ICE PICK": [
    { key: "top-garment", label: "Top Garment" },
    { key: "bottom-garment", label: "Bottom Garment" },
  ],
  "JEANS": [
    { key: "bottom-garment", label: "Bottom Garment" },
  ],
  "PAPARAZZI": [
    { key: "garment", label: "Garment" },
  ],
  "RAVEN": [
    { key: "garment", label: "Garment" },
  ],
  "SKATEPARK": [
    { key: "top-garment", label: "Top Garment" },
    { key: "bottom-garment", label: "Bottom Garment" },
    { key: "accessory", label: "Accessory" },
  ],
  "UGC MIRROR": [
    { key: "garments-front", label: "Garments Front", matchNames: ["FRONT SET"] },
    { key: "garments-back", label: "Garments Back", matchNames: ["BACK SET"] },
  ],
  "UNBOXING": [
    { key: "logo", label: "Logo" },
    { key: "top-garment", label: "Top Garment" },
    { key: "bottom-garment", label: "Bottom Garment" },
  ],
};

function normalizeName(value: string) {
  return value.trim().toLowerCase();
}

function sortInputNodes(a: InputNodeLike, b: InputNodeLike) {
  const aOrder = Number(a.prompt_config?.sort_order ?? 999);
  const bOrder = Number(b.prompt_config?.sort_order ?? 999);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

export function buildTemplateInputPlan(templateName: string, nodes: InputNodeLike[]): TemplateInputPlan {
  const visibleNodes = nodes
    .filter((node) => !node.default_asset_id)
    .sort(sortInputNodes);

  const definitions = SLOT_CONFIG[templateName] ?? [];
  const unmatched = [...visibleNodes];

  const slots = definitions
    .map((definition) => {
      let selected: InputNodeLike | undefined;

      if (definition.matchNames?.length) {
        const wanted = definition.matchNames.map(normalizeName);
        selected = unmatched.find((node) => wanted.includes(normalizeName(node.name)));
      }

      if (!selected) {
        selected = unmatched[0];
      }

      if (!selected) return null;

      const index = unmatched.findIndex((node) => node.id === selected?.id);
      if (index >= 0) unmatched.splice(index, 1);

      return {
        id: definition.key,
        name: definition.label,
        expected: String(selected.prompt_config?.expected ?? "image"),
        nodeIds: [selected.id],
      };
    })
    .filter(Boolean) as TemplateInputPlan["slots"];

  const slotByNodeId = Object.fromEntries(
    slots.flatMap((slot) =>
      slot.nodeIds.map((nodeId) => [
        nodeId,
        {
          id: slot.id,
          name: slot.name,
          expected: slot.expected,
        },
      ]),
    ),
  );

  const implicitReferenceNodeIds = unmatched
    .filter((node) => !!node.prompt_config?.sample_url)
    .map((node) => node.id);

  return {
    slots,
    implicitReferenceNodeIds,
    slotByNodeId,
  };
}
