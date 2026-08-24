import { ScrollArea } from "@/components/ui/scroll-area";
import PresetLibrarySection from "./PresetLibrarySection";
import {
  FULL_LIBRARY,
  FULL_LIBRARY_CATEGORIES,
} from "@/lib/cinema/presets/libraryAdapters";
import type { ConfigSource, DirectorConfig, DirectorConfigField } from "@/lib/cinema/types";

export interface FullPresetPanelProps {
  config: DirectorConfig;
  updateField: (field: DirectorConfigField, value: unknown, source?: ConfigSource) => void;
}

/**
 * Combination (full director) presets — curated builtin CODE setups plus the
 * user's own saved full setups, with partial application per category.
 */
export default function FullPresetPanel({ config, updateField }: FullPresetPanelProps) {
  return (
    <ScrollArea className="max-h-[65vh] pr-3">
      <div className="space-y-4">
        <p className="text-[11px] text-muted-foreground">
          Full setups span camera, movement, lighting, color, optics and atmosphere. Apply the
          whole look or only one department — your manual edits are kept unless you choose to
          overwrite them.
        </p>
        <PresetLibrarySection
          type="full"
          builtin={FULL_LIBRARY}
          categories={FULL_LIBRARY_CATEGORIES}
          config={config}
          updateField={updateField}
          saveLabel="Save Full Director preset"
        />
      </div>
    </ScrollArea>
  );
}
