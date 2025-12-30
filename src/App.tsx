import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
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
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            }>
              <Route index element={<Dashboard />} />
              <Route path="activities" element={<Activities />} />
              <Route path="pipeline" element={<Pipeline />} />
              <Route path="commissions" element={<Commissions />} />
              <Route path="goals" element={<Goals />} />
              <Route path="411" element={<FourOneOne />} />
              <Route path="reports" element={<Reports />} />
              <Route path="submissions" element={<Submissions />} />
              <Route path="library" element={<Library />} />
              <Route path="admin" element={<AdminReports />} />
              <Route path="admin/agent/:agentId" element={<AgentProfile />} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
