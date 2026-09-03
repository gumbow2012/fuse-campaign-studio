import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  activeSegments,
  applyEditOp,
  clipDurationMs,
  loadEditorState,
  removedSegments,
  totalDurationMs,
  type EditOp,
  type EditProject,
  type EditSegment,
} from "@/services/campaignEditor";
import {
  DEFAULT_ADJUSTMENTS,
  normalizeAdjustments,
  type Adjustments,
} from "@/services/editorAdjustments";
import type { ExportSettings } from "@/services/exportSettings";
import type { TextLayer } from "@/services/editorText";
import type { MusicTrack } from "@/services/editorMusic";

export type SaveState = "idle" | "saving" | "saved" | "error" | "conflict";

type HistoryEntry = { label: string; undo: EditOp[]; redo: EditOp[] };

/** Merge one namespaced adjustment patch into a clip's adjustments. */
function mergeAdjustments(current: Adjustments, patch: Record<string, unknown>): Adjustments {
  const merged: Record<string, unknown> = { ...current };
  for (const [namespace, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      merged[namespace] = { ...((current as unknown as Record<string, object>)[namespace] ?? {}), ...value };
    } else {
      merged[namespace] = value;
    }
  }
  return normalizeAdjustments(merged);
}

/** Optimistic local application of an op — mirrors the server semantics. */
function applyLocally(segments: EditSegment[], op: EditOp): EditSegment[] {
  switch (op.op) {
    case "reorder": {
      const order = op.payload.order;
      return segments.map((segment) => {
        const index = order.indexOf(segment.id);
        return index === -1 ? segment : { ...segment, position: index };
      });
    }
    case "trim":
      return segments.map((segment) =>
        segment.id === op.payload.segment_id
          ? {
              ...segment,
              trim_start_ms: Math.max(0, Math.round(op.payload.trim_start_ms)),
              trim_end_ms: Math.min(segment.source_duration_ms, Math.round(op.payload.trim_end_ms)),
            }
          : segment,
      );
    case "mute":
      return segments.map((segment) =>
        segment.id === op.payload.segment_id ? { ...segment, muted: op.payload.muted } : segment,
      );
    case "volume":
      return segments.map((segment) =>
        segment.id === op.payload.segment_id
          ? { ...segment, volume: Math.min(2, Math.max(0, op.payload.volume)) }
          : segment,
      );
    case "remove":
      return segments.map((segment) =>
        segment.id === op.payload.segment_id ? { ...segment, removed: true } : segment,
      );
    case "restore":
      return segments.map((segment) =>
        segment.id === op.payload.segment_id ? { ...segment, removed: false } : segment,
      );
    case "adjust":
      return segments.map((segment) => {
        const inScope = op.payload.scope === "all" ? !segment.removed : segment.id === op.payload.segment_id;
        return inScope
          ? { ...segment, adjustments: mergeAdjustments(segment.adjustments, op.payload.adjustments) }
          : segment;
      });
    case "reset_adjust":
      return segments.map((segment) => {
        const inScope = op.payload.scope === "all" ? !segment.removed : segment.id === op.payload.segment_id;
        return inScope ? { ...segment, adjustments: DEFAULT_ADJUSTMENTS } : segment;
      });
    default:
      return segments;
  }
}

/** Inverse ops for undo — may need more than one op (e.g. scope 'all'). */
function inverseOf(segments: EditSegment[], project: EditProject | null, op: EditOp): EditOp[] {
  switch (op.op) {
    case "reorder":
      return [{ op: "reorder", payload: { order: activeSegments(segments).map((s) => s.id) } }];
    case "trim": {
      const target = segments.find((s) => s.id === op.payload.segment_id);
      if (!target) return [];
      return [
        {
          op: "trim",
          payload: {
            segment_id: target.id,
            trim_start_ms: target.trim_start_ms,
            trim_end_ms: target.trim_end_ms,
          },
        },
      ];
    }
    case "mute": {
      const target = segments.find((s) => s.id === op.payload.segment_id);
      return target ? [{ op: "mute", payload: { segment_id: target.id, muted: target.muted } }] : [];
    }
    case "volume": {
      const target = segments.find((s) => s.id === op.payload.segment_id);
      return target ? [{ op: "volume", payload: { segment_id: target.id, volume: target.volume } }] : [];
    }
    case "remove":
      return [{ op: "restore", payload: { segment_id: op.payload.segment_id } }];
    case "restore":
      return [{ op: "remove", payload: { segment_id: op.payload.segment_id } }];
    case "adjust":
    case "reset_adjust": {
      const scoped =
        op.payload.scope === "all"
          ? segments.filter((segment) => !segment.removed)
          : segments.filter((segment) => segment.id === op.payload.segment_id);
      return scoped.map((segment) => ({
        op: "adjust",
        payload: {
          segment_id: segment.id,
          adjustments: segment.adjustments as unknown as Record<string, unknown>,
          scope: "clip",
        },
      }));
    }
    case "set_meta": {
      if (!project) return [];
      const payload: Record<string, unknown> = {};
      if (op.payload.export_settings) payload.export_settings = project.export_settings;
      if (op.payload.text_layers) payload.text_layers = project.text_layers;
      if (op.payload.music !== undefined) payload.music = project.music;
      return [{ op: "set_meta", payload } as EditOp];
    }
    default:
      return [];
  }
}

