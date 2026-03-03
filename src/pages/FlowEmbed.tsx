import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

const ALLOWED_FLOW_IDS = new Set([
  "dvgEXt4aeShCeokMq5MIpZ",
  "8pyXqysncP9g3L2ic8Nob8",
  "pqLsbL5ZJ8tlBCf3rH8eL1",
  "3XW2sv5u2GVW2V1HVtGjL0",
  "P9KHisYdvYAfWpunm3Qlme",
  "yRblK7UvAxiaRjEw9blCJz",
  "86BheMWSbZTZbjUrTRHY7o",
  "EtWKBYSzByNh548YHW4JQe",
  "itkxIO30C0huXXMrsYEwaN",
  "slqi1gyGckjLnKfun8FIiS",
  "RkWlfogU1nhPSxKqDHXOjE",
  "xeKqScADHcfDu54ofVVujY",
  "VFCSb8jQZrVYqhqkwQSc5g",
]);

const FlowEmbed = () => {
  const { flowId } = useParams<{ flowId: string }>();
  const navigate = useNavigate();

  if (!flowId || !ALLOWED_FLOW_IDS.has(flowId)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-muted-foreground">Invalid or unsupported flow ID.</p>
          <Button variant="outline" onClick={() => navigate("/app/templates")}>
            <ArrowLeft className="w-4 h-4 mr-2" /> Back to Templates
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex flex-col bg-background">
      {/* Minimal top bar */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-border/40 bg-background/80 backdrop-blur-sm shrink-0">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate("/app/templates")}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Button>
      </div>

      {/* Full-screen iframe */}
      <iframe
        src={`https://app.weavy.ai/flow/${flowId}`}
        className="flex-1 w-full border-0"
        allow="clipboard-read; clipboard-write; fullscreen"
        title="Weavy Flow"
      />
    </div>
  );
};

export default FlowEmbed;
