import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import CustomerRoute from "@/components/CustomerRoute";
import AdminRoute from "@/components/AdminRoute";
import Index from "./pages/Index";
import Pricing from "./pages/Pricing";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Billing from "./pages/Billing";
import Account from "./pages/Account";
import Admin from "./pages/Admin";
import AdminTemplates from "./pages/AdminTemplates";
import AdminTemplateImport from "./pages/AdminTemplateImport";
import Analytics from "./pages/Analytics";
import AdminAnalytics from "./pages/AdminAnalytics";
import CreatorAnalytics from "./pages/CreatorAnalytics";
import Referrals from "./pages/Referrals";
import TemplateLab from "./pages/TemplateLab";
import TemplateCanvas from "./pages/TemplateCanvas";
import FlowEmbed from "./pages/FlowEmbed";
import FlowTest from "./pages/FlowTest";
import NanoRun from "./pages/NanoRun";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Index />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/lab/paparazzi" element={<Navigate to="/lab/templates" replace />} />
            <Route path="/lab/templates" element={<TemplateLab />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

            {/* Protected routes */}
            <Route path="/dashboard" element={<CustomerRoute><Dashboard /></CustomerRoute>} />
            <Route path="/projects" element={<Navigate to="/app/templates/run" replace />} />
            <Route path="/projects/:projectId" element={<Navigate to="/app/templates/run" replace />} />
            <Route path="/billing" element={<CustomerRoute><Billing /></CustomerRoute>} />
            <Route path="/account" element={<CustomerRoute><Account /></CustomerRoute>} />

            <Route path="/analytics" element={<CustomerRoute><Analytics /></CustomerRoute>} />
            <Route path="/creator/analytics" element={<CustomerRoute><CreatorAnalytics /></CustomerRoute>} />
            <Route path="/referrals" element={<CustomerRoute><Referrals /></CustomerRoute>} />

            {/* Template run & job status */}
            <Route path="/app/templates" element={<CustomerRoute><TemplateLab /></CustomerRoute>} />
            <Route path="/app/templates/run" element={<CustomerRoute><TemplateLab /></CustomerRoute>} />
            <Route path="/app/templates/dvgEXt4aeShCeokMq5MIpZ/run" element={<CustomerRoute><TemplateLab /></CustomerRoute>} />
            <Route path="/app/templates/:slug" element={<CustomerRoute><TemplateLab /></CustomerRoute>} />
            <Route path="/app/flow/:flowId" element={<CustomerRoute><FlowEmbed /></CustomerRoute>} />
            <Route path="/app/flow-test" element={<FlowTest />} />
            <Route path="/app/jobs/:jobId" element={<CustomerRoute><TemplateLab /></CustomerRoute>} />
            <Route path="/app/lab/templates" element={<AdminRoute><TemplateLab /></AdminRoute>} />
            <Route path="/app/lab/canvas" element={<AdminRoute><TemplateCanvas /></AdminRoute>} />
            <Route path="/app/nano" element={<AdminRoute><NanoRun /></AdminRoute>} />

            {/* Admin routes */}
            <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
            <Route path="/admin/analytics" element={<AdminRoute><AdminAnalytics /></AdminRoute>} />
            <Route path="/admin/templates" element={<AdminRoute><AdminTemplates /></AdminRoute>} />
            <Route path="/admin/templates/import" element={<AdminRoute><AdminTemplateImport /></AdminRoute>} />

            <Route path="/upload" element={<Navigate to="/" replace />} />
            <Route path="/app/jobs" element={<Navigate to="/app/templates/run" replace />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
