import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BrandProvider } from "@/contexts/BrandContext";
import { StreakProvider } from "@/hooks/useStreak";
import { PageTracking } from "@/hooks/usePageTracking";
import { PageViewTracker } from "@/lib/analytics/usePageViews";
import CreditTopUpSuccessWatcher from "@/components/mvp/CreditTopUpSuccessWatcher";
import WelcomeActivationModal from "@/components/brand/WelcomeActivationModal";
import { useEffect } from "react";
import { captureUtmParams } from "@/lib/utmParams";



import { useBrandActivationReminders } from "@/hooks/useBrandActivationReminders";
import CustomerRoute from "@/components/CustomerRoute";
import BrandProfilesPage from "@/pages/BrandProfilesPage";
import BrandOnboardingPage from "@/pages/BrandOnboardingPage";
import AvatarProfilesPage from "@/pages/AvatarProfilesPage";

import AdminRoute from "@/components/AdminRoute";
import BuilderRoute from "@/components/BuilderRoute";
import CreatorRoute from "@/components/CreatorRoute";

import Admin from "@/pages/Admin";
import AdminAudits from "@/pages/AdminAudits";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminCreators from "@/pages/AdminCreators";
import AdminCreatorProgram from "@/pages/AdminCreatorProgram";
import AdminFuseCast from "@/pages/AdminFuseCast";
import AdminTemplateImport from "@/pages/AdminTemplateImport";
import AdminTemplateFactory from "@/pages/AdminTemplateFactory";
import AdminMerchandising from "@/pages/AdminMerchandising";
import AdminProductLaunchPrototype from "@/pages/AdminProductLaunchPrototype";


import AdminTemplates from "@/pages/AdminTemplates";
import FlowEmbed from "@/pages/FlowEmbed";

import GenerationStudio from "@/pages/GenerationStudio";
import CinemaStudio from "@/pages/app/cinema/CinemaStudio";
import CinemaControlLab from "@/pages/app/cinema/CinemaControlLab";
import MaddenMediaStudio from "@/pages/app/madden-media/MaddenMediaStudio";
import CreatorProfile from "@/pages/app/creator/CreatorProfile";
import CreatorDashboard from "@/pages/app/creator/CreatorDashboard";
import EditCreatorProfile from "@/pages/app/creator/EditCreatorProfile";

import OutfitSwap from "@/pages/OutfitSwap";
import JewelrySwap from "@/pages/JewelrySwap";
import NanoRun from "@/pages/NanoRun";
import TemplateCanvas from "@/pages/TemplateCanvas";
import TemplateLab from "@/pages/TemplateLab";
import AboutPage from "@/pages/mvp/AboutPage";
import AccountPage from "@/pages/mvp/AccountPage";
import DeveloperApiKeysPage from "@/pages/mvp/DeveloperApiKeysPage";
import AuthPage from "@/pages/mvp/AuthPage";
import ReferralCapturePage from "@/pages/mvp/ReferralCapturePage";
import BillingPage from "@/pages/mvp/BillingPage";
import MembershipPage from "@/pages/mvp/MembershipPage";
import ContactPage from "@/pages/mvp/ContactPage";
import FaqPage from "@/pages/mvp/FaqPage";
import TermsPage from "@/pages/mvp/TermsPage";
import PrivacyPage from "@/pages/mvp/PrivacyPage";
import CreatorProgramPage from "@/pages/mvp/CreatorProgramPage";
import CreatorApplyPage from "@/pages/mvp/CreatorApplyPage";
import CreatorsDirectoryPage from "@/pages/mvp/CreatorsDirectoryPage";
import ForgotPasswordPage from "@/pages/mvp/ForgotPasswordPage";
import HomePage from "@/pages/mvp/HomePage";
import NotFoundPage from "@/pages/mvp/NotFoundPage";
import ResetPasswordPage from "@/pages/mvp/ResetPasswordPage";
import TemplateStudioPage from "@/pages/mvp/TemplateStudioPage";
import CampaignLibraryPage from "@/pages/mvp/CampaignLibraryPage";
import CollectionsPage from "@/pages/mvp/CollectionsPage";
import PublicCollectionPage from "@/pages/mvp/PublicCollectionPage";
import NotificationsPage from "@/pages/mvp/NotificationsPage";
import CustomizeWorkflowPage from "@/pages/mvp/CustomizeWorkflowPage";
import ContestsPage from "@/pages/mvp/ContestsPage";
import Referrals from "@/pages/Referrals";

import CreatorOnboarding from "@/pages/app/creator/CreatorOnboarding";

const queryClient = new QueryClient();

/** Mounted once: creates deduplicated brand activation reminders. */
function BrandActivationReminders() {
  useBrandActivationReminders();
  return null;
}

