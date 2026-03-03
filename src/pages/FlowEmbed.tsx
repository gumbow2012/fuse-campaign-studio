import { useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2 } from "lucide-react";
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

  const flowUrl = flowId ? `https://app.weavy.ai/flow/${flowId}` : null;

  // Auto-open in new tab on mount
  useEffect(() => {
    if (flowUrl) {
      window.open(flowUrl, "_blank", "noopener,noreferrer");
    }
  }, [flowUrl]);

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
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-6 max-w-md px-6">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
          <ExternalLink className="w-6 h-6 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-lg font-semibold text-foreground">Flow opened in a new tab</h2>
          <p className="text-sm text-muted-foreground">
            The Weavy flow editor has been opened in a separate tab. If it didn't open automatically, click below.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <Button asChild>
            <a href={flowUrl!} target="_blank" rel="noopener noreferrer" className="gap-2">
              <ExternalLink className="w-4 h-4" />
              Open Flow Editor
            </a>
          </Button>
          <Button
            variant="ghost"
            onClick={() => navigate("/app/templates")}
            className="gap-1.5 text-muted-foreground"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Templates
          </Button>
        </div>
      </div>
    </div>
  );
};

export default FlowEmbed;
