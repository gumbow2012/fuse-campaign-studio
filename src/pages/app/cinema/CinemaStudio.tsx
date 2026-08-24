import { useState } from "react";
import SiteShell from "@/components/mvp/SiteShell";
import CinemaComposer from "@/components/cinema/CinemaComposer";
import { SYSTEM_DEFAULT_CONFIG } from "@/lib/cinema/resolveConfig";
import type { DirectorConfig } from "@/lib/cinema/types";

export default function CinemaStudio() {
  const [config] = useState<DirectorConfig>(() => ({ ...SYSTEM_DEFAULT_CONFIG }));
  const [prompt, setPrompt] = useState("");
  const [advanced, setAdvanced] = useState(false);

  return (
    <SiteShell>
      <section className="container py-10">
        <CinemaComposer
          config={config}
          prompt={prompt}
          onPromptChange={setPrompt}
          advanced={advanced}
          onAdvancedChange={setAdvanced}
        />
      </section>
    </SiteShell>
  );
}
