import { describe, expect, it } from "vitest";
import { createEmptyProject } from "./defaults";
import { normalizeProject, normalizeShot } from "./state";
import { compileImageRequest, compileVideoRequest, isShotReadyForImage } from "./promptCompiler";
import { issueSummary, shotsFromScript, validateScript } from "./script";
import { estimateRun } from "./costEstimate";
import { friendlyError } from "./errors";
import { clipFileName, readyClips, segmentRows } from "./finalVideo";
import type { DirectorProduct, DirectorProject, DirectorShot } from "./types";

const product = (id: string, name: string): DirectorProduct => ({
  id,
  name,
  artist: `${name} Artist`,
  collab: "Collab",
  flavor: `${name} Flavor`,
  imageUrl: `https://cdn.test/${id}.png`,
});

function project(): DirectorProject {
  const p = createEmptyProject();
  p.world.name = "Test world";
  p.world.characters = [
    { id: "c1", url: "https://cdn.test/c1.png", kind: "character", label: "front" },
    { id: "c2", url: "https://cdn.test/c2.png", kind: "character", label: "full body" },
    { id: "c3", url: "https://cdn.test/c3.png", kind: "character", label: "third" },
  ];
  p.world.styleRefs = [
    { id: "s1", url: "https://cdn.test/s1.png", kind: "style", label: "street" },
    { id: "s2", url: "https://cdn.test/s2.png", kind: "style", label: "lab" },
  ];
  p.world.reflectiveRefs = [{ id: "r1", url: "https://cdn.test/r1.png", kind: "reflective", label: "flames" }];
  p.products = [product("a", "Alpha"), product("b", "Bravo"), product("c", "Charlie")];
  return p;
}

const shot = (over: Partial<DirectorShot> = {}): DirectorShot =>
  normalizeShot(
    {
      id: "s",
      index: 1,
      title: "Test",
      camera: "low angle",
      setting: "a sunny street",
      action: "He holds the pouch up to camera",
      motion: "slow push-in",
      ...over,
    },
    0,
  );

describe("normalizeProject", () => {
  it("fills every lock with defaults", () => {
    const p = normalizeProject({});
    expect(p.world.characterLock.length).toBeGreaterThan(40);
    expect(p.world.clipSeconds).toBe(3);
    expect(p.brief.shotCount).toBe(20);
  });
  it("drops refs and products without a real url", () => {
    const p = normalizeProject({
      world: { characters: [{ url: "not a url" }, { url: "https://x.test/a.png", label: "ok" }] },
      products: [{ name: "x", imageUrl: "nope" }],
    });
    expect(p.world.characters).toHaveLength(1);
    expect(p.products).toHaveLength(0);
  });
  it("clamps shot count", () => {
    expect(normalizeProject({ brief: { shotCount: 500 } }).brief.shotCount).toBe(40);
    expect(normalizeProject({ brief: { shotCount: 1 } }).brief.shotCount).toBe(4);
  });
});

describe("compileImageRequest", () => {
  it("sends only the master references capped at two, then this shot's product, then one style", () => {
    const p = project();
    const out = compileImageRequest(shot({ productIds: ["b"], productRole: "hero" }), p);
    expect(out.referenceUrls).toEqual([
      "https://cdn.test/c1.png",
      "https://cdn.test/c2.png",
      "https://cdn.test/b.png",
      "https://cdn.test/s1.png",
    ]);
  });
  it("never leaks other products into a single-product shot", () => {
    const p = project();
    const out = compileImageRequest(shot({ productIds: ["a"], productRole: "hero" }), p);
    expect(out.referenceUrls).toContain("https://cdn.test/a.png");
    expect(out.referenceUrls).not.toContain("https://cdn.test/b.png");
    expect(out.referenceUrls).not.toContain("https://cdn.test/c.png");
    expect(out.prompt).toContain("ONLY this design");
  });
  it("adds the reflective reference only when the shot is flagged", () => {
    const p = project();
    expect(compileImageRequest(shot(), p).referenceUrls).not.toContain("https://cdn.test/r1.png");
    const reflective = compileImageRequest(shot({ reflective: true }), p);
    expect(reflective.referenceUrls).toContain("https://cdn.test/r1.png");
    expect(reflective.prompt).toContain("REFLECTIVE-ENVIRONMENT");
  });
  it("uses the approved artist master render instead of re-reading the flat design", () => {
    const p = project();
    p.artistMasters = { a: "https://cdn.test/master-a.png" };
    const out = compileImageRequest(shot({ productIds: ["a"], artistProductIds: ["a"], productRole: "hero" }), p);
    expect(out.referenceUrls).toContain("https://cdn.test/master-a.png");
    expect(out.prompt).toContain("approved 3D render of the artist");
  });
  it("describes the artist as a separate physical character on first appearance", () => {
    const p = project();
    const out = compileImageRequest(shot({ productIds: ["a"], artistProductIds: ["a"], productRole: "hero" }), p);
    expect(out.prompt).toContain("SEPARATE physical 3D character");
  });
  it("repeats the character, scale and style locks in every prompt", () => {
    const p = project();
    const out = compileImageRequest(shot(), p);
    expect(out.prompt).toContain(p.world.characterLock);
    expect(out.prompt).toContain(p.world.scaleRule);
    expect(out.prompt).toContain(p.world.styleLock);
  });
  it("lets a manual override replace the compiled text but keeps the same references", () => {
    const p = project();
    const out = compileImageRequest(shot({ promptOverride: "custom words", productIds: ["c"] }), p);
    expect(out.prompt).toBe("custom words");
    expect(out.referenceUrls).toContain("https://cdn.test/c.png");
  });
});

