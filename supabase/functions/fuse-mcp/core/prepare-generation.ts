/**
 * Standalone generation preview + confirmation token (ChatGPT confirm-before-spend).
 * Approximate estimate only; the real charge stays in generate-studio.
 */
import type { Admin, AuthContext } from "../auth.ts";
import { FuseError } from "../errors.ts";
import { issueConfirmationToken, sha256Hex, verifyConfirmationToken, type RunPlan } from "../confirm.ts";
import { getAccountCredits } from "./credits.ts";
import { signingSecret } from "./runs.ts";

export type GenKind = "image" | "video";

export function estimateGenerationCredits(kind: GenKind, duration?: number): number {
  if (kind === "image") return 2;
  const d = Number.isFinite(Number(duration)) && Number(duration) > 0 ? Number(duration) : 5;
  return Math.max(1, Math.ceil((0.14 * d) / 0.098));
}

export async function prepareGeneration(admin: Admin, auth: AuthContext, args: { kind: GenKind; prompt: string; duration?: number }) {
  if (!auth.userId) throw new FuseError("AUTH_REQUIRED");
  if (args.kind !== "image" && args.kind !== "video") throw new FuseError("INVALID_INPUT", "kind must be image or video");
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) throw new FuseError("MISSING_INPUT", "prompt required", { userMessage: "Describe what you want to generate." });
  const account = await getAccountCredits(admin, auth);
  const estimated = auth.isPrivileged ? 0 : estimateGenerationCredits(args.kind, args.duration);
  const can_run = account.privileged_no_charge || account.credit_balance >= estimated;
  const plan: RunPlan = {
    user_id: auth.userId,
    template_id: "standalone",
    version_id: args.kind,
    template_slug: `standalone-${args.kind}`,
    inputs: { prompt_hash: await sha256Hex(prompt) },
    output_mode: "full_campaign",
    estimated_credits: estimated,
    campaign_name: null,
  };
  const token = await issueConfirmationToken(await signingSecret(admin), plan);
  return {
    ready: can_run,
    kind: args.kind,
    prompt,
    estimated_credits: estimated,
    credit_balance: account.credit_balance,
    can_run,
    confirmation_summary: `Generate a ${args.kind} from your prompt for about ${estimated} credits (balance ${account.credit_balance}). Go ahead?`,
    confirmation_token: token.token,
    confirmation_expires_at: token.expires_at,
  };
}

export async function verifyGenerationToken(admin: Admin, auth: AuthContext, kind: GenKind, prompt: string, token: unknown) {
  if (!token) {
    throw new FuseError("CONFIRMATION_REQUIRED", "Confirm the generation before starting", {
      nextAction: "Call fuse_prepare_generation, show the confirmation_summary to the user, and start only after they explicitly confirm.",
    });
  }
  const v = await verifyConfirmationToken(await signingSecret(admin), String(token));
  if (!v.ok) throw new FuseError(v.reason === "expired" ? "CONFIRMATION_EXPIRED" : "CONFIRMATION_MISMATCH");
  if (v.plan.user_id !== auth.userId || v.plan.version_id !== kind || v.plan.inputs?.prompt_hash !== (await sha256Hex(String(prompt ?? "").trim()))) {
    throw new FuseError("CONFIRMATION_MISMATCH");
  }
}
