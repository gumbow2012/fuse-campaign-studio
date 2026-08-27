import Navbar from "@/components/Navbar";
import SiteIntelligence from "@/components/admin/SiteIntelligence";
import LiveAnalytics from "@/components/admin/LiveAnalytics";

/**
 * /admin/analytics — FUSE LIVE.
 * Built entirely on the current data model (analytics_events + admin RPCs).
 * The legacy analytics-platform edge function is intentionally not used.
 */
const AdminAnalytics = () => (
  <div className="min-h-screen bg-background">
    <Navbar />
    <div className="container mx-auto px-6 pb-16 pt-24">
      <h1 className="mb-1 font-display text-3xl font-black text-foreground">FUSE Live Analytics</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Real-time platform activity, generation health and funnel — measured data only.
      </p>

      <LiveAnalytics />
      <SiteIntelligence />
    </div>
  </div>
);

export default AdminAnalytics;