describe("compileVideoRequest", () => {
  it("animates one motion and keeps a hero product unchanged", () => {
    const p = project();
    const s = shot({ productIds: ["a"], productRole: "hero", motion: "he raises the pouch toward camera" });
    s.image.url = "https://cdn.test/still.png";
    const out = compileVideoRequest(s, p.world);
    expect(out.prompt).toContain("PRIMARY MOTION (only this): he raises the pouch toward camera");
    expect(out.prompt).toContain("stays exactly as shown");
    expect(out.prompt).toContain("3 percent push-in");
    expect(out.imageUrl).toBe("https://cdn.test/still.png");
    expect(out.seconds).toBe(3);
  });
  it("makes artists move instead of freezing", () => {
    const p = project();
    const out = compileVideoRequest(shot({ productIds: ["a"], artistProductIds: ["a"] }), p.world);
    expect(out.prompt).toContain("small performance gestures");
  });
});

describe("shotsFromScript + validateScript", () => {
  const p = project();
  const goodShots = () =>
    shotsFromScript(
      [
        { title: "Open", camera: "wide establishing", setting: "street", action: "He walks out", motion: "walking", productIds: [] },
        { title: "A hero", camera: "macro product", setting: "car", action: "Pouch A in hand", motion: "push-in", productIds: ["a"], productRole: "hero" },
        { title: "Walk", camera: "rear tracking", setting: "dock", action: "He crosses", motion: "walk", productIds: [] },
        { title: "B hero", camera: "low angle", setting: "dock", action: "Pouch B raised", motion: "raise", productIds: ["b"], productRole: "hero" },
        { title: "Walk 2", camera: "drone wide", setting: "beach", action: "Crowd", motion: "dance", productIds: [] },
        { title: "C hero", camera: "hand interaction", setting: "table", action: "Pouch C handed over", motion: "hand", productIds: ["c"], productRole: "hero" },
      ],
      p.products,
    );

  it("accepts a well formed script", () => {
    const issues = validateScript(goodShots(), p.products, 6);
    expect(issueSummary(issues).errors).toBe(0);
  });
  it("drops product ids that are not in the ledger", () => {
    const shots = shotsFromScript([{ title: "x", action: "y", productIds: ["zzz", "a"] }], p.products);
    expect(shots[0].productIds).toEqual(["a"]);
  });
  it("errors when a product never gets a hero shot", () => {
    const shots = goodShots().filter((s) => !s.productIds.includes("c"));
    const issues = validateScript(shots, p.products);
    expect(issues.some((i) => i.level === "error" && i.message.includes("Charlie"))).toBe(true);
  });
  it("errors when more than three products share one shot", () => {
    const shots = goodShots();
    shots[0].productIds = ["a", "b", "c", "a"];
    expect(validateScript(shots, p.products).some((i) => i.level === "error" && i.message.includes("More than"))).toBe(true);
  });
  it("warns when products are in nearly every frame", () => {
    const shots = goodShots().map((s) => ({ ...s, productIds: ["a"], productRole: "hero" as const }));
    expect(validateScript(shots, p.products).some((i) => i.message.includes("reveals land"))).toBe(true);
  });
  it("warns on three identical cameras in a row", () => {
    const shots = goodShots().map((s) => ({ ...s, camera: "low angle" as const }));
    expect(validateScript(shots, p.products).some((i) => i.message.includes("in a row"))).toBe(true);
  });
  it("flags a shot that packs two moments together", () => {
    const shots = goodShots();
    shots[0].action = "He leaves the car and then he gives the product to the artist";
    expect(validateScript(shots, p.products).some((i) => i.message.includes("more than one moment"))).toBe(true);
  });
});

