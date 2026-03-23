import fs from "node:fs";
import path from "node:path";
import cp from "node:child_process";
import crypto from "node:crypto";

const TEMPLATE_DIR = "/Users/utaupeia/Downloads/Weavy Templates";

const FILE_TO_TEMPLATE = {
  "ArmoredTruck.txt": "ARMORED TRUCK",
  "BlueLab.txt": "BLUE LAB",
  "DeliveryGuy.txt": "AMAZON GUY",
  "Doctor.txt": "DOCTOR",
  "Garage.txt": "GARAGE",
  "GasStation.rtf": "GAS STATION",
  "Ice.txt": "ICE PICK",
  "Jeans.txt": "JEANS",
  "Paparazzi.txt": "PAPARAZZI",
  "Raven.txt": "RAVEN",
  "SkatePark.txt": "SKATEPARK",
  "UGCMirror.txt": "UGC MIRROR",
  "Unboxing.txt": "UNBOXING",
};

function uuidFromSeed(seed) {
  const hash = crypto.createHash("sha1").update(seed).digest("hex");
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    "5" + hash.slice(13, 16),
    "a" + hash.slice(17, 20),
    hash.slice(20, 32),
  ].join("-");
}

function readRecipe(filePath) {
  const raw = filePath.endsWith(".rtf")
    ? cp.execFileSync("textutil", ["-convert", "txt", "-stdout", filePath], {
        encoding: "utf8",
        maxBuffer: 32 * 1024 * 1024,
      })
    : fs.readFileSync(filePath, "utf8");

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) {
    throw new Error(`Could not locate JSON payload in ${filePath}`);
  }

  return JSON.parse(raw.slice(start, end + 1));
}

function getNodeName(node) {
  return (
    node?.data?.name ??
    node?.name ??
    node?.data?.label ??
    node?.data?.menu?.displayName ??
    node?.id ??
    "Untitled"
  );
}

function isGenericImportName(name) {
  const normalized = String(name ?? "")
    .trim()
    .toLowerCase();
  return !normalized || ["file", "import", "reference", "user inputs"].includes(normalized);
}

function cleanTargetName(name) {
  return String(name ?? "Input")
    .replace(/^Edit:\s*/i, "")
    .replace(/^Video:\s*/i, "")
    .replace(/^Static:\s*/i, "")
    .trim();
}

function getImportUrl(node) {
  return (
    node?.data?.output?.file?.url ??
    node?.data?.files?.[0]?.url ??
    node?.data?.result?.url ??
    node?.data?.inputNode?.file?.url ??
    null
  );
}

function getPromptText(node) {
  return (
    node?.data?.prompt ??
    node?.data?.result?.prompt ??
    node?.data?.output?.prompt ??
    node?.data?.input?.prompt ??
    node?.data?.params?.prompt ??
    null
  );
}

function getKindParameter(node, id) {
  const groups = node?.data?.kind?.parameters;
  if (!Array.isArray(groups)) return null;

  for (const group of groups) {
    if (!Array.isArray(group) || group.length < 2) continue;
    const [schema, valueWrapper] = group;
    if (schema?.id !== id) continue;
    return valueWrapper?.data?.value ?? null;
  }

  return null;
}

function getConnectedPrompt(edgeMap, nodeMap, modelNodeId) {
  const incoming = edgeMap.get(modelNodeId) ?? [];
  for (const edge of incoming) {
    const source = nodeMap.get(edge.source);
    if (!source || source.type !== "promptV3") continue;
    const prompt = getPromptText(source);
    if (prompt) return prompt;
  }
  return null;
}

function getModelName(node) {
  return (
    node?.data?.model?.name ??
    node?.data?.kind?.model?.name ??
    node?.data?.kind?.model?.version ??
    node?.data?.model?.version ??
    getNodeName(node)
  );
}

function getModelOutputType(node) {
  const outputs = node?.data?.kind?.outputs ?? [];
  const dataTypes = outputs.map((output) => output?.dataType).filter(Boolean);
  const modelName = getModelName(node);

  if (dataTypes.includes("video")) return "video_gen";
  if (dataTypes.includes("image")) return "image_gen";
  if (/video|wan|veo|kling|luma/i.test(modelName)) return "video_gen";
  return "image_gen";
}

