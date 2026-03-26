export type InputNodeLike = {
  id: string;
  name: string;
  prompt_config?: Record<string, unknown> | null;
  default_asset_id?: string | null;
};

type SlotSeed = {
  key: string;
  label: string;
  matchNames?: string[];
};

export type EditorMode = "upload" | "reference";

type EditorSeedPatch = {
  nodeId: string;
  promptConfigPatch: Record<string, unknown>;
};

const SLOT_SEEDS: Record<string, SlotSeed[]> = {
  "AMAZON GUY": [
    { key: "logo", label: "Logo", matchNames: ["Input 1"] },
    { key: "garment", label: "Garment", matchNames: ["Input 2"] },
  ],
  "ARMORED TRUCK": [
    { key: "logo", label: "Logo", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
    { key: "garment", label: "Garment", matchNames: ["Input 1"] },
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
    { key: "garment", label: "Garment", matchNames: ["Input 1"] },
    { key: "logo", label: "Logo", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
  ],
  "GAS STATION": [
    { key: "garment-1", label: "Garment 1", matchNames: ["Input 1"] },
    { key: "garment-2", label: "Garment 2", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
    { key: "logo", label: "Logo", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
  ],
  "ICE PICK": [
    { key: "top-garment", label: "Top Garment", matchNames: ["Input 1"] },
    { key: "bottom-garment", label: "Bottom Garment", matchNames: ["Input 2"] },
  ],
  "JEANS": [
    { key: "bottom-garment", label: "Bottom Garment", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
  ],
  "PAPARAZZI": [
    { key: "garment", label: "Garment", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
  ],
  "RAVEN": [
    { key: "garment", label: "Garment", matchNames: ["Input 1"] },
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
    { key: "logo", label: "Logo", matchNames: ["Input: Gemini 3 (Nano Banana Pro)"] },
    { key: "top-garment", label: "Top Garment", matchNames: ["Input 3"] },
    { key: "bottom-garment", label: "Bottom Garment", matchNames: ["Input 2"] },
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

function getText(record: Record<string, unknown> | null | undefined, key: string) {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getEditorMode(node: InputNodeLike): EditorMode | null {
  const configured = getText(node.prompt_config ?? {}, "editor_mode");
  if (configured === "upload" || configured === "reference") return configured;
  return null;
}

export function getNodeEditorConfig(node: InputNodeLike) {
  const promptConfig = node.prompt_config ?? {};
  return {
    mode: getEditorMode(node),
    slotKey: getText(promptConfig, "editor_slot_key"),
    label: getText(promptConfig, "editor_label"),
    expected: getText(promptConfig, "editor_expected") ?? getText(promptConfig, "expected"),
    rawExpected: getText(promptConfig, "expected"),
    sampleUrl: getText(promptConfig, "sample_url"),
  };
}

export function buildTemplateEditorSeed(templateName: string, nodes: InputNodeLike[]): EditorSeedPatch[] {
  const visibleNodes = nodes
    .filter((node) => !node.default_asset_id)
    .sort(sortInputNodes);

  const definitions = SLOT_SEEDS[templateName] ?? [];
  const unmatched = [...visibleNodes];
  const assignedByNodeId = new Map<string, { key: string; label: string }>();

  for (const definition of definitions) {
    let selected: InputNodeLike | undefined;

    if (definition.matchNames?.length) {
      const wanted = definition.matchNames.map(normalizeName);
      selected = unmatched.find((node) => wanted.includes(normalizeName(node.name)));
    }

    if (!selected) {
      selected = unmatched[0];
    }

    if (!selected) continue;

    assignedByNodeId.set(selected.id, {
      key: definition.key,
      label: definition.label,
    });

    const index = unmatched.findIndex((node) => node.id === selected?.id);
    if (index >= 0) unmatched.splice(index, 1);
  }

  return nodes.map((node) => {
    const promptConfig = node.prompt_config ?? {};
    const expected = getText(promptConfig, "editor_expected") ?? getText(promptConfig, "expected") ?? "image";
    const assignment = assignedByNodeId.get(node.id);

    if (assignment) {
      return {
        nodeId: node.id,
        promptConfigPatch: {
          editor_mode: "upload",
          editor_slot_key: assignment.key,
          editor_label: assignment.label,
          editor_expected: expected,
        },
      };
    }

    if (node.default_asset_id || getText(promptConfig, "sample_url")) {
      return {
        nodeId: node.id,
        promptConfigPatch: {
          editor_mode: "reference",
          editor_slot_key: null,
          editor_label: getText(promptConfig, "editor_label") ?? node.name,
          editor_expected: expected,
        },
      };
    }

    return {
      nodeId: node.id,
      promptConfigPatch: {
        editor_mode: "upload",
        editor_slot_key: getText(promptConfig, "editor_slot_key") ?? node.id,
        editor_label: getText(promptConfig, "editor_label") ?? node.name,
        editor_expected: expected,
      },
    };
  });
}

