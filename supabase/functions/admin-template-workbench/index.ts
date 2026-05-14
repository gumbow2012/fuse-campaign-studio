import "jsr:@supabase/functions-js/edge-runtime.d.ts";
/* eslint-disable @typescript-eslint/no-explicit-any */

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  json,
  logAuditEvent,
  requireAdminUser,
} from "../_shared/supabase-admin.ts";
import { uploadTemplateReferenceAsset } from "../_shared/template-assets.ts";

type Action =
  | "catalog"
  | "create_template"
  | "clone_version"
  | "activate_version"
  | "update_template"
  | "add_node"
  | "delete_node"
  | "add_edge"
  | "delete_edge";

type NodeType = "user_input" | "image_gen" | "video_gen";
type StarterPreset = "campaign" | "reference" | "blank";
type ReferenceAssetDraft = {
  label?: string | null;
  prompt?: string | null;
  inputSlotKey?: string | null;
  inputSlotIndex?: number | null;
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  file?: {
    dataUrl?: string | null;
    filename?: string | null;
  } | null;
};
type PublishGateResult = {
  publishable: boolean;
  reasons: string[];
  completedRunCount: number;
  approvedAuditCount: number;
  blockingOutputReportCount: number;
  latestCompletedJobId: string | null;
  latestApprovedJobId: string | null;
  latestApprovedAt: string | null;
};
type InputSlotDraft = {
  key: string;
  label: string;
  expected: string;
  targetParam: string;
};

const MAX_INPUT_SLOTS = 5;
const MAX_OUTPUT_BRANCHES = 8;

const DEFAULT_INPUT_SLOTS: InputSlotDraft[] = [
  { key: "top_garment", label: "Top Garment", expected: "image", targetParam: "top_garment_image" },
  { key: "bottom_garment", label: "Bottom Garment", expected: "image", targetParam: "bottom_garment_image" },
  { key: "logo", label: "Logo", expected: "image", targetParam: "logo_image" },
];

function cleanText(value: unknown, fallback = "") {
  if (typeof value !== "string") return fallback;
  const next = value.trim();
  return next || fallback;
}

function nullableText(value: unknown) {
  if (typeof value !== "string") return null;
  const next = value.trim();
  return next || null;
}

function cleanInteger(value: unknown, fallback: number, min: number, max: number) {
  const next = typeof value === "number" ? value : Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(next)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(next)));
}

function readReferenceDrafts(value: unknown): ReferenceAssetDraft[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const file = record.file && typeof record.file === "object"
      ? record.file as ReferenceAssetDraft["file"]
      : null;
    const rawInputSlotIndex = typeof record.inputSlotIndex === "number" && Number.isFinite(record.inputSlotIndex)
      ? Math.trunc(record.inputSlotIndex)
      : null;
    return {
      label: cleanText(record.label, `Reference ${index + 1}`),
      prompt: nullableText(record.prompt),
      inputSlotKey: nullableText(record.inputSlotKey),
      inputSlotIndex: rawInputSlotIndex !== null && rawInputSlotIndex >= 0 ? rawInputSlotIndex : null,
      imagePrompt: nullableText(record.imagePrompt),
      videoPrompt: nullableText(record.videoPrompt),
      file,
    };
  });
}

function cleanKey(value: unknown, fallback: string) {
  const text = cleanText(value, fallback).toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return text || fallback;
}

function readInputSlots(value: unknown): InputSlotDraft[] {
  if (!Array.isArray(value)) return DEFAULT_INPUT_SLOTS;
  const slots = value.slice(0, MAX_INPUT_SLOTS).map((item, index) => {
    const record = item && typeof item === "object" ? item as Record<string, unknown> : {};
    const fallback = DEFAULT_INPUT_SLOTS[index] ?? DEFAULT_INPUT_SLOTS[0];
    const key = cleanKey(record.key, fallback.key);
    return {
      key,
      label: cleanText(record.label, fallback.label),
      expected: cleanText(record.expected, "image"),
      targetParam: cleanKey(record.targetParam, `${key}_image`),
    };
  });
  return slots.length ? slots : DEFAULT_INPUT_SLOTS;
}