function getModelPromptConfig(node, prompt) {
  const nodeType = getModelOutputType(node);
  const config = {
    model: getModelName(node),
    prompt:
      prompt ??
      node?.data?.input?.prompt ??
      node?.data?.params?.prompt ??
      "",
  };

  if (nodeType === "video_gen") {
    const duration =
      Number(node?.data?.input?.duration ?? node?.data?.params?.duration ?? getKindParameter(node, "duration") ?? 10);
    const aspectRatio =
      String(
        node?.data?.input?.ratio ??
          node?.data?.input?.aspect_ratio ??
          node?.data?.params?.aspect_ratio ??
          getKindParameter(node, "aspect_ratio") ??
          "9:16",
      );

    config.duration = Number.isFinite(duration) ? duration : 10;
    config.aspect_ratio = aspectRatio;
  } else {
    const aspectRatio =
      node?.data?.input?.aspect_ratio ??
      node?.data?.params?.aspect_ratio ??
      getKindParameter(node, "aspect_ratio");
    const resolution =
      node?.data?.input?.resolution ??
      node?.data?.params?.resolution ??
      getKindParameter(node, "resolution");

    if (aspectRatio) config.aspect_ratio = String(aspectRatio);
    if (resolution) config.resolution = String(resolution);
  }

  return config;
}

function targetParamFromEdge(edge, targetNodeType) {
  const handle = edge?.targetHandle ?? "";
  const marker = "-input-";
  const markerIndex = handle.indexOf(marker);
  const rawParam = markerIndex >= 0 ? handle.slice(markerIndex + marker.length) : null;

  if (!rawParam || rawParam === "workflow") return null;
  if (rawParam === "prompt") return "__prompt__";
  if (rawParam === "file") return targetNodeType === "video_gen" ? "init_image" : "image_1";
  if (rawParam === "image") return targetNodeType === "video_gen" ? "init_image" : "image_1";
  if (rawParam === "tail_image_url") return "end_frame_image";

  return rawParam;
}

