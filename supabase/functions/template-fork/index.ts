import "jsr:@supabase/functions-js/edge-runtime.d.ts";

import {
  corsHeaders,
  createAdminClient,
  errorMessage,
  getUserRoles,
  json,
  requireUser,
} from "../_shared/supabase-admin.ts";
import { countTemplateDeliverables, getTemplateCreditCost } from "../_shared/template-pricing.ts";
import {
  compileForkEdges,
  compileForkNodes,
  selectForkExecutionNodes,
} from "../_shared/fork-run.ts";
import {
  applySignedUrls,
  buildNodeMediaMap,
  collectMapUrls,
  signMediaUrls,
  type ForkNodeMedia,
} from "../_shared/fork-media.ts";

import {
  assertForkOwnership,
  buildBasedOnLabel,
  buildPersonalGraph,
  defaultForkName,
  isPrivilegedRole,
  mergeForkEdits,
  resolveCustomizability,
  resolveForkEntitlement,
  sanitizePersonalGraphForClient,
} from "../_shared/template-fork.ts";


/**
 * TR8 — Pro private template forks (create + read).
 * Read-only against source templates; inserts only into template_user_forks.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });

  const admin = createAdminClient();

  try {
    const user = await requireUser(req, admin);
    const roles = await getUserRoles(user.id, admin);

    const body = await req.json().catch(() => ({})) as {
      action?: string;
      templateId?: string;
      forkId?: string;
      sourceJobId?: string;
    };
    const action = String(body.action ?? "");

    if (action === "create_fork") {
      const templateId = String(body.templateId ?? "").trim();
      if (!templateId) throw new Error("templateId is required");

      // ── Entitlement ──
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);

      const entitlement = resolveForkEntitlement({ plan: profile?.plan ?? null, roles });
      if (!entitlement.allowed) {
        return json({ error: "Pro membership required to customize workflows", code: entitlement.code }, 403);
      }

      // ── Source template + IP gate ──
      const { data: template, error: templateError } = await admin
        .from("fuse_templates")
        .select("id, name, created_by, allow_customer_edit, allow_prompt_visibility")
        .eq("id", templateId)
        .maybeSingle();
      if (templateError) throw new Error(templateError.message);
      if (!template) throw new Error("Template not found");

      const createdBy = (template as Record<string, unknown>).created_by as string | null;
      const createdByRoles = createdBy ? await getUserRoles(createdBy, admin) : [];

      const { customizable, promptVisibility } = resolveCustomizability({
        allowCustomerEdit: (template as Record<string, unknown>).allow_customer_edit as boolean | null,
        allowPromptVisibility: (template as Record<string, unknown>).allow_prompt_visibility as boolean | null,
        createdByRoles,
      });

      if (!customizable) {
        return json(
          { error: "This template cannot be customized", code: "CUSTOMIZATION_NOT_ALLOWED" },
          403,
        );
      }

      // ── Snapshot the ACTIVE version graph ──
      const { data: version, error: versionError } = await admin
        .from("template_versions")
        .select("id, version_number")
        .eq("template_id", templateId)
        .eq("is_active", true)
        .maybeSingle();
      if (versionError) throw new Error(versionError.message);
      if (!version) throw new Error("Template has no active version");

      const [nodesResult, edgesResult] = await Promise.all([
        admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id")
          .eq("version_id", version.id),
        admin.from("edges").select("source_node_id, target_node_id, mapping_logic")
          .eq("version_id", version.id),
      ]);
      if (nodesResult.error) throw new Error(nodesResult.error.message);
      if (edgesResult.error) throw new Error(edgesResult.error.message);

      const personalGraph = buildPersonalGraph({
        nodes: (nodesResult.data ?? []) as never,
        edges: (edgesResult.data ?? []) as never,
        promptVisibility,
      });

      // TR10b — remember the run this fork came from (owner-scoped) so a fork
      // run can reuse the originating uploaded assets.
      const requestedSourceJobId = String(body.sourceJobId ?? "").trim();
      let sourceJobId: string | null = null;
      if (requestedSourceJobId) {
        const { data: sourceJob } = await admin
          .from("execution_jobs")
          .select("id")
          .eq("id", requestedSourceJobId)
          .eq("user_id", user.id)
          .maybeSingle();
        sourceJobId = sourceJob?.id ? String(sourceJob.id) : null;
      }

      const { data: fork, error: insertError } = await admin
        .from("template_user_forks")
        .insert({
          user_id: user.id,
          source_job_id: sourceJobId,
          source_template_id: templateId,
          source_version_id: version.id,
          name: defaultForkName((template as Record<string, unknown>).name as string),
          personal_graph: personalGraph,
          prompt_visibility: promptVisibility,
        })
        .select("id")
        .single();
      if (insertError) throw new Error(insertError.message);

      return json({ forkId: fork.id, promptVisibility });
    }

    if (action === "get_fork") {
      const forkId = String(body.forkId ?? "").trim();
      if (!forkId) throw new Error("forkId is required");

      const { data: fork, error: forkError } = await admin
        .from("template_user_forks")
        .select("id, user_id, name, source_job_id, source_template_id, source_version_id, personal_graph, prompt_visibility, created_at, updated_at")
        .eq("id", forkId)
        .maybeSingle();
      if (forkError) throw new Error(forkError.message);
      if (!fork) throw new Error("Fork not found");

      assertForkOwnership({ forkUserId: fork.user_id as string, userId: user.id, roles });

      const [{ data: template }, { data: version }] = await Promise.all([
        admin.from("fuse_templates").select("id, name").eq("id", fork.source_template_id).maybeSingle(),
        admin.from("template_versions").select("id, version_number").eq("id", fork.source_version_id).maybeSingle(),
      ]);

      const promptVisibility = fork.prompt_visibility === true;
      const sanitized = sanitizePersonalGraphForClient(fork.personal_graph, promptVisibility);

      // ── MEDIA (presentation only): reuse the source run's persisted artifacts ──
      let mediaByNode: Record<string, ForkNodeMedia> = {};
      const sourceJobId = fork.source_job_id ? String(fork.source_job_id) : "";
      if (sourceJobId && sanitized?.nodes?.length) {
        // Ownership gate: the source run must belong to the fork owner.
        const { data: sourceJob } = await admin
          .from("execution_jobs")
          .select("id, user_id")
          .eq("id", sourceJobId)
          .maybeSingle();

        if (sourceJob && String(sourceJob.user_id ?? "") === String(fork.user_id)) {
          const { data: steps } = await admin
            .from("execution_steps")
            .select("node_id, input_payload, output_payload, output_asset_id")
            .eq("job_id", sourceJobId);

          const assetIds = [
            ...new Set((steps ?? []).map((s) => s.output_asset_id).filter(Boolean) as string[]),
          ];
          const assetUrlById = new Map<string, string>();
          if (assetIds.length) {
            const { data: assetRows } = await admin
              .from("assets")
              .select("id, supabase_storage_url")
              .in("id", assetIds);
            for (const row of assetRows ?? []) {
              if (row?.supabase_storage_url) {
                assetUrlById.set(String(row.id), String(row.supabase_storage_url));
              }
            }
          }

          const built = buildNodeMediaMap({
            steps: (steps ?? []) as never,
            assetUrlById,
            nodeIds: sanitized.nodes.map((node) => node.id),
          });
          const signed = await signMediaUrls(admin, collectMapUrls(built));
          mediaByNode = applySignedUrls(built, signed);
        }
      }

      // MEDIA ONLY — attached after sanitization; no prompt text is added here.
      const nodesWithMedia = (sanitized?.nodes ?? []).map((node) => {
        const media = mediaByNode[node.id];
        return media ? { ...node, media } : node;
      });

      return json({
        fork: {
          id: fork.id,
          name: fork.name,
          sourceTemplateId: fork.source_template_id,
          sourceTemplateName: template?.name ?? null,
          sourceVersionId: fork.source_version_id,
          promptVisibility,
          basedOn: buildBasedOnLabel(template?.name ?? null, version?.version_number),
          personalGraph: sanitized ? { ...sanitized, nodes: nodesWithMedia } : null,
          createdAt: fork.created_at,
          updatedAt: fork.updated_at,
        },
      });
    }


    if (action === "list_forks") {
      const { data: forks, error: listError } = await admin
        .from("template_user_forks")
        .select("id, name, source_template_id, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false });
      if (listError) throw new Error(listError.message);

      const templateIds = [...new Set((forks ?? []).map((f) => f.source_template_id).filter(Boolean))];
      const nameById = new Map<string, string>();
      if (templateIds.length) {
        const { data: templates } = await admin
          .from("fuse_templates")
          .select("id, name")
          .in("id", templateIds as string[]);
        for (const t of templates ?? []) nameById.set(t.id as string, (t.name as string) ?? "");
      }

      return json({
        forks: (forks ?? []).map((f) => ({
          id: f.id,
          name: f.name,
          sourceTemplateId: f.source_template_id,
          sourceTemplateName: nameById.get(f.source_template_id as string) ?? null,
          updatedAt: f.updated_at,
        })),
      });
    }

    if (action === "estimate_fork_run") {
      // TR10b — DRY RUN. Read-only: no version materialization, no job, no charge.
      const forkId = String(body.forkId ?? "").trim();
      if (!forkId) throw new Error("forkId is required");

      const { data: fork, error: forkError } = await admin
        .from("template_user_forks")
        .select("id, user_id, source_template_id, source_version_id, personal_graph, prompt_visibility")
        .eq("id", forkId)
        .maybeSingle();
      if (forkError) throw new Error(forkError.message);
      if (!fork) throw new Error("Fork not found");

      assertForkOwnership({ forkUserId: fork.user_id as string, userId: user.id, roles });

      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("plan")
        .eq("user_id", user.id)
        .maybeSingle();
      if (profileError) throw new Error(profileError.message);

      const entitlement = resolveForkEntitlement({ plan: profile?.plan ?? null, roles });
      if (!entitlement.allowed) {
        return json(
          { error: "Pro membership required to run personal workflows", code: entitlement.code },
          403,
        );
      }

      const promptVisibility = fork.prompt_visibility === true;
      const [nodesResult, edgesResult, templateResult] = await Promise.all([
        admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id, model_id")
          .eq("version_id", fork.source_version_id),
        admin.from("edges").select("source_node_id, target_node_id, mapping_logic")
          .eq("version_id", fork.source_version_id),
        admin.from("fuse_templates").select("id, name").eq("id", fork.source_template_id).maybeSingle(),
      ]);
      if (nodesResult.error) throw new Error(nodesResult.error.message);
      if (edgesResult.error) throw new Error(edgesResult.error.message);

      const compiledNodes = await compileForkNodes({
        forkId,
        sourceNodes: (nodesResult.data ?? []) as never,
        personalGraph: fork.personal_graph,
        promptVisibility,
      });
      const compiledEdges = compileForkEdges((edgesResult.data ?? []) as never, compiledNodes);
      const executionNodes = selectForkExecutionNodes(compiledNodes, compiledEdges);

      const privileged = isPrivilegedRole(roles);
      const templateName = String((templateResult.data as Record<string, unknown> | null)?.name ?? "");
      const estimatedCredits = privileged || !executionNodes.length
        ? 0
        : getTemplateCreditCost(templateName, countTemplateDeliverables(executionNodes));

      return json({ estimatedCredits, deliverables: executionNodes.length });
    }

    if (action === "update_fork" || action === "reset_fork") {
      const forkId = String((body as Record<string, unknown>).forkId ?? "").trim();
      if (!forkId) throw new Error("forkId is required");

      const { data: fork, error: forkError } = await admin
        .from("template_user_forks")
        .select("id, user_id, source_version_id, personal_graph, prompt_visibility")
        .eq("id", forkId)
        .maybeSingle();
      if (forkError) throw new Error(forkError.message);
      if (!fork) throw new Error("Fork not found");

      assertForkOwnership({ forkUserId: fork.user_id as string, userId: user.id, roles });
      const promptVisibility = fork.prompt_visibility === true;

      let nextGraph;
      if (action === "update_fork") {
        nextGraph = mergeForkEdits({
          stored: fork.personal_graph,
          incoming: (body as Record<string, unknown>).personalGraph,
          promptVisibility,
        });
      } else {
        // reset_fork — re-snapshot the PINNED source version graph.
        const [nodesResult, edgesResult] = await Promise.all([
          admin.from("nodes").select("id, name, node_type, prompt_config, default_asset_id")
            .eq("version_id", fork.source_version_id),
          admin.from("edges").select("source_node_id, target_node_id, mapping_logic")
            .eq("version_id", fork.source_version_id),
        ]);
        if (nodesResult.error) throw new Error(nodesResult.error.message);
        if (edgesResult.error) throw new Error(edgesResult.error.message);
        nextGraph = buildPersonalGraph({
          nodes: (nodesResult.data ?? []) as never,
          edges: (edgesResult.data ?? []) as never,
          promptVisibility,
        });
      }

      const { error: updateError } = await admin
        .from("template_user_forks")
        .update({ personal_graph: nextGraph, updated_at: new Date().toISOString() })
        .eq("id", forkId);
      if (updateError) throw new Error(updateError.message);

      return json({ ok: true, personalGraph: sanitizePersonalGraphForClient(nextGraph, promptVisibility) });
    }

    throw new Error("Unsupported action");

  } catch (error) {
    const message = errorMessage(error);
    if (message === "Forbidden") return json({ error: "Forbidden", code: "FORBIDDEN" }, 403);
    const status = /Authentication|authorization|bearer/i.test(message) ? 401 : 400;
    return json({ error: message }, status);
  }
});
