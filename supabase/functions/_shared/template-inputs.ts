import { buildTemplateEditorSeed, getNodeEditorConfig, type InputNodeLike } from "./template-editor.ts";

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

function sortInputNodes(a: InputNodeLike, b: InputNodeLike) {
  const aOrder = Number(a.prompt_config?.sort_order ?? 999);
  const bOrder = Number(b.prompt_config?.sort_order ?? 999);
  if (aOrder !== bOrder) return aOrder - bOrder;
  return String(a.name ?? "").localeCompare(String(b.name ?? ""));
}

function buildPlanFromEditorMetadata(nodes: InputNodeLike[]): TemplateInputPlan | null {
  const uploadNodes = nodes
    .filter((node) => getNodeEditorConfig(node).mode === "upload")
    .sort(sortInputNodes);

  const referenceNodes = nodes
    .filter((node) => getNodeEditorConfig(node).mode === "reference");

  if (!uploadNodes.length && !referenceNodes.length) {
    return null;
  }

  const slotMap = new Map<string, { id: string; name: string; expected: string; nodeIds: string[]; sortOrder: number }>();

  for (const node of uploadNodes) {
    const config = getNodeEditorConfig(node);
    const slotId = config.slotKey ?? node.id;
    const existing = slotMap.get(slotId);
    const label = config.label ?? node.name;
    const expected = config.expected ?? "image";
    const sortOrder = Number(node.prompt_config?.sort_order ?? 999);

    if (existing) {
      existing.nodeIds.push(node.id);
      existing.sortOrder = Math.min(existing.sortOrder, sortOrder);
      continue;
    }

    slotMap.set(slotId, {
      id: slotId,
      name: label,
      expected,
      nodeIds: [node.id],
      sortOrder,
    });
  }

  const slots = [...slotMap.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map(({ sortOrder: _sortOrder, ...slot }) => slot);

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

  return {
    slots,
    implicitReferenceNodeIds: referenceNodes.map((node) => node.id),
    slotByNodeId,
  };
}

export function buildTemplateInputPlan(templateName: string, nodes: InputNodeLike[]): TemplateInputPlan {
  const metadataPlan = buildPlanFromEditorMetadata(nodes);
  if (metadataPlan) return metadataPlan;

  const seededNodes = nodes.map((node) => ({ ...node }));
  const seedPatches = buildTemplateEditorSeed(templateName, seededNodes);
  const seedMap = new Map(seedPatches.map((patch) => [patch.nodeId, patch.promptConfigPatch]));
  const nodesWithSeed = seededNodes.map((node) => ({
    ...node,
    prompt_config: {
      ...(node.prompt_config ?? {}),
      ...(seedMap.get(node.id) ?? {}),
    },
  }));

  return buildPlanFromEditorMetadata(nodesWithSeed) ?? {
    slots: [],
    implicitReferenceNodeIds: [],
    slotByNodeId: {},
  };
}
