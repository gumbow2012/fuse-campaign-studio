import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import CustomerRoute from "@/components/CustomerRoute";
import AdminRoute from "@/components/AdminRoute";
import Admin from "@/pages/Admin";
import AdminAudits from "@/pages/AdminAudits";
import AdminAnalytics from "@/pages/AdminAnalytics";
import AdminTemplateImport from "@/pages/AdminTemplateImport";
import AdminTemplates from "@/pages/AdminTemplates";
import FlowEmbed from "@/pages/FlowEmbed";
import FlowTest from "@/pages/FlowTest";
import NanoRun from "@/pages/NanoRun";
import TemplateCanvas from "@/pages/TemplateCanvas";
import TemplateLab from "@/pages/TemplateLab";
import AboutPage from "@/pages/mvp/AboutPage";
import AccountPage from "@/pages/mvp/AccountPage";
import AuthPage from "@/pages/mvp/AuthPage";
import BillingPage from "@/pages/mvp/BillingPage";
import ContactPage from "@/pages/mvp/ContactPage";
import ForgotPasswordPage from "@/pages/mvp/ForgotPasswordPage";
import HomePage from "@/pages/mvp/HomePage";
import NotFoundPage from "@/pages/mvp/NotFoundPage";
import ResetPasswordPage from "@/pages/mvp/ResetPasswordPage";
import TemplateStudioPage from "@/pages/mvp/TemplateStudioPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/pricing" element={<BillingPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="/auth" element={<AuthPage />} />
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
              path="/billing"
              element={
                <CustomerRoute>
                  <BillingPage />
                </CustomerRoute>
              }
            />
            <Route
              path="/app/templates"
              element={
                <CustomerRoute>
                  <TemplateStudioPage />
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
            <Route path="/app/flow-test" element={<FlowTest />} />
            <Route
              path="/app/lab/templates"
              element={
                <AdminRoute>
                  <TemplateLab />
                </AdminRoute>
              }
            />
            <Route
              path="/app/lab/canvas"
              element={
                <AdminRoute>
                  <TemplateCanvas />
                </AdminRoute>
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

            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
