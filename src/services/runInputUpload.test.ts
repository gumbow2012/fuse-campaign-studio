/**
 * Run-input upload transport tests — file bytes must go DIRECTLY to Supabase
 * Storage, never base64-encoded into an edge-function JSON body.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadMock = vi.fn();
const getPublicUrlMock = vi.fn();
const getUserMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_PUBLISHABLE_KEY: "anon-key",
  supabase: {
    auth: { getUser: () => getUserMock() },
    storage: {
      from: (bucket: string) => ({
        upload: (path: string, file: File, opts: unknown) => uploadMock(bucket, path, file, opts),
        getPublicUrl: (path: string) => getPublicUrlMock(bucket, path),
      }),
    },
  },
}));

const { uploadRunInputFile } = await import("@/services/runInputUpload");

const USER_ID = "11111111-2222-3333-4444-555555555555";

function imageOfSize(mb: number, name = "asset.png") {
  const file = new File(["x"], name, { type: "image/png" });
  Object.defineProperty(file, "size", { value: Math.round(mb * 1024 * 1024) });
  return file;
}

beforeEach(() => {
  uploadMock.mockReset().mockResolvedValue({ error: null });
  getPublicUrlMock
    .mockReset()
    .mockImplementation((bucket: string, path: string) => ({
      data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` },
    }));
  getUserMock.mockReset().mockResolvedValue({ data: { user: { id: USER_ID } } });
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("no network calls allowed"))));
  if (!globalThis.crypto?.randomUUID) {
    vi.stubGlobal("crypto", { randomUUID: () => "uuid-1234" });
  }
});

describe("uploadRunInputFile direct-to-storage transport", () => {
  it.each([2, 8, 11.5])("uploads a %sMB image straight to fuse-assets", async (mb) => {
    const url = await uploadRunInputFile(imageOfSize(mb));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [bucket, path, body] = uploadMock.mock.calls[0];
    expect(bucket).toBe("fuse-assets");
    expect(path.startsWith(`${USER_ID}/`)).toBe(true);
    expect(path).toMatch(/^[\w-]+\/run-inputs\/[^/\s]+\.png$/);
    expect(body).toBeInstanceOf(File); // raw bytes, not a data URL string
    expect(String(body)).not.toContain("data:");

    // No edge-function JSON body carried the file.
    expect(fetch).not.toHaveBeenCalled();
    expect(url).toBe(
      `https://example.supabase.co/storage/v1/object/public/fuse-assets/${path}`,
    );
  });

  it("rejects a 12.5MB image locally before any upload", async () => {
    await expect(uploadRunInputFile(imageOfSize(12.5))).rejects.toThrow(/larger than 12 MB/i);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uploads two large assets independently in the same run", async () => {
    const [a, b] = await Promise.all([
      uploadRunInputFile(imageOfSize(11, "front.png")),
      uploadRunInputFile(imageOfSize(9, "logo.png")),
    ]);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    const paths = uploadMock.mock.calls.map((call) => call[1]);
    expect(paths.every((p: string) => p.startsWith(`${USER_ID}/run-inputs/`))).toBe(true);
    expect(a).not.toBe(b);
  });

  it("throws when there is no signed-in user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    await expect(uploadRunInputFile(imageOfSize(1))).rejects.toThrow(/sign in/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });
});
