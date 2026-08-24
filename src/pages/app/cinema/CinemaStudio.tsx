import { useCallback, useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import CinemaComposer from "@/components/cinema/CinemaComposer";
import { SYSTEM_DEFAULT_CONFIG, applyDirectorProposal } from "@/lib/cinema/resolveConfig";
import type {
  ConfigSource,
  DirectorConfig,
  DirectorConfigField,
  PartialDirectorConfig,
} from "@/lib/cinema/types";

export default function CinemaStudio() {
  const [config, setConfig] = useState<DirectorConfig>(() => ({ ...SYSTEM_DEFAULT_CONFIG }));
  const [prompt, setPrompt] = useState("");
  const [advanced, setAdvanced] = useState(false);

  /** Panel edits are USER-sourced unless the panel reports another source. */
  const updateField = useCallback(
    <F extends DirectorConfigField>(
      field: F,
      value: DirectorConfig[F]["value"],
      source: ConfigSource = "USER",
    ) => {
      setConfig((prev) => ({ ...prev, [field]: { value, source } }));
    },
    [],
  );

  /** Director Agent proposals apply only where the field is not USER-sourced. */
  const onApplyDirectorProposal = useCallback((proposal: PartialDirectorConfig) => {
    setConfig((prev) => applyDirectorProposal(prev, proposal).config);
  }, []);

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
          onApplyDirectorProposal={onApplyDirectorProposal}
        />
      </section>
    </SiteShell>
  );
}
