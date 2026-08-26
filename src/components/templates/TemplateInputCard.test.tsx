/**
 * TemplateInputCard state-machine regression tests.
 *
 * Covers the stuck-"CHECKING" race: a fast (<180ms) check must end READY and
 * never be stomped back to checking by the delayed-loader timer; a slow check
 * shows the checking overlay then a terminal state; a stale file's late
 * completion must never override a newer file's state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import TemplateInputCard from "@/components/templates/TemplateInputCard";
import { runUploadChecks, type UploadCheckResult } from "@/lib/uploadChecks";

vi.mock("@/lib/uploadChecks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/uploadChecks")>();
  return { ...actual, runUploadChecks: vi.fn() };
});

const mockedRun = vi.mocked(runUploadChecks);

const READY: UploadCheckResult = { state: "ready", warnings: [], notChecked: [] };
const ERROR: UploadCheckResult = {
  state: "error",
  warnings: [],
  error: "This file couldn't be opened — it may be corrupted or an unsupported format.",
  notChecked: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const fileA = () => new File(["a"], "face-a.png", { type: "image/png" });
const fileB = () => new File(["b"], "face-b.png", { type: "image/png" });

const renderCard = (file: File | null, rerenderWith?: never) =>
  render(
    <TemplateInputCard label="Face" file={file} onFileChange={() => {}} />,
  );

beforeEach(() => {
  vi.useFakeTimers();
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  mockedRun.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TemplateInputCard validation state machine", () => {
  it("FAST check (<180ms): resolves READY and never reverts to CHECKING", async () => {
    mockedRun.mockResolvedValue(READY);
    renderCard(fileA());

    await act(async () => {}); // flush the resolved promise
    expect(screen.getByText("✓ Ready")).toBeInTheDocument();

    // The 180ms delayed-loader timer must have been cleared — advancing well
    // past it must NOT bring back a checking overlay.
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/checking asset/i)).toBeNull();
    expect(screen.getByText("✓ Ready")).toBeInTheDocument();
  });

  it("SLOW check (>180ms): shows the checking overlay, then READY", async () => {
    const slow = deferred<UploadCheckResult>();
    mockedRun.mockReturnValue(slow.promise);
    renderCard(fileA());

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText(/checking asset/i)).toBeInTheDocument();

    await act(async () => {
      slow.resolve(READY);
    });
    expect(screen.queryByText(/checking asset/i)).toBeNull();
    expect(screen.getByText("✓ Ready")).toBeInTheDocument();
  });

  it("decode-fail result renders the ERROR state", async () => {
    mockedRun.mockResolvedValue(ERROR);
    renderCard(fileA());

    await act(async () => {});
    expect(screen.getByText(/couldn't be opened/i)).toBeInTheDocument();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.queryByText(/checking asset/i)).toBeNull();
  });

  it("a rejected check settles to ERROR instead of sticking in CHECKING", async () => {
    const failing = deferred<UploadCheckResult>();
    mockedRun.mockReturnValue(failing.promise);
    renderCard(fileA());

    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(screen.getByText(/checking asset/i)).toBeInTheDocument();

    await act(async () => {
      failing.reject(new Error("boom"));
    });
    expect(screen.queryByText(/checking asset/i)).toBeNull();
    expect(screen.getByText(/try uploading it again/i)).toBeInTheDocument();
  });

  it("REPLACEMENT: a stale file's late result never overrides the new file", async () => {
    const checkA = deferred<UploadCheckResult>();
    const checkB = deferred<UploadCheckResult>();
    mockedRun.mockReturnValueOnce(checkA.promise).mockReturnValueOnce(checkB.promise);

    const { rerender } = render(
      <TemplateInputCard label="Face" file={fileA()} onFileChange={() => {}} />,
    );
    await act(async () => {
      vi.advanceTimersByTime(250); // A is visibly checking
    });

    // User replaces File A with File B before A's check finishes.
    rerender(<TemplateInputCard label="Face" file={fileB()} onFileChange={() => {}} />);

    // A resolves late with a distinctive warning — it must be ignored.
    await act(async () => {
      checkA.resolve({ state: "warning", warnings: ["STALE-A-WARNING"], notChecked: [] });
    });
    expect(screen.queryByText(/STALE-A-WARNING/)).toBeNull();

    await act(async () => {
      checkB.resolve({ state: "warning", warnings: ["CURRENT-B-WARNING"], notChecked: [] });
    });
    expect(screen.getByText(/CURRENT-B-WARNING/)).toBeInTheDocument();
    expect(screen.queryByText(/STALE-A-WARNING/)).toBeNull();
    expect(screen.getByText("face-b.png")).toBeInTheDocument();
  });
});