describe("readiness + cost", () => {
  it("blocks image generation without a master character reference", () => {
    const p = createEmptyProject();
    expect(isShotReadyForImage(shot(), p)).toContain("master character");
  });
  it("prices only shots that still need an image, never ones already done", () => {
    const p = project();
    p.shots = [shot({ id: "1" }), shot({ id: "2" }), shot({ id: "3" })];
    p.shots[1].image.url = "https://cdn.test/done.png";
    p.shots[1].status = "image_ready";
    const est = estimateRun(p, "images", { imageUsd: 0.15, videoUsdPerSecond: 0.112 });
    expect(est.count).toBe(2);
    expect(est.usd).toBe(0.3);
  });
  it("prices clips by seconds and only for approved stills", () => {
    const p = project();
    p.shots = [shot({ id: "1" }), shot({ id: "2" })];
    p.shots[0].status = "approved";
    p.shots[0].image.url = "https://cdn.test/a.png";
    const est = estimateRun(p, "videos", { imageUsd: 0.15, videoUsdPerSecond: 0.112 });
    expect(est.count).toBe(1);
    expect(est.usd).toBe(0.34);
  });
});

describe("shot qa", () => {
  it("defaults to unchecked and drops junk verdicts", () => {
    expect(normalizeShot({}, 0).qa).toEqual({ verdict: "", issues: [], checkedUrl: "" });
    const s = normalizeShot({ qa: { verdict: "maybe", issues: ["a", 3], checkedUrl: "u" } }, 0);
    expect(s.qa).toEqual({ verdict: "", issues: ["a"], checkedUrl: "u" });
  });
});

describe("product thumbnails", () => {
  it("keeps a valid thumbUrl and drops a bad one", () => {
    const p = normalizeProject({
      products: [
        { id: "a", imageUrl: "https://cdn.test/a.png", thumbUrl: "https://cdn.test/a-small.jpg" },
        { id: "b", imageUrl: "https://cdn.test/b.png", thumbUrl: "javascript:x" },
      ],
    });
    expect(p.products[0].thumbUrl).toBe("https://cdn.test/a-small.jpg");
    expect(p.products[1].thumbUrl).toBeUndefined();
  });
});

describe("plain prompt wording and friendly errors", () => {
  it("never puts the world or brand name into the image or video prompt", () => {
    const p = project();
    p.world.characterName = "the Spray Mafia protagonist";
    p.world.name = "Spray Mafia";
    const s = shot({ productIds: ["a"], productRole: "hero" });
    s.image.url = "https://cdn.test/still.png";
    expect(compileImageRequest(s, p).prompt).not.toMatch(/mafia/i);
    expect(compileVideoRequest(s, p.world).prompt).not.toMatch(/mafia|melt|locked/i);
  });

  it("turns a provider safety refusal into one plain sentence with no links", () => {
    const raw = 'fal queue result lookup failed: 422 {"type":"content_policy_violation","input":"https://x.supabase.co/a.png?token=SECRET"}';
    const msg = friendlyError(raw);
    expect(msg).toMatch(/safety check declined/i);
    expect(msg).not.toMatch(/token|SECRET|http/);
    expect(friendlyError("boom https://x.test/a?token=SECRET happened")).toBe("boom [link] happened");
  });
});

describe("final video helpers", () => {
  const withClip = (id: string, index: number, title: string, url: string) => {
    const s = shot({ id, index, title });
    s.video.url = url;
    return s;
  };
  const base = "https://x.supabase.co/storage/v1/object/public/fuse-assets/u1/campaign-director/p/";

  it("keeps finished clips in script order and skips shots without one", () => {
    const p = project();
    p.shots = [withClip("a", 1, "One", `${base}a.mp4`), shot({ id: "b", index: 2 }), withClip("c", 3, "Three", `${base}c.mp4?x=1`)];
    const clips = readyClips(p);
    expect(clips.map((c) => c.key)).toEqual(["u1/campaign-director/p/a.mp4", "u1/campaign-director/p/c.mp4"]);
  });

  it("first send puts every clip on the timeline; a later send only adds new ones off the timeline", () => {
    const p = project();
    p.shots = [withClip("a", 1, "One", `${base}a.mp4`), withClip("c", 3, "Three", `${base}c.mp4`)];
    const clips = readyClips(p);
    const first = segmentRows("proj", clips, 3);
    expect(first.map((r) => [r.position, r.on_timeline, r.trim_end_ms])).toEqual([[0, true, 3000], [1, true, 3000]]);

    p.shots.push(withClip("d", 4, "Four", `${base}d.mp4`));
    const later = segmentRows("proj", readyClips(p), 3, first.map((r) => r.source_path), 2);
    expect(later).toHaveLength(1);
    expect(later[0]).toMatchObject({ source_path: "u1/campaign-director/p/d.mp4", on_timeline: false, position: 2 });
  });

  it("names zip files by shot number and title", () => {
    expect(clipFileName(shot({ index: 3, title: "Secret Agent Inspection!" }))).toBe("03-secret-agent-inspection.mp4");
  });
});
