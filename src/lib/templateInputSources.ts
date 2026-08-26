/**
 * Customer builder — per-input asset source menus.
 *
 * Pure presentation mapping: turns the generic "upload / library / use assets
 * from…" trio into human-readable options per input type. Every option still
 * routes through the SAME existing ingestion flows (file input, library picker,
 * profile picker, cast selector) — nothing about the payload changes here.
 */

import type { TemplateAssetType } from "@/lib/templateAssetRequirements";

export type AssetSourceKind = "upload" | "library" | "profile" | "cast";

export interface AssetSourceOption {
  kind: AssetSourceKind;
  label: string;
  hint?: string;
}

export type InputRole =
  | "face"
  | "jewelry"
  | "garment"
  | "logo"
  | "car"
  | "product"
  | "generic";

const ROLE_PATTERNS: { role: InputRole; test: RegExp }[] = [
  { role: "face", test: /(face|model|subject|person|portrait|talent|cast|avatar|who)/i },
  { role: "jewelry", test: /(grill|grillz|jewel|chain|pendant|ring|watch|diamond)/i },
  { role: "garment", test: /(garment|shirt|tee|hoodie|jacket|top|bottom|pant|short|apparel|clothing)/i },
  { role: "logo", test: /(logo|wordmark|badge|emblem)/i },
  { role: "car", test: /(car|vehicle|whip|auto|moto)/i },
  { role: "product", test: /(product|packaging|bottle|can|box)/i },
];

/** Resolves the human role for an input from its metadata first, label second. */
export function resolveInputRole(label: string, assetType?: TemplateAssetType | null): InputRole {
  switch (assetType) {
    case "avatar":
      return "face";
    case "jewelry":
      return "jewelry";
    case "garment-front":
    case "garment-back":
      return "garment";
    case "logo":
      return "logo";
    case "packaging":
    case "product":
      return "product";
    default:
      break;
  }

  const match = ROLE_PATTERNS.find((pattern) => pattern.test.test(label));
  return match?.role ?? "generic";
}

/** Short role word used on the compact slot ("+ Add FACE"). */
export function inputRoleWord(label: string, role: InputRole): string {
  switch (role) {
    case "face":
      return "FACE";
    case "jewelry":
      return /grill/i.test(label) ? "GRILL" : "JEWELRY";
    case "garment":
      return /bottom|pant|short/i.test(label) ? "BOTTOM" : /top|shirt|tee|hoodie|jacket/i.test(label) ? "TOP" : "GARMENT";
    case "logo":
      return "LOGO";
    case "car":
      return "CAR";
    case "product":
      return "PRODUCT";
    default:
      return label.toUpperCase();
  }
}

/**
 * The sources offered for an input. `castEnabled` only applies to face slots on
 * templates whose cast_config supports a cast.
 */
export function resolveInputSources(
  label: string,
  role: InputRole,
  castEnabled = false,
): AssetSourceOption[] {
  switch (role) {
    case "face":
      return [
        ...(castEnabled ? ([{ kind: "cast", label: "FUSE Cast", hint: "Pick a FUSE or saved avatar" }] as AssetSourceOption[]) : []),
        { kind: "upload", label: "Upload Subject", hint: "Your own photo" },
        { kind: "library", label: "Library", hint: "Assets you saved before" },
      ];
    case "jewelry":
      return [
        { kind: "upload", label: /grill/i.test(label) ? "Upload Grill" : "Upload Jewelry" },
        { kind: "library", label: "Jewelry Library" },
        { kind: "profile", label: "Saved Jewelry", hint: "From a product profile" },
      ];
    case "garment":
      return [
        { kind: "upload", label: "Upload" },
        { kind: "library", label: "Garment Library" },
        { kind: "profile", label: "Brand Profile" },
      ];
    case "logo":
      return [
        { kind: "upload", label: "Upload" },
        { kind: "profile", label: "Brand Profile" },
        { kind: "library", label: "Library" },
      ];
    case "product":
      return [
        { kind: "upload", label: "Upload" },
        { kind: "library", label: "Library" },
        { kind: "profile", label: "Product Profile" },
      ];
    case "car":
    case "generic":
    default:
      return [
        { kind: "upload", label: "Upload" },
        { kind: "library", label: "Library" },
      ];
  }
}
