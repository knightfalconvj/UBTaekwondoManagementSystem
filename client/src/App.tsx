import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { RegisterPage } from "./pages/RegisterPage";
import { DashboardPage } from "./pages/DashboardPage";
import { EventsPage } from "./pages/EventsPage";
import { TournamentsPage } from "./pages/TournamentsPage";
import { RankingsPage } from "./pages/RankingsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { AthletesPage } from "./pages/AthletesPage";
import { AthleteComparisonPage } from "./pages/AthleteComparisonPage";
import { ProfilePage } from "./pages/ProfilePage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { AttendanceDashboardPage } from "./pages/AttendanceDashboardPage";

function RequireAuth() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><div className="auth-card"><p>Loading...</p></div></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <Outlet />;
}

function PublicOnly() {
  const { user, loading } = useAuth();
  if (loading) return <div className="auth-page"><div className="auth-card"><p>Loading...</p></div></div>;
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicOnly />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route element={<Layout />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/events" element={<EventsPage />} />
              <Route path="/tournaments" element={<TournamentsPage />} />
              <Route path="/rankings" element={<RankingsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/athlete-comparison" element={<AthleteComparisonPage />} />
              <Route path="/athletes" element={<AthletesPage />} />
              <Route path="/attendance-dashboard" element={<AttendanceDashboardPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
