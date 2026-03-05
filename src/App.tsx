import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import RoleGuard from "@/components/RoleGuard";
import DashboardLayout from "@/components/DashboardLayout";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Privacy from "./pages/Privacy";
import Terms from "./pages/Terms";
import Dashboard from "./pages/Dashboard";
import Activities from "./pages/Activities";
import Pipeline from "./pages/Pipeline";
import Commissions from "./pages/Commissions";
import Goals from "./pages/Goals";
import FourOneOne from "./pages/FourOneOne";
import Reports from "./pages/Reports";
import AdminReports from "./pages/AdminReports";
import AgentProfile from "./pages/AgentProfile";
import Library from "./pages/Library";
import Submissions from "./pages/Submissions";
import CMABoss from "./pages/CMABoss";
import BusinessPlanning from "./pages/BusinessPlanning";
import CompanyBusinessPlanningPage from "./pages/CompanyBusinessPlanningPage";
import NotFound from "./pages/NotFound";
import AuthConfirm from "./pages/AuthConfirm";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import AccountSettings from "./pages/AccountSettings";
import ClientLogin from "./pages/client-portal/ClientLogin";
import ClientSignup from "./pages/client-portal/ClientSignup";
import ClientDashboard from "./pages/client-portal/ClientDashboard";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/auth/confirm" element={<AuthConfirm />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            
            {/* Client Portal Routes */}
            <Route path="/client-portal" element={<ClientDashboard />} />
            <Route path="/client-portal/login" element={<ClientLogin />} />
            <Route path="/client-portal/signup" element={<ClientSignup />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="submissions" element={<RoleGuard><Submissions /></RoleGuard>} />
              <Route path="activities" element={<RoleGuard><Activities /></RoleGuard>} />
              <Route path="pipeline" element={<RoleGuard><Pipeline /></RoleGuard>} />
              <Route path="commissions" element={<RoleGuard><Commissions /></RoleGuard>} />
              <Route path="goals" element={<Goals />} />
              <Route path="411" element={<FourOneOne />} />
              <Route path="reports" element={<Reports />} />
              <Route path="library" element={<RoleGuard><Library /></RoleGuard>} />
              <Route path="cma-boss" element={<RoleGuard><CMABoss /></RoleGuard>} />
              <Route path="business-planning" element={<BusinessPlanning />} />
              <Route path="settings" element={<AccountSettings />} />
              <Route path="admin" element={<RoleGuard allowedRoles={['admin', 'owner']} blockPlanning={false}><AdminReports /></RoleGuard>} />
              <Route path="admin/business-planning" element={<RoleGuard allowedRoles={['admin', 'owner']} blockPlanning={false}><CompanyBusinessPlanningPage /></RoleGuard>} />
              <Route path="admin/agent/:agentId" element={<RoleGuard allowedRoles={['admin', 'owner']} blockPlanning={false}><AgentProfile /></RoleGuard>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
