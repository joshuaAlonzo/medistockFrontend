import { Redirect, Route, Switch, useLocation } from "wouter";
import { useAuth } from "./contexts/AuthContext";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TooltipProvider } from "./components/ui/tooltip";
import { Toaster } from "./components/ui/sonner";
import { AuthPage, ApiSettingsPage } from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import type { RoleName } from "./lib/pharmacyApi";

function Landing() {
  const { session, role } = useAuth();
  if (session && role) return <Redirect to={`/${role}`} />;
  if (session && !role) return <Redirect to="/login" />;
  return <Redirect to="/login" />;
}

function AuthRoute({ mode }: { mode: "login" | "signup" | "reset" }) {
  const { session, role } = useAuth();
  if (session && role) return <Redirect to={`/${role}`} />;
  return <AuthPage mode={mode} />;
}

function ProtectedDashboard({ requiredRole }: { requiredRole: RoleName }) {
  const { session, role } = useAuth();
  const [location] = useLocation();
  if (!session || !role) return <Redirect to="/login" />;
  if (role !== requiredRole) return <Redirect to={`/${role}`} />;
  return <DashboardPage key={`${requiredRole}-${location.split("/")[2] || "overview"}`} role={requiredRole} />;
}

function NotFoundRoute() {
  return <div className="settings-page"><section className="settings-card panel"><img src="/brand-icon.svg" width="46" alt="MediStock" /><h1>That page isn't here</h1><p>Use the workspace navigation or return to sign in.</p><a className="button button-green" href="/login">Go to sign in</a></section></div>;
}

function Router() {
  return <Switch>
    <Route path="/" component={Landing} />
    <Route path="/login"><AuthRoute mode="login" /></Route>
    <Route path="/signup"><AuthRoute mode="signup" /></Route>
    <Route path="/reset-password"><AuthRoute mode="reset" /></Route>
    <Route path="/settings"><ApiSettingsPage /></Route>
    <Route path="/admin"><ProtectedDashboard requiredRole="admin" /></Route>
    <Route path="/admin/:section"><ProtectedDashboard requiredRole="admin" /></Route>
    <Route path="/staff"><ProtectedDashboard requiredRole="staff" /></Route>
    <Route path="/staff/:section"><ProtectedDashboard requiredRole="staff" /></Route>
    <Route path="/customer"><ProtectedDashboard requiredRole="customer" /></Route>
    <Route path="/customer/:section"><ProtectedDashboard requiredRole="customer" /></Route>
    <Route component={NotFoundRoute} />
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
