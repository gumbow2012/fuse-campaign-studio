import { useCallback, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import CinemaComposer from "@/components/cinema/CinemaComposer";
import { SYSTEM_DEFAULT_CONFIG } from "@/lib/cinema/resolveConfig";
import type { DirectorConfig, DirectorConfigField } from "@/lib/cinema/types";

export default function CinemaStudio() {
  const [config, setConfig] = useState<DirectorConfig>(() => ({ ...SYSTEM_DEFAULT_CONFIG }));
  const [prompt, setPrompt] = useState("");
  const [advanced, setAdvanced] = useState(false);

  /** Any panel edit becomes a USER-sourced value in the working DirectorConfig. */
  const updateField = useCallback(
    <F extends DirectorConfigField>(field: F, value: DirectorConfig[F]["value"]) => {
      setConfig((prev) => ({ ...prev, [field]: { value, source: "USER" } }));
    },
    [],
  );

  return (
    <SiteShell>
      <section className="container py-10">
        <CinemaComposer
          config={config}
          prompt={prompt}
          onPromptChange={setPrompt}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
          updateField={updateField}
        />
      </section>
    </SiteShell>
  );
}
