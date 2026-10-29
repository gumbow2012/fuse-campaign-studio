import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import RefUploader from "./RefUploader";
import type { DirectorWorld } from "@/lib/campaign-director/types";

type Props = {
  world: DirectorWorld;
  onChange: (world: DirectorWorld) => void;
};

const LOCKS: { key: keyof Pick<DirectorWorld, "characterLock" | "scaleRule" | "styleLock" | "productSpec" | "reflectiveLook" | "avoid">; label: string }[] = [
  { key: "characterLock", label: "Character lock (repeated in every prompt)" },
  { key: "scaleRule", label: "Height / scale rule" },
  { key: "styleLock", label: "3D style lock" },
  { key: "productSpec", label: "Universal product package (only the artwork changes)" },
  { key: "reflectiveLook", label: "Reflective-background look" },
  { key: "avoid", label: "Never do" },
];

export default function WorldPanel({ world, onChange }: Props) {
  const set = <K extends keyof DirectorWorld>(key: K, value: DirectorWorld[K]) => onChange({ ...world, [key]: value });

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="cd-world-name">World</Label>
          <Input id="cd-world-name" value={world.name} onChange={(e) => set("name", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="cd-char-name">Character called, in prompts</Label>
          <Input id="cd-char-name" value={world.characterName} onChange={(e) => set("characterName", e.target.value)} />
        </div>
      </div>

      <RefUploader
        title="Master character references"
        hint="Your best frames of him. The first two go with every shot. Add a close-up and a full-body so face and height stay locked."
        kind="character"
        refs={world.characters}
        max={4}
        onChange={(refs) => set("characters", refs)}
      />
      <RefUploader
        title="Look references (approved frames)"
        hint="One frame that sets the 3D look, lighting and world quality."
        kind="style"
        refs={world.styleRefs}
        max={3}
        onChange={(refs) => set("styleRefs", refs)}
      />
      <RefUploader
        title="Reflective-background references"
        hint="Frames where the environment's light reflects off the pouch and skin (like the fire scene). Used only on shots flagged reflective."
        kind="reflective"
        refs={world.reflectiveRefs}
        max={2}
        onChange={(refs) => set("reflectiveRefs", refs)}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="space-y-1">
          <Label>Frame</Label>
          <Select value={world.aspectRatio} onValueChange={(v) => set("aspectRatio", v as DirectorWorld["aspectRatio"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="9:16">9:16 vertical</SelectItem>
              <SelectItem value="16:9">16:9 wide</SelectItem>
              <SelectItem value="1:1">1:1 square</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Still quality</Label>
          <Select value={world.imageResolution} onValueChange={(v) => set("imageResolution", v as DirectorWorld["imageResolution"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1K">1K</SelectItem>
              <SelectItem value="2K">2K</SelectItem>
              <SelectItem value="4K">4K (double price)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Animation model</Label>
          <Select value={world.videoModel} onValueChange={(v) => set("videoModel", v as DirectorWorld["videoModel"])}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="kling-3.0-pro">Kling 3.0 Pro</SelectItem>
              <SelectItem value="kling-3.0-standard">Kling 3.0 Standard</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Seconds per clip</Label>
          <Select value={String(world.clipSeconds)} onValueChange={(v) => set("clipSeconds", Number(v))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="3">3 s</SelectItem>
              <SelectItem value="5">5 s</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Collapsible>
        <CollapsibleTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronDown className="h-4 w-4" /> Locks and rules (advanced)
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3 space-y-3">
          {LOCKS.map(({ key, label }) => (
            <div key={key} className="space-y-1">
              <Label>{label}</Label>
              <Textarea value={world[key]} rows={4} onChange={(e) => set(key, e.target.value)} />
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
