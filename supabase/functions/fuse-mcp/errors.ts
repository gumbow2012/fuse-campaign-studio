/**
 * Model-readable errors. Every error carries a stable code, an internal message,
 * a user-safe message, whether a retry can help, and the next action to take.
 */
export type FuseErrorCode =
  | "AUTH_REQUIRED"
  | "INVALID_TOKEN"
  | "FORBIDDEN_SCOPE"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_LOCKED"
  | "MISSING_INPUT"
  | "INVALID_INPUT"
  | "UNSUPPORTED_FILE_TYPE"
  | "FILE_TOO_LARGE"
  | "INSUFFICIENT_CREDITS"
  | "CONFIRMATION_REQUIRED"
  | "CONFIRMATION_EXPIRED"
  | "CONFIRMATION_MISMATCH"
  | "RATE_LIMITED"
  | "GENERATION_FAILED"
  | "NOT_SUPPORTED"
  | "CONFLICT"
  | "INTERNAL";

const HTTP: Record<FuseErrorCode, number> = {
  AUTH_REQUIRED: 401,
  INVALID_TOKEN: 401,
  FORBIDDEN_SCOPE: 403,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  TEMPLATE_NOT_FOUND: 404,
  TEMPLATE_LOCKED: 403,
  MISSING_INPUT: 400,
  INVALID_INPUT: 400,
  UNSUPPORTED_FILE_TYPE: 400,
  FILE_TOO_LARGE: 400,
  INSUFFICIENT_CREDITS: 402,
  CONFIRMATION_REQUIRED: 400,
  CONFIRMATION_EXPIRED: 400,
  CONFIRMATION_MISMATCH: 400,
  RATE_LIMITED: 429,
  GENERATION_FAILED: 502,
  NOT_SUPPORTED: 501,
  CONFLICT: 409,
  INTERNAL: 500,
};

const DEFAULT_USER_MESSAGE: Record<FuseErrorCode, string> = {
  AUTH_REQUIRED: "Connect your FUSE account to do this.",
  INVALID_TOKEN: "Your FUSE connection has expired. Reconnect your FUSE account.",
  FORBIDDEN_SCOPE: "Your FUSE connection doesn't include permission for this action.",
  FORBIDDEN: "You don't have access to that.",
  NOT_FOUND: "I couldn't find that in FUSE.",
  TEMPLATE_NOT_FOUND: "I couldn't find that FUSE campaign template.",
  TEMPLATE_LOCKED: "This campaign needs a different plan before it can run.",
  MISSING_INPUT: "This campaign needs a product photo before it can run.",
  INVALID_INPUT: "Something in the request wasn't valid.",
  UNSUPPORTED_FILE_TYPE: "Upload a PNG, JPG, WEBP, or a supported MP4/MOV/WEBM video.",
  FILE_TOO_LARGE: "That file is too large. Images must be under 12 MB and videos under 60 MB.",
  INSUFFICIENT_CREDITS: "You don't have enough credits for this campaign.",
  CONFIRMATION_REQUIRED: "Prepare the campaign first, then confirm before it runs.",
  CONFIRMATION_EXPIRED: "That confirmation expired. Prepare the campaign again to get a fresh one.",
  CONFIRMATION_MISMATCH: "The campaign details changed since it was prepared. Prepare it again.",
  RATE_LIMITED: "Too many requests right now. Try again in a minute.",
  GENERATION_FAILED: "One or more outputs failed. You can retry them or download the completed outputs.",
  NOT_SUPPORTED: "That isn't available yet.",
  CONFLICT: "Someone else changed this campaign at the same time. Reload it and try again.",
  INTERNAL: "FUSE hit a problem. Try again in a moment.",
};

export class FuseError extends Error {
  code: FuseErrorCode;
  status: number;
  userMessage: string;
  retryable: boolean;
  nextAction: string | null;
  details: Record<string, unknown> | undefined;

  constructor(
    code: FuseErrorCode,
    message?: string,
    options: { userMessage?: string; retryable?: boolean; nextAction?: string; details?: Record<string, unknown> } = {},
  ) {
    super(message ?? DEFAULT_USER_MESSAGE[code]);
    this.code = code;
    this.status = HTTP[code];
    this.userMessage = options.userMessage ?? DEFAULT_USER_MESSAGE[code];
    this.retryable = options.retryable ?? (code === "RATE_LIMITED" || code === "INTERNAL");
    this.nextAction = options.nextAction ?? null;
    this.details = options.details;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      user_safe_message: this.userMessage,
      retryable: this.retryable,
      next_action: this.nextAction,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export function asFuseError(error: unknown): FuseError {
  if (error instanceof FuseError) return error;
  const message = error instanceof Error ? error.message : String(error);
  // Never leak stack traces or provider internals to the caller.
  console.error("[fuse-mcp] unhandled:", message);
  return new FuseError("INTERNAL", "Unexpected error");
}
