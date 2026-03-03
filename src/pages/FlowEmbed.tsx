import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, AlertTriangle } from "lucide-react";
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
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const flowUrl = flowId ? `https://app.weavy.ai/flow/${flowId}` : null;

  // Detect if iframe failed to load (X-Frame-Options / CSP block)
  useEffect(() => {
    const timer = setTimeout(() => {
      // If still loading after 5s, likely blocked
      if (loading) {
        setIframeBlocked(true);
        setLoading(false);
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  const handleIframeLoad = () => {
    // If the iframe loads, check if we can access it (same-origin only)
    try {
      const doc = iframeRef.current?.contentDocument;
      // If we can access the document, it loaded fine
      if (doc) {
        setLoading(false);
        setIframeBlocked(false);
      }
    } catch {
      // Cross-origin — iframe loaded successfully (we just can't access the DOM)
      setLoading(false);
      setIframeBlocked(false);
    }
  };

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

      {/* Iframe with blocked fallback overlay */}
      <div className="flex-1 relative">
        {iframeBlocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="text-center space-y-5 max-w-sm px-6">
              <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold text-foreground">
                  Unable to embed flow
                </h2>
                <p className="text-sm text-muted-foreground">
                  This flow can't be displayed inline. Open it in a new tab to continue editing.
                </p>
              </div>
              <Button asChild>
                <a href={flowUrl!} target="_blank" rel="noopener noreferrer" className="gap-2">
                  <ExternalLink className="w-4 h-4" />
                  Open in New Tab
                </a>
              </Button>
            </div>
          </div>
        )}

        <iframe
          ref={iframeRef}
          src={flowUrl!}
          className="w-full h-full border-0"
          allow="clipboard-read; clipboard-write; fullscreen"
          title="Weavy Flow"
          onLoad={handleIframeLoad}
          onError={() => {
            setIframeBlocked(true);
            setLoading(false);
          }}
        />
      </div>
    </div>
  );
};

export default FlowEmbed;