function normalizeRecipe(fileName, recipe) {
  const templateName = FILE_TO_TEMPLATE[fileName];
  if (!templateName) {
    throw new Error(`No template mapping defined for ${fileName}`);
  }

  const nodes = Array.isArray(recipe.nodes) ? recipe.nodes : [];
  const edges = Array.isArray(recipe.edges) ? recipe.edges : [];
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const incomingEdgeMap = new Map();

  for (const edge of edges) {
    const list = incomingEdgeMap.get(edge.target) ?? [];
    list.push(edge);
    incomingEdgeMap.set(edge.target, list);
  }

  const designMetadata = recipe.designAppMetadata ?? {};

  const normalizedNodes = [];
  const normalizedEdges = [];
  const hiddenAssets = [];
  const inputCounters = { visible: 0, hidden: 0 };

  for (const node of nodes) {
    if (node.type === "import") {
      const visible = designMetadata[node.id]?.exposed === true;
      const url = getImportUrl(node);
      const order = Number(designMetadata[node.id]?.order ?? 999);
      const outgoingEdges = edges.filter((edge) => edge.source === node.id);
      const downstreamNames = outgoingEdges
        .map((edge) => cleanTargetName(getNodeName(nodeMap.get(edge.target))))
        .filter(Boolean);
      const rawName = getNodeName(node);

      let defaultAssetId = null;
      if (!visible && url) {
        defaultAssetId = uuidFromSeed(`${templateName}:${node.id}:${url}`);
        hiddenAssets.push({
          id: defaultAssetId,
          url,
          assetType: "reference_image",
          metadata: {
            source: "weavy",
            templateName,
            weavyNodeId: node.id,
            weavyRecipeId: recipe.id,
          },
        });
      }

      inputCounters[visible ? "visible" : "hidden"] += 1;

      const inferredName = isGenericImportName(rawName)
        ? visible
          ? downstreamNames.length === 1
            ? `Input: ${downstreamNames[0]}`
            : `Input ${inputCounters.visible}`
          : downstreamNames.length === 1
          ? `Reference: ${downstreamNames[0]}`
          : `Reference ${inputCounters.hidden}`
        : rawName;

      normalizedNodes.push({
        id: node.id,
        name: inferredName,
        nodeType: "user_input",
        defaultAssetId,
        promptConfig: {
          expected: "image",
          weavy_exposed: visible,
          sample_url: visible ? url : null,
          sort_order: order,
        },
      });
      continue;
    }

    if (node.type !== "custommodelV2") continue;

    const nodeType = getModelOutputType(node);
    const prompt = getConnectedPrompt(incomingEdgeMap, nodeMap, node.id) ?? getPromptText(node) ?? "";
    normalizedNodes.push({
      id: node.id,
      name: getNodeName(node),
      nodeType,
      defaultAssetId: null,
      promptConfig: getModelPromptConfig(node, prompt),
    });
  }

  const normalizedNodeMap = new Map(normalizedNodes.map((node) => [node.id, node]));

  for (const edge of edges) {
    const sourceNode = normalizedNodeMap.get(edge.source);
    const targetNode = normalizedNodeMap.get(edge.target);
    if (!targetNode) continue;

    const targetParam = targetParamFromEdge(edge, targetNode.nodeType);
    if (targetParam === "__prompt__") continue;
    if (!targetParam) continue;
    if (!sourceNode) continue;

    normalizedEdges.push({
      id: edge.id,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
      mappingLogic: { target_param: targetParam },
    });
  }

  const visibleInputs = normalizedNodes.filter(
    (node) => node.nodeType === "user_input" && node.promptConfig.weavy_exposed === true,
  );
  const hiddenInputs = normalizedNodes.filter(
    (node) => node.nodeType === "user_input" && node.promptConfig.weavy_exposed !== true,
  );
  const imageNodes = normalizedNodes.filter((node) => node.nodeType === "image_gen");
  const videoNodes = normalizedNodes.filter((node) => node.nodeType === "video_gen");

  return {
    fileName,
    templateName,
    recipeId: recipe.id,
    normalizedNodes,
    normalizedEdges,
    hiddenAssets,
    counts: {
      visibleInputs: visibleInputs.length,
      hiddenInputs: hiddenInputs.length,
      imageSteps: imageNodes.length,
      videoSteps: videoNodes.length,
      edges: normalizedEdges.length,
    },
  };
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function sqlJson(value) {
  return `$json$${JSON.stringify(value)}$json$::jsonb`;
}

function emitSqlForTemplate(template) {
  const blockName = template.templateName.toLowerCase().replace(/[^a-z0-9]+/g, "_");
  const assetDeclarations = template.hiddenAssets
    .map(
      (asset, index) =>
        `  asset_${index + 1}_id uuid := ${sqlString(asset.id)}::uuid;`,
    )
    .join("\n");

  const assetStatements = template.hiddenAssets
    .map(
      (asset, index) => `  insert into assets (id, supabase_storage_url, asset_type, metadata)
  values (asset_${index + 1}_id, ${sqlString(asset.url)}, ${sqlString(asset.assetType)}, ${sqlJson(asset.metadata)})
  on conflict (id) do update
    set supabase_storage_url = excluded.supabase_storage_url,
        asset_type = excluded.asset_type,
        metadata = excluded.metadata;`,
    )
    .join("\n");

  const nodeValues = template.normalizedNodes
    .map((node) => {
      const assetRef = node.defaultAssetId
        ? `${sqlString(node.defaultAssetId)}::uuid`
        : "null";
      return `(${sqlString(node.id)}::uuid, new_version_id, ${sqlString(node.nodeType)}, null, ${sqlJson(
        node.promptConfig,
      )}, ${assetRef}, ${sqlString(node.name)})`;
    })
    .join(",\n    ");

  const edgeValues = template.normalizedEdges.length
    ? template.normalizedEdges
        .map(
          (edge) =>
            `(${sqlString(edge.id)}::uuid, new_version_id, ${sqlString(edge.sourceNodeId)}::uuid, ${sqlString(
              edge.targetNodeId,
            )}::uuid, ${sqlJson(edge.mappingLogic)}, null)`,
        )
        .join(",\n    ")
    : null;

  return `do $$
declare
  template_uuid uuid;
  new_version_id uuid := gen_random_uuid();
  next_version integer;
${assetDeclarations ? `${assetDeclarations}\n` : ""}begin
  select id into template_uuid
  from fuse_templates
  where name = ${sqlString(template.templateName)};

  if template_uuid is null then
    raise exception 'Template not found: ${template.templateName}';
  end if;

  select coalesce(max(version_number), 0) + 1
  into next_version
  from template_versions
  where template_id = template_uuid;

  update template_versions
  set is_active = false
  where template_id = template_uuid
    and is_active = true;

${assetStatements ? `${assetStatements}\n` : ""}  insert into template_versions (id, template_id, version_number, is_active)
  values (new_version_id, template_uuid, next_version, true);

  insert into nodes (id, version_id, node_type, model_id, prompt_config, default_asset_id, name)
  values
    ${nodeValues};

${edgeValues ? `  insert into edges (id, version_id, source_node_id, target_node_id, mapping_logic, condition_logic)
  values
    ${edgeValues};` : ""}end $$;`;
}

function audit() {
  const results = [];
  for (const fileName of Object.keys(FILE_TO_TEMPLATE).sort()) {
    const recipe = readRecipe(path.join(TEMPLATE_DIR, fileName));
    results.push(normalizeRecipe(fileName, recipe));
  }
  return results;
}

async function syncTemplates(resultsToSync) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const runnerCode = process.env.RUNNER_CODE;

  if (!supabaseUrl) throw new Error("SUPABASE_URL is required for sync mode");
  if (!anonKey) throw new Error("SUPABASE_ANON_KEY is required for sync mode");
  if (!runnerCode) throw new Error("RUNNER_CODE is required for sync mode");

  const output = [];

  for (const template of resultsToSync) {
    const response = await fetch(`${supabaseUrl}/functions/v1/sync-weavy-template`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        "x-runner-code": runnerCode,
      },
      body: JSON.stringify({
        templateName: template.templateName,
        recipeId: template.recipeId,
        assets: template.hiddenAssets,
        nodes: template.normalizedNodes.map((node) => ({
          key: node.id,
          name: node.name,
          nodeType: node.nodeType,
          defaultAssetId: node.defaultAssetId,
          promptConfig: {
            ...node.promptConfig,
            weavy_node_id: node.id,
            weavy_recipe_id: template.recipeId,
          },
        })),
        edges: template.normalizedEdges.map((edge) => ({
          key: edge.id,
          sourceKey: edge.sourceNodeId,
          targetKey: edge.targetNodeId,
          mappingLogic: edge.mappingLogic,
        })),
      }),
    });

    const body = await response.json().catch(() => ({}));
    output.push({
      templateName: template.templateName,
      ok: response.ok,
      status: response.status,
      body,
    });

    if (!response.ok) {
      throw new Error(`${template.templateName} sync failed: ${body?.error ?? response.statusText}`);
    }
  }

  return output;
}

const mode = process.argv[2] ?? "audit";
const selector = process.argv[3] ?? null;
const results = audit();
const filteredResults = selector
  ? results.filter(
      (result) =>
        result.templateName.toLowerCase() === selector.toLowerCase() ||
        result.fileName.toLowerCase() === selector.toLowerCase(),
    )
  : results;

if (mode === "audit") {
  console.log(
    JSON.stringify(
      filteredResults.map((result) => ({
        fileName: result.fileName,
        templateName: result.templateName,
        recipeId: result.recipeId,
        counts: result.counts,
      })),
      null,
      2,
    ),
  );
} else if (mode === "sql") {
  console.log(filteredResults.map(emitSqlForTemplate).join("\n\n"));
} else if (mode === "payload") {
  console.log(JSON.stringify(filteredResults, null, 2));
} else if (mode === "sync") {
  const output = await syncTemplates(filteredResults);
  console.log(JSON.stringify(output, null, 2));
} else {
  throw new Error(`Unknown mode: ${mode}`);
}
