/**
 * Creator builder tutorial state machine (presentation/education only).
 *
 * Tracks lesson progress, auto-advances when the creator really performs an
 * action, persists completion locally and fires non-PII analytics (never prompt
 * text, never uploaded assets).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@/lib/analytics/track";
import {
  CREATOR_TUTORIAL_LESSONS,
  CREATOR_TUTORIAL_TOTAL,
  type CreatorTutorialSignal,
} from "@/lib/creatorTutorial";

const DONE_KEY = "fuse_creator_tutorial_done";

export type CreatorTutorialState = {
  active: boolean;
  index: number;
  total: number;
  lesson: (typeof CREATOR_TUTORIAL_LESSONS)[number] | null;
  completedIds: string[];
  milestoneId: string | null;
  start: () => void;
  next: () => void;
  back: () => void;
  skip: () => void;
  signal: (event: CreatorTutorialSignal) => void;
};

export function useCreatorTutorial(enabled: boolean): CreatorTutorialState {
  const [active, setActive] = useState(false);
  const [index, setIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<string[]>([]);
  const [milestoneId, setMilestoneId] = useState<string | null>(null);
  const indexRef = useRef(0);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  const lesson = useMemo(
    () => (active ? CREATOR_TUTORIAL_LESSONS[index] ?? null : null),
    [active, index],
  );

  const complete = useCallback((at: number) => {
    const current = CREATOR_TUTORIAL_LESSONS[at];
    if (!current) return;
    setCompletedIds((ids) => (ids.includes(current.id) ? ids : [...ids, current.id]));
    if (current.event) track(current.event, { lesson: current.id });
    if (current.milestone) {
      setMilestoneId(current.id);
      window.setTimeout(() => setMilestoneId(null), 1600);
    }
  }, []);

  const advance = useCallback(
    (from: number) => {
      complete(from);
      if (from >= CREATOR_TUTORIAL_TOTAL - 1) {
        setActive(false);
        try {
          window.localStorage.setItem(DONE_KEY, "1");
        } catch {
          /* ignore */
        }
        track("creator_tutorial_completed", { lessons: CREATOR_TUTORIAL_TOTAL });
        return;
      }
      setIndex(from + 1);
    },
    [complete],
  );

  const start = useCallback(() => {
    if (!enabled) return;
    setIndex(0);
    setCompletedIds([]);
    setActive(true);
  }, [enabled]);

  const next = useCallback(() => advance(indexRef.current), [advance]);

  const back = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  const skip = useCallback(() => {
    track("creator_tutorial_skipped", { at_lesson: CREATOR_TUTORIAL_LESSONS[indexRef.current]?.id });
    setActive(false);
  }, []);

  const signal = useCallback(
    (event: CreatorTutorialSignal) => {
      if (!active) return;
      const current = CREATOR_TUTORIAL_LESSONS[indexRef.current];
      if (!current || current.advanceOn !== event) return;
      advance(indexRef.current);
    },
    [active, advance],
  );

  useEffect(() => {
    if (!enabled && active) setActive(false);
  }, [active, enabled]);

  return { active, index, total: CREATOR_TUTORIAL_TOTAL, lesson, completedIds, milestoneId, start, next, back, skip, signal };
}