const DEBOUNCED_OPS = new Set(["trim", "volume", "adjust", "set_meta"]);

export function useCampaignEditor(projectId: string | undefined) {
  const [project, setProject] = useState<EditProject | null>(null);
  const [segments, setSegments] = useState<EditSegment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const revisionRef = useRef(0);
  const segmentsRef = useRef<EditSegment[]>([]);
  const projectRef = useRef<EditProject | null>(null);
  const queueRef = useRef<EditOp[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const inFlightRef = useRef(false);
  const historyRef = useRef<{ past: HistoryEntry[]; future: HistoryEntry[] }>({ past: [], future: [] });
  const [historyVersion, setHistoryVersion] = useState(0);

  segmentsRef.current = segments;
  projectRef.current = project;
  if (project) revisionRef.current = project.revision;

  const adopt = useCallback((next: { project: EditProject; segments: EditSegment[] }) => {
    setProject(next.project);
    projectRef.current = next.project;
    revisionRef.current = next.project.revision;
    setSegments(next.segments);
    segmentsRef.current = next.segments;
  }, []);

  const reload = useCallback(async () => {
    if (!projectId) return;
    try {
      const state = await loadEditorState(projectId);
      adopt(state);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load this campaign edit.");
    }
  }, [projectId, adopt]);

  useEffect(() => {
    let cancelled = false;
    if (!projectId) return;
    setLoading(true);
    loadEditorState(projectId)
      .then((state) => {
        if (cancelled) return;
        adopt(state);
        setSelectedId(activeSegments(state.segments)[0]?.id ?? null);
        setLoadError(null);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadError(error instanceof Error ? error.message : "Could not load this campaign edit.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, adopt]);

  /** Refresh signed urls periodically (they expire ~1h). */
  useEffect(() => {
    if (!projectId) return;
    const timer = window.setInterval(() => void reload(), 40 * 60 * 1000);
    return () => window.clearInterval(timer);
  }, [projectId, reload]);

  const drain = useCallback(async () => {
    if (!projectId || inFlightRef.current) return;
    inFlightRef.current = true;
    setSaveState("saving");
    try {
      while (queueRef.current.length) {
        const op = queueRef.current.shift() as EditOp;
        let result = await applyEditOp(projectId, revisionRef.current, op);

        if (result.status === "conflict" && result.project) {
          adopt({ project: result.project, segments: result.segments ?? segmentsRef.current });
          result = await applyEditOp(projectId, revisionRef.current, op);
        }

        if (result.status === "ok" && result.project) {
          adopt({ project: result.project, segments: result.segments ?? segmentsRef.current });
        } else if (result.status !== "ok") {
          setSaveState("error");
          queueRef.current = [];
          await reload();
          return;
        }
      }
      setSaveState("saved");
    } catch {
      setSaveState("error");
      queueRef.current = [];
      await reload();
    } finally {
      inFlightRef.current = false;
      if (queueRef.current.length) void drain();
    }
  }, [projectId, adopt, reload]);

  const enqueue = useCallback(
    (op: EditOp, immediate: boolean) => {
      // Coalesce repeated debounced ops for the same target.
      if (DEBOUNCED_OPS.has(op.op)) {
        const segmentId = (op.payload as { segment_id?: string }).segment_id;
        queueRef.current = queueRef.current.filter(
          (queued) =>
            !(
              queued.op === op.op &&
              (queued.payload as { segment_id?: string }).segment_id === segmentId &&
              (queued.payload as { scope?: string }).scope === (op.payload as { scope?: string }).scope
            ),
        );
      }
      queueRef.current.push(op);
      setSaveState("saving");
      if (flushTimerRef.current) window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = window.setTimeout(() => void drain(), immediate ? 0 : 500);
    },
    [drain],
  );

  /** Public mutation entry point — optimistic UI first, then autosave. */
  const runOp = useCallback(
    (op: EditOp, options?: { record?: boolean; immediate?: boolean; label?: string }) => {
      const before = segmentsRef.current;
      const beforeProject = projectRef.current;

      if (op.op === "duplicate") {
        // Server assigns the new id — no reliable optimistic mirror.
        enqueue(op, true);
        return;
      }

      if (op.op === "set_meta") {
        if (beforeProject) {
          const next: EditProject = {
            ...beforeProject,
            export_settings: op.payload.export_settings ?? beforeProject.export_settings,
            text_layers: op.payload.text_layers ?? beforeProject.text_layers,
            music: op.payload.music !== undefined ? op.payload.music : beforeProject.music,
          };
          setProject(next);
          projectRef.current = next;
        }
      } else {
        const next = applyLocally(before, op);
        setSegments(next);
        segmentsRef.current = next;
      }

      if (options?.record !== false) {
        const undo = inverseOf(before, beforeProject, op);
        if (undo.length) {
          historyRef.current.past = [
            ...historyRef.current.past.slice(-49),
            { label: options?.label ?? op.op, undo, redo: [op] },
          ];
          historyRef.current.future = [];
          setHistoryVersion((v) => v + 1);
        }
      }
      enqueue(op, options?.immediate ?? !DEBOUNCED_OPS.has(op.op));
    },
    [enqueue],
  );

  /** Run a batch of ops as one undoable step. */
  const runOps = useCallback(
    (ops: EditOp[], options?: { label?: string; immediate?: boolean }) => {
      if (!ops.length) return;
      const before = segmentsRef.current;
      const beforeProject = projectRef.current;
      const undo = ops.flatMap((op) => inverseOf(before, beforeProject, op));
      ops.forEach((op) => runOp(op, { record: false, immediate: options?.immediate }));
      if (undo.length) {
        historyRef.current.past = [
          ...historyRef.current.past.slice(-49),
          { label: options?.label ?? ops[0].op, undo, redo: ops },
        ];
        historyRef.current.future = [];
        setHistoryVersion((v) => v + 1);
      }
    },
    [runOp],
  );

  /** Record one undoable step manually (used for continuous drags). */
  const recordHistory = useCallback((undoOp: EditOp, redoOp: EditOp, label?: string) => {
    historyRef.current.past = [
      ...historyRef.current.past.slice(-49),
      { label: label ?? redoOp.op, undo: [undoOp], redo: [redoOp] },
    ];
    historyRef.current.future = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const undo = useCallback(() => {
    const entry = historyRef.current.past.pop();
    if (!entry) return;
    historyRef.current.future = [entry, ...historyRef.current.future.slice(0, 49)];
    setHistoryVersion((v) => v + 1);
    entry.undo.forEach((op) => runOp(op, { record: false, immediate: true }));
  }, [runOp]);

  const redo = useCallback(() => {
    const entry = historyRef.current.future.shift();
    if (!entry) return;
    historyRef.current.past = [...historyRef.current.past.slice(-49), entry];
    setHistoryVersion((v) => v + 1);
    entry.redo.forEach((op) => runOp(op, { record: false, immediate: true }));
  }, [runOp]);

  /* --------------------------- adjustment helpers --------------------------- */

  const adjust = useCallback(
    (
      segmentId: string,
      patch: Record<string, unknown>,
      scope: "clip" | "all" = "clip",
      options?: { immediate?: boolean; record?: boolean; label?: string },
    ) => {
      runOp({ op: "adjust", payload: { segment_id: segmentId, adjustments: patch, scope } }, options);
    },
    [runOp],
  );

  const resetAdjust = useCallback(
    (segmentId: string | undefined, scope: "clip" | "all") => {
      runOp({ op: "reset_adjust", payload: { segment_id: segmentId, scope } }, { immediate: true });
    },
    [runOp],
  );

  const setExportSettings = useCallback(
    (settings: ExportSettings) => {
      runOp({ op: "set_meta", payload: { export_settings: settings } }, { label: "export settings" });
    },
    [runOp],
  );

  const setTextLayers = useCallback(
    (layers: TextLayer[], label = "text layers", immediate = false) => {
      runOp({ op: "set_meta", payload: { text_layers: layers } }, { label, immediate });
    },
    [runOp],
  );

  const setMusic = useCallback(
    (music: MusicTrack | null, label = "music") => {
      runOp({ op: "set_meta", payload: { music } }, { label });
    },
    [runOp],
  );

  const active = useMemo(() => activeSegments(segments), [segments]);
  const unused = useMemo(() => removedSegments(segments), [segments]);
  const durationMs = useMemo(() => totalDurationMs(segments), [segments]);

  useEffect(() => {
    if (selectedId && active.some((segment) => segment.id === selectedId)) return;
    setSelectedId(active[0]?.id ?? null);
  }, [active, selectedId]);

  return {
    project,
    segments,
    active,
    unused,
    durationMs,
    loading,
    loadError,
    saveState,
    selectedId,
    setSelectedId,
    runOp,
    runOps,
    recordHistory,
    adjust,
    resetAdjust,
    setExportSettings,
    setTextLayers,
    setMusic,
    reload,
    undo,
    redo,
    canUndo: historyRef.current.past.length > 0,
    canRedo: historyRef.current.future.length > 0,
    historyVersion,
    clipDurationMs,
  };
}
