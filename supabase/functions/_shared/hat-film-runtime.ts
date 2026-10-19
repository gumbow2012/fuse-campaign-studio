/**
 * Hat Brand Film — executor integration (opt-in). Every function returns
 * null / no-op for templates without Hat Brand Film node metadata, so legacy
 * graphs keep their exact behavior.
 */
import { HAT_FILM_CONTEXT_KEY, hatFilmRawInputs, validateHatFilmInputs } from "./hat-film-recipe.ts";
import { compileHatFilmRun, parseHatFilmContext, type HatFilmRunContext } from "./hat-film-prompts.ts";

type NodeLike = { id: string; name: string; node_type: string; prompt_config?: Record<string, any> | null };

export class HatFilmInputError extends Error {
  code = "HAT_FILM_INPUTS_INVALID";
  constructor(public issues: Array<{ field: string; message: string }>) {
    super(issues.map((i) => i.message).join(" "));
  }
}

export const isHatFilmGraph = (nodes: NodeLike[]) =>
  nodes.some((n) => n.node_type === "user_input" && typeof n.prompt_config?.hat_film_slot === "string");

/** Validates resolved inputs and compiles the immutable run context. Throws HatFilmInputError. */
export function compileHatFilmForJob(nodes: NodeLike[], jobInputs: Record<string, unknown>): HatFilmRunContext | null {
  const raw = hatFilmRawInputs(nodes, jobInputs);
  if (!raw) return null;
  const result = validateHatFilmInputs(raw);
  if (!result.ok) throw new HatFilmInputError(result.issues);
  return compileHatFilmRun(result.inputs);
}

/** Context already snapshotted on the job, or compile + persist it once. */
export async function ensureHatFilmContext(
  admin: any,
  job: { id: string; input_payload?: Record<string, unknown> | null },
  nodes: NodeLike[],
): Promise<HatFilmRunContext | null> {
  if (!isHatFilmGraph(nodes)) return null;
  const payload = (job.input_payload ?? {}) as Record<string, unknown>;
  const existing = parseHatFilmContext(payload[HAT_FILM_CONTEXT_KEY]);
  if (existing) return existing;
  const context = compileHatFilmForJob(nodes, payload);
  if (!context) return null;
  const { error } = await admin.from("execution_jobs")
    .update({ input_payload: { ...payload, [HAT_FILM_CONTEXT_KEY]: context } })
    .eq("id", job.id);
  if (error) throw new Error(error.message);
  return context;
}

const shotOf = (ctx: HatFilmRunContext | null, node: NodeLike) => {
  const id = node.prompt_config?.hat_film_shot;
  return ctx && typeof id === "string" ? ctx.shots.find((s) => s.shot_id === id) ?? null : null;
};

/** Provider prompt for a Hat Brand Film node, or null for any other node. */
export function hatFilmPrompt(ctx: HatFilmRunContext | null, node: NodeLike): string | null {
  const shot = shotOf(ctx, node);
  if (!shot) return null;
  const stage = node.prompt_config?.hat_film_stage;
  if (stage === "still") return shot.still_prompt;
  if (stage === "clip") {
    if (!shot.motion_prompt) throw new Error(`${shot.shot_id} has no clip stage`);
    return shot.motion_prompt;
  }
  return null;
}

/** Ordered image inputs for a still: environment reference first, then product refs. */
export function hatFilmStillInputs(
  ctx: HatFilmRunContext | null,
  node: NodeLike,
  nodes: NodeLike[],
  resolvedUrl: (nodeId: string) => string | undefined,
): string[] | null {
  const shot = shotOf(ctx, node);
  if (!shot || node.prompt_config?.hat_film_stage !== "still") return null;
  const urls: string[] = [];
  if (shot.world_from) {
    const worldNode = nodes.find((n) => n.prompt_config?.hat_film_shot === shot.world_from && n.prompt_config?.hat_film_stage === "still");
    const url = worldNode ? resolvedUrl(worldNode.id) : undefined;
    if (!url) throw new Error(`${shot.shot_id} is waiting for the ${shot.world_from} environment still`);
    urls.push(url);
  }
  urls.push(...shot.references.map((r) => r.url));
  if (!urls.length) throw new Error(`${shot.shot_id} has no references`);
  return urls;
}
