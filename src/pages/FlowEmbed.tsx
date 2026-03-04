import { useState, useRef, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, ExternalLink, AlertTriangle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const CF_WORKER_URL = import.meta.env.VITE_CF_WORKER_URL as string | undefined || "https://shiny-rice-e95bfuse-api.kade-fc1.workers.dev";

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

  // Primary: direct Weavy URL. Fallback: proxy through CF Worker to strip X-Frame-Options.
  const directUrl = flowId ? `https://app.weavy.ai/flow/${flowId}` : null;
  const proxyUrl = flowId && CF_WORKER_URL
    ? `${CF_WORKER_URL.replace(/\/+$/, "")}/weavy/flow/${flowId}`
    : null;

  const [useProxy, setUseProxy] = useState(false);
  const flowUrl = useProxy ? proxyUrl : directUrl;

  // Detect if direct iframe failed to load (X-Frame-Options / CSP block)
  useEffect(() => {
    if (useProxy) return; // don't re-trigger when already on proxy
    const timer = setTimeout(() => {
      if (loading) {
        // Direct embed blocked — switch to CF Worker proxy
        if (proxyUrl) {
          setUseProxy(true);
          setLoading(true); // reset for proxy attempt
        } else {
          setIframeBlocked(true);
          setLoading(false);
        }
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [loading, useProxy, proxyUrl]);

  // If proxy also fails after 8s, show fallback
  useEffect(() => {
    if (!useProxy || !loading) return;
    const timer = setTimeout(() => {
      if (loading) {
        setIframeBlocked(true);
        setLoading(false);
      }
    }, 8000);
    return () => clearTimeout(timer);
  }, [useProxy, loading]);

  const handleIframeLoad = () => {
    setLoading(false);
    setIframeBlocked(false);
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
        {loading && !iframeBlocked && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {useProxy ? "Loading via proxy…" : "Connecting to flow editor…"}
              </p>
            </div>
          </div>
        )}

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
                <a href={directUrl!} target="_blank" rel="noopener noreferrer" className="gap-2">
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
