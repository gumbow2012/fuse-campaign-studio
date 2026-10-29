import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAMERA_KINDS, type CameraKind, type DirectorProject, type DirectorShot } from "@/lib/campaign-director/types";

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

type Props = {
  shot: DirectorShot;
  project: DirectorProject;
  onUpdateShot: (id: string, patch: Partial<DirectorShot>) => void;
  /** Fields the caller already shows itself. */
  skip?: ("title" | "action")[];
};

/** Every editable part of one shot. Shared by the script editor and the shot cards. */
export default function ShotFields({ shot, project, onUpdateShot, skip = [] }: Props) {
  const chosen = project.products.filter((p) => shot.productIds.includes(p.id));

  const toggleProduct = (id: string) => {
    const has = shot.productIds.includes(id);
    const productIds = has ? shot.productIds.filter((x) => x !== id) : [...shot.productIds, id].slice(0, 3);
    onUpdateShot(shot.id, {
      productIds,
      artistProductIds: shot.artistProductIds.filter((x) => productIds.includes(x)),
      productRole: productIds.length === 0 ? "none" : shot.productRole === "none" ? "secondary" : shot.productRole,
    });
  };
  const toggleArtist = (id: string) =>
    onUpdateShot(shot.id, {
      artistProductIds: shot.artistProductIds.includes(id) ? shot.artistProductIds.filter((x) => x !== id) : [...shot.artistProductIds, id],
    });

  return (
    <div className="space-y-3">
      {skip.includes("title") ? null : <Field label="Title"><Input value={shot.title} onChange={(e) => onUpdateShot(shot.id, { title: e.target.value })} /></Field>}
      <Field label="Camera">
        <Select value={shot.camera} onValueChange={(v) => onUpdateShot(shot.id, { camera: v as CameraKind })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CAMERA_KINDS.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
      </Field>
      <Field label="Setting"><Textarea rows={2} value={shot.setting} onChange={(e) => onUpdateShot(shot.id, { setting: e.target.value })} /></Field>
      {skip.includes("action") ? null : <Field label="Moment (one frozen frame)"><Textarea rows={2} value={shot.action} onChange={(e) => onUpdateShot(shot.id, { action: e.target.value })} /></Field>}
      <Field label="Lighting"><Input value={shot.lighting} onChange={(e) => onUpdateShot(shot.id, { lighting: e.target.value })} /></Field>
      <Field label="Also in frame"><Input value={shot.supporting} onChange={(e) => onUpdateShot(shot.id, { supporting: e.target.value })} /></Field>
      <Field label="The one movement for the clip"><Input value={shot.motion} onChange={(e) => onUpdateShot(shot.id, { motion: e.target.value })} /></Field>
      <div className="flex items-center justify-between">
        <Label className="text-xs">Reflective background look</Label>
        <Switch checked={shot.reflective} onCheckedChange={(v) => onUpdateShot(shot.id, { reflective: v })} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Products in this shot (max 3)</Label>
        <div className="flex flex-wrap gap-1.5">
          {project.products.map((p) => (
            <Button key={p.id} type="button" size="sm" variant={shot.productIds.includes(p.id) ? "default" : "outline"} className="h-7 text-xs" onClick={() => toggleProduct(p.id)}>
              {p.name}
            </Button>
          ))}
        </div>
      </div>
      {chosen.length > 0 ? (
        <>
          <Field label="Product role">
            <Select value={shot.productRole} onValueChange={(v) => onUpdateShot(shot.id, { productRole: v as DirectorShot["productRole"] })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hero">Hero (large, readable)</SelectItem>
                <SelectItem value="secondary">Secondary</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <div className="space-y-1">
            <Label className="text-xs">Artist appears as a character</Label>
            <div className="flex flex-wrap gap-1.5">
              {chosen.map((p) => (
                <Button key={p.id} type="button" size="sm" variant={shot.artistProductIds.includes(p.id) ? "default" : "outline"} className="h-7 text-xs" onClick={() => toggleArtist(p.id)}>
                  {p.artist || p.name}
                </Button>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
