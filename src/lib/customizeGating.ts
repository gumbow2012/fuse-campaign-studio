/**
 * Truthful "Customize workflow" gating.
 *
 * The backend (template-fork) stays authoritative; this resolves what the UI is
 * allowed to advertise BEFORE a click, so we never fire a fork request that the
 * server will reject.
 */
export type CustomizeState =
  | "active"
  | "creator_locked"
  | "plan_locked"
  | "plan_locked_creator_locked";

export function resolveCustomizeState(args: {
  planCanCustomize: boolean;
  templateCanCustomize: boolean;
}): CustomizeState {
  const { planCanCustomize, templateCanCustomize } = args;
  if (templateCanCustomize && planCanCustomize) return "active";
  if (!templateCanCustomize && planCanCustomize) return "creator_locked";
  if (templateCanCustomize && !planCanCustomize) return "plan_locked";
  return "plan_locked_creator_locked";
}

/** Only "active" may initiate a fork request. */
export function canInitiateFork(state: CustomizeState) {
  return state === "active";
}

/** Creator-locked states must never advertise Pro as unlocking the template. */
export function isCreatorLockedState(state: CustomizeState) {
  return state === "creator_locked" || state === "plan_locked_creator_locked";
}
