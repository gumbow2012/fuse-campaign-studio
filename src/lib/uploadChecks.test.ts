/**
 * uploadChecks regression tests — decode failure and decode timeout must
 * always settle to a controlled error and always revoke the object URL.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DECODE_TIMEOUT_MESSAGE,
  DECODE_TIMEOUT_MS,
  runUploadChecks,
} from "@/lib/uploadChecks";

const makeFile = () => new File(["fake-bytes"], "asset.png", { type: "image/png" });

let revokeSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  revokeSpy = vi.fn();
  URL.createObjectURL = vi.fn(() => "blob:mock-url");
  URL.revokeObjectURL = revokeSpy;
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("runUploadChecks decode handling", () => {
  it("returns a controlled ERROR when the image cannot be decoded", async () => {
    class BrokenImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal("Image", BrokenImage);

    const result = await runUploadChecks(makeFile());

    expect(result.state).toBe("error");
    expect(result.error).toMatch(/couldn't be opened/i);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("returns a controlled ERROR when decoding never settles (timeout)", async () => {
    class HangingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_v: string) {
        /* never resolves — simulates a hung decoder */
      }
    }
    vi.stubGlobal("Image", HangingImage);

    const pending = runUploadChecks(makeFile());
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS + 100);
    const result = await pending;

    expect(result.state).toBe("error");
    expect(result.error).toBe(DECODE_TIMEOUT_MESSAGE);
    expect(revokeSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("rejects non-image files before decoding", async () => {
    const result = await runUploadChecks(
      new File(["x"], "notes.txt", { type: "text/plain" }),
    );
    expect(result.state).toBe("error");
    expect(result.error).toMatch(/isn't an image/i);
  });
});