function UtmCapture() {
  useEffect(() => {
    captureUtmParams();
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>

      <BrandProvider>
      <StreakProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <UtmCapture />
          <PageTracking />

          <PageViewTracker />
          <CreditTopUpSuccessWatcher />
          <BrandActivationReminders />
          <WelcomeActivationModal />
          

          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/pricing" element={<BillingPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/contests" element={<ContestsPage />} />
            <Route
              path="/referrals"
              element={
                <CustomerRoute>
                  <Referrals />
                </CustomerRoute>
              }
            />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/creators" element={<CreatorProgramPage />} />
            <Route path="/creators/browse" element={<CreatorsDirectoryPage />} />
            <Route path="/creators/apply" element={<CreatorApplyPage />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/join/:code" element={<ReferralCapturePage />} />
            <Route path="/r/:code" element={<ReferralCapturePage />} />
            <Route path="/c/:slug" element={<PublicCollectionPage />} />
            <Route
              path="/app/collections"
              element={
                <CustomerRoute>
                  <CollectionsPage />
                </CustomerRoute>
              }
            />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            <Route
              path="/account"
              element={
                <CustomerRoute>
                  <AccountPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/account/developer"
              element={
                <CustomerRoute>
                  <DeveloperApiKeysPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/brand"
              element={
                <CustomerRoute>
                  <BrandProfilesPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/brand/onboarding"
              element={
                <CustomerRoute>
                  <BrandOnboardingPage />
                </CustomerRoute>
              }
            />

            <Route
              path="/app/avatars"
              element={
                <CustomerRoute>
                  <AvatarProfilesPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/membership"
              element={
                <CustomerRoute>
                  <MembershipPage />
                </CustomerRoute>
              }
            />

            <Route path="/billing" element={<Navigate to="/pricing" replace />} />
            <Route path="/app/templates" element={<TemplateStudioPage />} />
            <Route
              path="/app/notifications"
              element={
                <CustomerRoute>
                  <NotificationsPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/campaigns"
              element={
                <CustomerRoute>
                  <CampaignLibraryPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/templates/customize/:forkId"
              element={
                <CustomerRoute>
                  <CustomizeWorkflowPage />
                </CustomerRoute>
              }
            />


            <Route path="/dashboard" element={<Navigate to="/app/templates" replace />} />
            <Route path="/templates" element={<Navigate to="/app/templates" replace />} />
            <Route path="/projects" element={<Navigate to="/app/templates" replace />} />
            <Route path="/projects/:projectId" element={<Navigate to="/app/templates" replace />} />
            <Route path="/app/jobs" element={<Navigate to="/app/templates" replace />} />
            <Route path="/app/jobs/:jobId" element={<Navigate to="/app/templates" replace />} />
            <Route path="/app/templates/run" element={<Navigate to="/app/templates" replace />} />
            <Route path="/app/templates/:slug" element={<Navigate to="/app/templates" replace />} />
            <Route path="/upload" element={<Navigate to="/" replace />} />

            <Route
              path="/app/flow/:flowId"
              element={
                <CustomerRoute>
                  <FlowEmbed />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/lab/templates"

              element={
                <BuilderRoute>
                  <TemplateLab />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/lab/canvas"
              element={
                <BuilderRoute>
                  <TemplateCanvas />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/lab/studio"
              element={
                <CustomerRoute>
                  <GenerationStudio />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/lab/cinema"
              element={
                <BuilderRoute>
                  <CinemaStudio />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/lab/cinema/control"
              element={
                <BuilderRoute>
                  <CinemaControlLab />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/lab/madden-media"
              element={
                <BuilderRoute>
                  <MaddenMediaStudio />
                </BuilderRoute>
              }
            />
            <Route

              path="/app/lab/outfit-swap"
              element={
                <BuilderRoute>
                  <OutfitSwap />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/lab/jewelry-swap"
              element={
                <BuilderRoute>
                  <JewelrySwap />
                </BuilderRoute>
              }
            />
            <Route
              path="/app/nano"
              element={
                <AdminRoute>
                  <NanoRun />
                </AdminRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/analytics"
              element={
                <AdminRoute>
                  <AdminAnalytics />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/templates"
              element={
                <AdminRoute>
                  <AdminTemplates />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/creators"
              element={
                <AdminRoute>
                  <AdminCreators />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/creator-program"
              element={
                <AdminRoute>
                  <AdminCreatorProgram />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/fuse-cast"
              element={
                <AdminRoute>
                  <AdminFuseCast />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/audits"
              element={
                <AdminRoute>
                  <AdminAudits />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/developer"
              element={
                <AdminRoute>
                  <AdminAudits />
                </AdminRoute>
              }
            />
            <Route
              path="/admin/templates/import"
              element={
                <AdminRoute>
                  <AdminTemplateImport />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/templates/merchandising"
              element={
                <AdminRoute>
                  <AdminMerchandising />
                </AdminRoute>
              }
            />

            <Route
              path="/admin/experiments/product-launch"
              element={
                <AdminRoute>
                  <AdminProductLaunchPrototype />
                </AdminRoute>
              }
            />


            <Route
              path="/admin/templates/factory"
              element={
                <AdminRoute>
                  <AdminTemplateFactory />
                </AdminRoute>
              }
            />



            <Route
              path="/app/creator"
              element={
                <CreatorRoute>
                  <CreatorDashboard />
                </CreatorRoute>
              }
            />
            <Route
              path="/app/creator/welcome"
              element={
                <CreatorRoute>
                  <CreatorOnboarding />
                </CreatorRoute>
              }
            />
            <Route path="/creator/settings/edit" element={<EditCreatorProfile />} />
            <Route path="/creator/:handle" element={<CreatorProfile />} />

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </StreakProvider>
      </BrandProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