function resolveInputForBranch(args: {
  inputNodes: Array<{ id: string; slot: InputSlotDraft; index: number }>;
  draft: ReferenceAssetDraft;
  branchIndex: number;
}) {
  const { inputNodes, draft, branchIndex } = args;
  const indexedInput = typeof draft.inputSlotIndex === "number" &&
    draft.inputSlotIndex >= 0 &&
    draft.inputSlotIndex < inputNodes.length
    ? inputNodes[draft.inputSlotIndex]
    : null;
  return indexedInput ??
    inputNodes.find((node) => node.slot.key === draft.inputSlotKey) ??
    inputNodes[branchIndex % inputNodes.length] ??
    inputNodes[0];
}

async function nextVersionNumber(admin: ReturnType<typeof createAdminClient>, templateId: string) {
  const { data, error } = await admin
    .from("template_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Number(data?.version_number ?? 0) + 1;
}

async function setActiveVersion(
  admin: ReturnType<typeof createAdminClient>,
  templateId: string,
  versionId: string,
) {
  const gate = await getVersionPublishGate(admin, versionId);
  if (!gate.publishable) {
    throw new Error(`Publish blocked: ${gate.reasons.join(" ")}`);
  }

  const { error: deactivateError } = await admin
    .from("template_versions")
    .update({ is_active: false })
    .eq("template_id", templateId);
  if (deactivateError) throw new Error(deactivateError.message);

  const { error: activateError } = await admin
    .from("template_versions")
    .update({
      is_active: true,
      review_status: "Approved",
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", versionId);
  if (activateError) throw new Error(activateError.message);

  return gate;
}

function resultOutputCount(job: any) {
  return Array.isArray(job?.result_payload?.outputs) ? job.result_payload.outputs.length : 0;
}

function isBlockingOutputReport(row: any) {
  if (row.status === "fixed") return false;
  return row.status === "open" || row.verdict !== "good" || row.severity === "blocking";
}

async function getVersionPublishGate(
  admin: ReturnType<typeof createAdminClient>,
  versionId: string,
): Promise<PublishGateResult> {
  const reasons: string[] = [];

  const { data: version, error: versionError } = await admin
    .from("template_versions")
    .select("id, review_status")
    .eq("id", versionId)
    .maybeSingle();
  if (versionError) throw new Error(versionError.message);
  if (version?.review_status !== "Approved") {
    reasons.push("Approve this version in the output audit before publishing.");
  }

  const { data: completedJobs, error: jobsError } = await admin
    .from("execution_jobs")
    .select("id, status, completed_at, started_at, result_payload")
    .eq("version_id", versionId)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(20);
  if (jobsError) throw new Error(jobsError.message);

  const jobsWithOutputs = (completedJobs ?? []).filter((job: any) => resultOutputCount(job) > 0);
  const latestCompletedJob = jobsWithOutputs[0] ?? null;
  if (!jobsWithOutputs.length) {
    reasons.push("Run this version to completion before publishing.");
  }

  const jobIds = jobsWithOutputs.map((job: any) => job.id);
  const { data: approvedAudits, error: auditsError } = jobIds.length
    ? await admin
        .from("template_run_admin_audits")
        .select("id, job_id, verdict, overall_score, updated_at")
        .in("job_id", jobIds)
        .eq("verdict", "approved")
        .gte("overall_score", 75)
        .order("updated_at", { ascending: false })
    : { data: [], error: null };
  if (auditsError) throw new Error(auditsError.message);

  if (!approvedAudits?.length) {
    reasons.push("Save an approved admin audit with score 75+ before publishing.");
  }

  const approvedJobIds = [...new Set((approvedAudits ?? []).map((audit: any) => audit.job_id).filter(Boolean))];
  const { data: outputReports, error: reportsError } = approvedJobIds.length
    ? await admin
        .from("template_output_reports")
        .select("job_id, verdict, severity, status")
        .in("job_id", approvedJobIds)
    : { data: [], error: null };
  if (reportsError) throw new Error(reportsError.message);

  const reportsByJobId = new Map<string, any[]>();
  for (const report of outputReports ?? []) {
    const rows = reportsByJobId.get(report.job_id) ?? [];
    rows.push(report);
    reportsByJobId.set(report.job_id, rows);
  }

  const selectedApproval = (approvedAudits ?? []).find((audit: any) => {
    const reports = reportsByJobId.get(audit.job_id) ?? [];
    return !reports.some(isBlockingOutputReport);
  }) ?? null;

  const blockingOutputReportCount = selectedApproval
    ? (reportsByJobId.get(selectedApproval.job_id) ?? []).filter(isBlockingOutputReport).length
    : (outputReports ?? []).filter(isBlockingOutputReport).length;

  if ((approvedAudits?.length ?? 0) > 0 && !selectedApproval) {
    reasons.push(`Resolve ${blockingOutputReportCount || "the"} open or bad output report${blockingOutputReportCount === 1 ? "" : "s"} before publishing.`);
  }

  return {
    publishable: reasons.length === 0 && !!selectedApproval,
    reasons,
    completedRunCount: jobsWithOutputs.length,
    approvedAuditCount: approvedAudits?.length ?? 0,
    blockingOutputReportCount,
    latestCompletedJobId: latestCompletedJob?.id ?? null,
    latestApprovedJobId: selectedApproval?.job_id ?? null,
    latestApprovedAt: selectedApproval?.updated_at ?? null,
  };
}

async function markVersionNeedsReview(
  admin: ReturnType<typeof createAdminClient>,
  versionId: string,
) {
  const { error } = await admin
    .from("template_versions")
    .update({
      review_status: "Unreviewed",
      reviewed_at: null,
      reviewed_by: null,
    })
    .eq("id", versionId)
    .eq("is_active", false);
  if (error) throw new Error(error.message);
}

async function cloneVersion(args: {
  admin: ReturnType<typeof createAdminClient>;
  sourceVersionId: string;
  targetTemplateId: string;
  makeActive: boolean;
}) {
  const { admin, sourceVersionId, targetTemplateId, makeActive } = args;
  if (makeActive) {
    throw new Error("Cloned versions always start as drafts. Run and approve the clone before publishing.");
  }

  const { data: sourceVersion, error: versionError } = await admin
    .from("template_versions")
    .select("id, template_id")
    .eq("id", sourceVersionId)
    .single();
  if (versionError || !sourceVersion) {
    throw new Error(versionError?.message ?? "Source version not found");
  }

  const { data: nodes, error: nodeError } = await admin
    .from("nodes")
    .select("id, node_type, model_id, prompt_config, default_asset_id, name")
    .eq("version_id", sourceVersionId);
  if (nodeError) throw new Error(nodeError.message);

  const { data: edges, error: edgeError } = await admin
    .from("edges")
    .select("source_node_id, target_node_id, mapping_logic, condition_logic")
    .eq("version_id", sourceVersionId);
  if (edgeError) throw new Error(edgeError.message);

  const versionNumber = await nextVersionNumber(admin, targetTemplateId);
  const versionId = crypto.randomUUID();

  const { error: insertVersionError } = await admin
    .from("template_versions")
    .insert({
      id: versionId,
      template_id: targetTemplateId,
      version_number: versionNumber,
      is_active: false,
      review_status: "Unreviewed",
    });
  if (insertVersionError) throw new Error(insertVersionError.message);

  const idMap = new Map<string, string>();
  const nodeRows = (nodes ?? []).map((node: any) => {
    const id = crypto.randomUUID();
    idMap.set(node.id, id);
    return {
      id,
      version_id: versionId,
      node_type: node.node_type,
      model_id: node.model_id ?? null,
      prompt_config: node.prompt_config ?? {},
      default_asset_id: node.default_asset_id ?? null,
      name: node.name,
    };
  });

  if (nodeRows.length) {
    const { error } = await admin.from("nodes").insert(nodeRows);
    if (error) throw new Error(error.message);
  }

  const edgeRows = (edges ?? []).map((edge: any) => ({
    id: crypto.randomUUID(),
    version_id: versionId,
    source_node_id: idMap.get(edge.source_node_id),
    target_node_id: idMap.get(edge.target_node_id),
    mapping_logic: edge.mapping_logic ?? {},
    condition_logic: edge.condition_logic ?? null,
  })).filter((edge: any) => edge.source_node_id && edge.target_node_id);

  if (edgeRows.length) {
    const { error } = await admin.from("edges").insert(edgeRows);
    if (error) throw new Error(error.message);
  }

  return {
    versionId,
    versionNumber,
    templateId: targetTemplateId,
    counts: {
      nodes: nodeRows.length,
      edges: edgeRows.length,
    },
  };
}

async function starterNodes(args: {
  admin: ReturnType<typeof createAdminClient>;
  templateId: string;
  versionId: string;
  preset?: StarterPreset;
  inputSlots?: InputSlotDraft[];
  outputCount?: number;
  referenceAssets?: ReferenceAssetDraft[];
  imagePrompt?: string | null;
  videoPrompt?: string | null;
  uploadedBy?: string | null;
}) {
  const {
    admin,
    templateId,
    versionId,
    preset = "campaign",
    uploadedBy,
  } = args;
  const inputSlots = args.inputSlots?.length ? args.inputSlots.slice(0, MAX_INPUT_SLOTS) : DEFAULT_INPUT_SLOTS;
  const inputNodes = inputSlots.map((slot, index) => ({
    id: crypto.randomUUID(),
    slot,
    index,
  }));
  const outputCount = Math.max(1, Math.min(MAX_OUTPUT_BRANCHES, args.outputCount ?? (inputNodes.length || 1)));
  const fallbackImagePrompt = cleanText(
    args.imagePrompt,
    "Create a polished fashion campaign image using the uploaded input and hidden brand reference for scene direction.",
  );
  const fallbackVideoPrompt = cleanText(
    args.videoPrompt,
    "Animate the campaign image into a short fashion ad with natural motion and premium brand pacing.",
  );
  const referenceAssets = args.referenceAssets ?? [];
  const referenceDraftsWithFiles = referenceAssets
    .map((draft, branchIndex) => ({ draft, branchIndex }))
    .filter(({ draft }) => !!draft.file?.dataUrl);
  const references = await Promise.all(
    referenceDraftsWithFiles.map(async ({ draft, branchIndex }, index) => {
      const nodeId = crypto.randomUUID();
      const label = cleanText(draft.label, referenceDraftsWithFiles.length === 1 ? "Reference Image" : `Reference ${index + 1}`);
      const asset = await uploadTemplateReferenceAsset({
        admin,
        file: draft.file!,
        templateId,
        versionId,
        nodeId,
        label,
        uploadedBy,
        source: "template-onboarding",
      });

      return {
        nodeId,
        branchIndex,
        label,
        prompt: nullableText(draft.prompt),
        asset,
      };
    }),
  );

  const outputGroups = Array.from({ length: outputCount }).map((_, index) => {
    const draft = referenceAssets[index] ?? {};
    const input = resolveInputForBranch({ inputNodes, draft, branchIndex: index });
    const reference = references.find((item) => item.branchIndex === index) ?? null;
    return {
      imageId: crypto.randomUUID(),
      videoId: crypto.randomUUID(),
      reference,
      guidePrompt: nullableText(draft.prompt),
      input,
      imagePrompt: cleanText(draft.imagePrompt, fallbackImagePrompt),
      videoPrompt: cleanText(draft.videoPrompt, fallbackVideoPrompt),
      index,
    };
  });

  return {
    nodes: [
      ...inputNodes.map((input) => ({
        id: input.id,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "upload",
          editor_slot_key: input.slot.key,
          editor_label: input.slot.label,
          editor_expected: input.slot.expected,
          sort_order: input.index + 1,
        },
        default_asset_id: null,
        name: input.slot.label,
      })),
      ...references.map((reference, index) => ({
        id: reference.nodeId,
        version_id: versionId,
        node_type: "user_input",
        model_id: null,
        prompt_config: {
          editor_mode: "reference",
          editor_slot_key: `reference-${index + 1}`,
          editor_label: reference.label,
          editor_expected: "image",
          weavy_exposed: false,
          sort_order: inputNodes.length + index + 1,
        },
        default_asset_id: reference.asset?.id ?? null,
        name: reference.label,
      })),
      ...outputGroups.flatMap((group) => {
        const numberSuffix = outputCount > 1 ? ` ${group.index + 1}` : "";
        const imagePromptWithReference = group.guidePrompt
          ? `${group.imagePrompt}\n\nHidden guide prompt: ${group.guidePrompt}`
          : group.imagePrompt;
        return [{
        id: group.imageId,
        version_id: versionId,
        node_type: "image_gen",
        model_id: null,
        prompt_config: {
          prompt: imagePromptWithReference,
          output_exposed: true,
        },
        default_asset_id: null,
        name: `${group.input.slot.label} Image Output${numberSuffix}`,
      },
      {
        id: group.videoId,
        version_id: versionId,
        node_type: "video_gen",
        model_id: null,
        prompt_config: {
          prompt: group.videoPrompt,
          output_exposed: true,
        },
        default_asset_id: null,
        name: `${group.input.slot.label} Video Output${numberSuffix}`,
      }];
      }),
    ],
    edges: [
      ...outputGroups.flatMap((group) => {
        const edges = [{
          id: crypto.randomUUID(),
          version_id: versionId,
          source_node_id: group.input.id,
          target_node_id: group.imageId,
          mapping_logic: { target_param: group.input.slot.targetParam || "image_1" },
          condition_logic: null,
        }];
        if (group.reference) {
          edges.push({
            id: crypto.randomUUID(),
            version_id: versionId,
            source_node_id: group.reference.nodeId,
            target_node_id: group.imageId,
            mapping_logic: { target_param: "reference_image" },
            condition_logic: null,
          });
        }
        edges.push({
        id: crypto.randomUUID(),
        version_id: versionId,
          source_node_id: group.imageId,
          target_node_id: group.videoId,
        mapping_logic: { target_param: "start_frame_image" },
        condition_logic: null,
        });
        return edges;
      }),
    ],
    referenceAssets: references.map((reference) => ({
      nodeId: reference.nodeId,
      label: reference.label,
      assetId: reference.asset?.id ?? null,
      assetUrl: reference.asset?.supabase_storage_url ?? null,
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const admin = createAdminClient();

  try {
    const user = await requireAdminUser(req, admin);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = cleanText(body.action, "catalog") as Action;

    if (action === "catalog") {
      const { data: templates, error: templateError } = await admin
        .from("fuse_templates")
        .select("id, name, description, created_at, updated_at")
        .order("name", { ascending: true });
      if (templateError) throw new Error(templateError.message);

      const { data: versions, error: versionError } = await admin
        .from("template_versions")
        .select("id, template_id, version_number, is_active, review_status, reviewed_at, created_at")
        .order("version_number", { ascending: false });
      if (versionError) throw new Error(versionError.message);

      const versionIds = (versions ?? []).map((version: any) => version.id);
      const { data: nodes, error: nodeError } = versionIds.length
        ? await admin
            .from("nodes")
            .select("id, version_id, node_type")
            .in("version_id", versionIds)
        : { data: [], error: null };
      if (nodeError) throw new Error(nodeError.message);

      const { data: edges, error: edgeError } = versionIds.length
        ? await admin
            .from("edges")
            .select("id, version_id")
            .in("version_id", versionIds)
        : { data: [], error: null };
      if (edgeError) throw new Error(edgeError.message);

      const nodeCounts = new Map<string, {
        total: number;
        inputs: number;
        images: number;
        videos: number;
      }>();
      for (const node of nodes ?? []) {
        const current = nodeCounts.get(node.version_id) ?? { total: 0, inputs: 0, images: 0, videos: 0 };
        current.total += 1;
        if (node.node_type === "user_input") current.inputs += 1;
        if (node.node_type === "image_gen") current.images += 1;
        if (node.node_type === "video_gen") current.videos += 1;
        nodeCounts.set(node.version_id, current);
      }

      const edgeCounts = new Map<string, number>();
      for (const edge of edges ?? []) {
        edgeCounts.set(edge.version_id, (edgeCounts.get(edge.version_id) ?? 0) + 1);
      }

      const publishGates = new Map(
        await Promise.all(
          versionIds.map(async (versionId: string) => [
            versionId,
            await getVersionPublishGate(admin, versionId),
          ] as const),
        ),
      );

      return json({
        templates: (templates ?? []).map((template: any) => ({
          ...template,
          versions: (versions ?? [])
            .filter((version: any) => version.template_id === template.id)
            .map((version: any) => ({
              ...version,
              counts: {
                ...(nodeCounts.get(version.id) ?? { total: 0, inputs: 0, images: 0, videos: 0 }),
                edges: edgeCounts.get(version.id) ?? 0,
              },
              activationGate: publishGates.get(version.id) ?? null,
            })),
        })),
      });
    }

    if (action === "create_template") {
      const name = cleanText(body.name);
      if (!name) throw new Error("Template name is required");

      const { data: template, error: templateError } = await admin
        .from("fuse_templates")
        .insert({
          name,
          description: nullableText(body.description),
        })
        .select("id, name")
        .single();
      if (templateError || !template) throw new Error(templateError?.message ?? "Template create failed");

      const versionId = crypto.randomUUID();
      const { error: versionError } = await admin
        .from("template_versions")
        .insert({
          id: versionId,
          template_id: template.id,
          version_number: 1,
          is_active: false,
          review_status: "Unreviewed",
        });
      if (versionError) throw new Error(versionError.message);

      const withStarterGraph = body.withStarterGraph !== false;
      let uploadedReferenceAssets: unknown[] = [];
      if (withStarterGraph) {
        const requestedPreset = cleanText(body.starterPreset, "campaign") as StarterPreset;
        const starterPreset: StarterPreset = requestedPreset === "reference" || requestedPreset === "blank" || requestedPreset === "campaign"
          ? requestedPreset
          : "campaign";
        const starter = await starterNodes({
          admin,
          templateId: template.id,
          versionId,
          preset: starterPreset,
          inputSlots: readInputSlots(body.inputSlots),
          outputCount: cleanInteger(body.outputCount, 1, 1, MAX_OUTPUT_BRANCHES),
          referenceAssets: readReferenceDrafts(body.referenceAssets),
          imagePrompt: nullableText(body.imagePrompt),
          videoPrompt: nullableText(body.videoPrompt),
          uploadedBy: user.id,
        });
        const { error: nodesError } = await admin.from("nodes").insert(starter.nodes);
        if (nodesError) throw new Error(nodesError.message);
        const { error: edgesError } = await admin.from("edges").insert(starter.edges);
        if (edgesError) throw new Error(edgesError.message);
        uploadedReferenceAssets = starter.referenceAssets;
      }

      await logAuditEvent({
        eventType: "template_created",
        message: `Admin created template ${name}`,
        source: "admin-template-workbench",
        templateId: template.id,
        versionId,
        metadata: { adminUserId: user.id },
      }, admin);

      return json({
        templateId: template.id,
        templateName: template.name,
        versionId,
        versionNumber: 1,
        referenceAssets: uploadedReferenceAssets,
      });
    }

    if (action === "clone_version") {
      const sourceVersionId = cleanText(body.sourceVersionId);
      if (!sourceVersionId) throw new Error("sourceVersionId is required");

      let targetTemplateId = cleanText(body.targetTemplateId);
      const newTemplateName = cleanText(body.newTemplateName);

      if (newTemplateName) {
        const { data: template, error } = await admin
          .from("fuse_templates")
          .insert({
            name: newTemplateName,
            description: nullableText(body.newTemplateDescription),
          })
          .select("id")
          .single();
        if (error || !template) throw new Error(error?.message ?? "New template create failed");
        targetTemplateId = template.id;
      }

      if (!targetTemplateId) throw new Error("targetTemplateId or newTemplateName is required");

      const result = await cloneVersion({
        admin,
        sourceVersionId,
        targetTemplateId,
        makeActive: body.makeActive === true,
      });

      await logAuditEvent({
        eventType: "template_version_cloned",
        message: `Admin cloned template version ${sourceVersionId}`,
        source: "admin-template-workbench",
        templateId: result.templateId,
        versionId: result.versionId,
        metadata: { adminUserId: user.id, sourceVersionId, counts: result.counts },
      }, admin);

      return json(result);
    }

    if (action === "activate_version") {
      const versionId = cleanText(body.versionId);
      if (!versionId) throw new Error("versionId is required");

      const { data: version, error } = await admin
        .from("template_versions")
        .select("id, template_id")
        .eq("id", versionId)
        .single();
      if (error || !version) throw new Error(error?.message ?? "Version not found");

      const activationGate = await setActiveVersion(admin, version.template_id, version.id);
      return json({ versionId: version.id, templateId: version.template_id, isActive: true, activationGate });
    }

    if (action === "update_template") {
      const templateId = cleanText(body.templateId);
      if (!templateId) throw new Error("templateId is required");
      const patch: Record<string, unknown> = {};
      if ("name" in body) patch.name = cleanText(body.name);
      if ("description" in body) patch.description = nullableText(body.description);
      if (!Object.keys(patch).length) throw new Error("No template fields supplied");

      const { data, error } = await admin
        .from("fuse_templates")
        .update(patch)
        .eq("id", templateId)
        .select("id, name, description")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Template update failed");
      return json({ template: data });
    }

    if (action === "add_node") {
      const versionId = cleanText(body.versionId);
      const nodeType = cleanText(body.nodeType) as NodeType;
      const name = cleanText(body.name, nodeType === "user_input" ? "New Input" : nodeType === "video_gen" ? "New Video Step" : "New Image Step");
      if (!versionId) throw new Error("versionId is required");
      if (!["user_input", "image_gen", "video_gen"].includes(nodeType)) throw new Error("Invalid nodeType");

      const promptConfig = nodeType === "user_input"
        ? {
            editor_mode: cleanText(body.editorMode) === "reference" ? "reference" : "upload",
            editor_slot_key: cleanText(body.slotKey, name.toLowerCase().replace(/[^a-z0-9]+/g, "-")),
            editor_label: name,
            editor_expected: cleanText(body.expected, "image"),
          }
        : {
            prompt: cleanText(body.prompt, ""),
            output_exposed: body.outputExposed === true,
          };

      const { data, error } = await admin
        .from("nodes")
        .insert({
          version_id: versionId,
          node_type: nodeType,
          model_id: null,
          prompt_config: promptConfig,
          default_asset_id: null,
          name,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Node create failed");
      await markVersionNeedsReview(admin, versionId);
      return json({ nodeId: data.id, versionId });
    }

    if (action === "delete_node") {
      const nodeId = cleanText(body.nodeId);
      if (!nodeId) throw new Error("nodeId is required");

      const { data: node, error: nodeLookupError } = await admin
        .from("nodes")
        .select("version_id")
        .eq("id", nodeId)
        .maybeSingle();
      if (nodeLookupError) throw new Error(nodeLookupError.message);

      const { error: edgeError } = await admin
        .from("edges")
        .delete()
        .or(`source_node_id.eq.${nodeId},target_node_id.eq.${nodeId}`);
      if (edgeError) throw new Error(edgeError.message);

      const { error } = await admin.from("nodes").delete().eq("id", nodeId);
      if (error) throw new Error(error.message);
      if (node?.version_id) await markVersionNeedsReview(admin, node.version_id);
      return json({ nodeId, deleted: true });
    }

    if (action === "add_edge") {
      const versionId = cleanText(body.versionId);
      const sourceNodeId = cleanText(body.sourceNodeId);
      const targetNodeId = cleanText(body.targetNodeId);
      const targetParam = nullableText(body.targetParam);
      if (!versionId || !sourceNodeId || !targetNodeId) {
        throw new Error("versionId, sourceNodeId, and targetNodeId are required");
      }
      if (sourceNodeId === targetNodeId) throw new Error("An edge cannot target the same node");

      const { data, error } = await admin
        .from("edges")
        .insert({
          version_id: versionId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
          mapping_logic: targetParam ? { target_param: targetParam } : {},
          condition_logic: null,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Edge create failed");
      await markVersionNeedsReview(admin, versionId);
      return json({ edgeId: data.id, versionId });
    }

    if (action === "delete_edge") {
      const edgeId = cleanText(body.edgeId);
      if (!edgeId) throw new Error("edgeId is required");
      const { data: edge, error: edgeLookupError } = await admin
        .from("edges")
        .select("version_id")
        .eq("id", edgeId)
        .maybeSingle();
      if (edgeLookupError) throw new Error(edgeLookupError.message);
      const { error } = await admin.from("edges").delete().eq("id", edgeId);
      if (error) throw new Error(error.message);
      if (edge?.version_id) await markVersionNeedsReview(admin, edge.version_id);
      return json({ edgeId, deleted: true });
    }

    return json({ error: `Unsupported action: ${action}` }, 400);
  } catch (error) {
    return json({ error: errorMessage(error) }, 400);
  }
});
