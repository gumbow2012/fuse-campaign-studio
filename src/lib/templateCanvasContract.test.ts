import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("template canvas editor contract", () => {
  const source = () => readFileSync(
    resolve(process.cwd(), "src/pages/TemplateCanvas.tsx"),
    "utf8",
  );

  it("keeps node drag state stable through pointer-up batching", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("const activeDrag = dragRef.current");
    expect(canvasSource).toContain("[activeDrag.nodeId]");
    expect(canvasSource).not.toContain("dragRef.current!.nodeId");
    expect(canvasSource).not.toContain("dragRef.current!.origin");
  });

  it("uses explicit branch priority controls instead of card dragging", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("const moveTemplateBranch = useCallback");
    expect(canvasSource).toContain("Move branch earlier");
    expect(canvasSource).toContain("Move branch later");
  });

  it("exposes incoming edge delete and priority controls in the inspector", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("Incoming Priority");
    expect(canvasSource).toContain("Move incoming earlier");
    expect(canvasSource).toContain("Move incoming later");
    expect(canvasSource).toContain("Delete incoming connection");
    expect(canvasSource).toContain('action: "reorder_edge"');
  });

  it("normalizes blank incoming edge params before saving", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("function inferEdgeTargetParam");
    expect(canvasSource).toContain("targetParam = edgeDraft.targetParam.trim()");
    expect(canvasSource).toContain("Leave blank to auto-map this connection");
  });
});
