import { describe, expect, it } from "vitest";
import {
  canInitiateFork,
  isCreatorLockedState,
  resolveCustomizeState,
} from "./customizeGating";

describe("resolveCustomizeState", () => {
  it("is active when both plan and template allow it", () => {
    expect(resolveCustomizeState({ planCanCustomize: true, templateCanCustomize: true })).toBe("active");
  });

  it("is creator_locked when the plan allows but the template does not", () => {
    expect(resolveCustomizeState({ planCanCustomize: true, templateCanCustomize: false })).toBe("creator_locked");
  });

  it("is plan_locked when the template allows but the plan does not", () => {
    expect(resolveCustomizeState({ planCanCustomize: false, templateCanCustomize: true })).toBe("plan_locked");
  });

  it("is plan_locked_creator_locked when neither allows it", () => {
    expect(resolveCustomizeState({ planCanCustomize: false, templateCanCustomize: false })).toBe(
      "plan_locked_creator_locked",
    );
  });

  it("only allows a fork request from the active state", () => {
    expect(canInitiateFork("active")).toBe(true);
    expect(canInitiateFork("creator_locked")).toBe(false);
    expect(canInitiateFork("plan_locked")).toBe(false);
    expect(canInitiateFork("plan_locked_creator_locked")).toBe(false);
  });

  it("treats both creator-locked variants as creator locked visually", () => {
    expect(isCreatorLockedState("creator_locked")).toBe(true);
    expect(isCreatorLockedState("plan_locked_creator_locked")).toBe(true);
    expect(isCreatorLockedState("plan_locked")).toBe(false);
    expect(isCreatorLockedState("active")).toBe(false);
  });
});
