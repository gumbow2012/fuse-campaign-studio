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

  it("starts new templates as a blank graph instead of a wizard", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("withStarterGraph: false");
    expect(canvasSource).toContain("Blank canvas");
    expect(canvasSource).not.toContain("templateWizardStep === \"setup\"");
  });

  it("exposes a node palette with selectable video models", () => {
    const canvasSource = source();

    expect(canvasSource).toContain(">Palette<");
    expect(canvasSource).toContain("paletteVideoModel");
    expect(canvasSource).toContain('addNode("video_gen", paletteVideoModel)');
  });

  it("exposes incoming edge delete, drag reorder, and priority controls in the inspector", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("Incoming Priority");
    expect(canvasSource).toContain("Move incoming earlier");
    expect(canvasSource).toContain("Move incoming later");
    expect(canvasSource).toContain("Delete incoming connection");
    expect(canvasSource).toContain("const moveIncomingEdgeToIndex = useCallback");
    expect(canvasSource).toContain('action: "reorder_edge"');
  });

  it("normalizes blank incoming edge params before saving", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("function inferEdgeTargetParam");
    expect(canvasSource).toContain("targetParam = edgeDraft.targetParam.trim()");
    expect(canvasSource).toContain("Leave blank to auto-map this connection");
  });

  it("keeps raw edge target params off the canvas surface", () => {
    const canvasSource = source();

    expect(canvasSource).toContain("MAX_VISIBLE_CANVAS_EDGES");
    expect(canvasSource).toContain("canvasEdgeVisibility");
    expect(canvasSource).toContain("label: `Ref ${index + 1}`");
    expect(canvasSource).not.toContain("<text");
    expect(canvasSource).not.toContain("{incoming.targetParam}");
    expect(canvasSource).not.toContain("edge.sourceName} -> ${edge.targetParam");
  });
});

