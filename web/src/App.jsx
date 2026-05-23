import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar  from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import Chatbot from './components/ui/Chatbot';
import { Spinner } from './components/ui/index';
import AnnouncementDetailPage from './pages/AnnouncementDetailPage';


import { LoginPage, RegisterPage }        from './pages/AuthPages';
import ForgotPasswordPage                  from './pages/ForgotPassword';
import DashboardPage                       from './pages/DashboardPage';
import MapPage                             from './pages/MapPage';
import SchedulePage                        from './pages/SchedulePage';
import StudentMaterialsPage                from './pages/StudentMaterialsPage';
import StudentAssessmentsPage              from './pages/StudentAssessmentsPage';
import { NotificationsPage }             from './pages/SearchAndNotifications';
import { ProfilePage, AnnouncementsPage } from './pages/ProfileAndAnnouncements';
import {
  AdminDashboard,
  AdminUsers,
  AdminFloors,
  AdminSchedule,
  AdminNotifications,
  AdminAnnouncements,
} from './pages/admin/AdminPages';
import AdminRoomsPage from './pages/admin/AdminRoomsPage';
import MapEditorPage from './pages/admin/MapEditorPage';
import SemesterManagementPage from './pages/admin/SemesterManagementPage';
import ProfessorDashboard from './pages/ProfessorDashboard';
import ProfessorAssessmentsPage from './pages/ProfessorAssessmentsPage';
import './styles/variables.css';
import './styles/global.css';
import './styles/responsive.css';

function RequireAuth({ children }) {
  const { isAuthenticated, loading, initialized } = useAuth();
  if (!initialized || loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--navy-deep)' }}>
      <Spinner size="lg" />
    </div>
  );
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

function AppShell({ mapLayout = false }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  function handleMenuToggle() {
    if (window.innerWidth <= 768) setMobileOpen(p => !p);
    else setCollapsed(p => !p);
  }
  return (
    <div className="app-layout">
      <Navbar onMenuToggle={handleMenuToggle} />
      <div className="app-body">
        <Sidebar collapsed={collapsed} mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
        <main className={mapLayout ? 'main-content--map' : 'main-content'}
          style={{ flex:1, overflow: mapLayout ? 'hidden' : 'auto' }}>
          <Outlet />
        </main>
      </div>
      <Chatbot />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster position="top-right" toastOptions={{ duration:3500, style:{ fontSize:13 } }} />
        <Routes>
          {/* Public */}
          <Route path="/login"           element={<LoginPage />} />
          <Route path="/register"        element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/"                element={<Navigate to="/dashboard" replace />} />

          {/* Student + Professor shared routes */}
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/dashboard"     element={<DashboardPage />} />
            <Route path="/schedule"      element={<SchedulePage />} />
            <Route path="/materials"     element={<StudentMaterialsPage />} />
            <Route path="/assessments"  element={<StudentAssessmentsPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/announcements/:id" element={<AnnouncementDetailPage />} />
            <Route path="/profile"       element={<ProfilePage />} />
            <Route path="/professor"                    element={<ProfessorDashboard />} />
            <Route path="/professor/schedule"           element={<ProfessorDashboard />} />
            <Route path="/professor/students"           element={<ProfessorDashboard />} />
            <Route path="/professor/materials"          element={<ProfessorDashboard />} />
            <Route path="/professor/assessments"       element={<ProfessorAssessmentsPage />} />
            <Route path="/professor/messages"           element={<ProfessorDashboard />} />
            <Route path="/professor/office-hours"       element={<ProfessorDashboard />} />
            <Route path="/professor/change-history"     element={<ProfessorDashboard />} />
            <Route path="/professor/analytics"          element={<ProfessorDashboard />} />
            <Route path="/professor/attendance"         element={<ProfessorDashboard />} />
          </Route>

          {/* Map */}
          <Route element={<RequireAuth><AppShell mapLayout /></RequireAuth>}>
            <Route path="/map" element={<MapPage />} />
          </Route>

          {/* Admin only */}
<Route element={<RequireAuth><RequireAdmin><AppShell /></RequireAdmin></RequireAuth>}>
  <Route path="/admin"               element={<AdminDashboard />} />
  <Route path="/admin/users"         element={<AdminUsers />} />
  <Route path="/admin/floors"        element={<AdminFloors />} />
  <Route path="/admin/rooms"         element={<AdminRoomsPage />} />
  <Route path="/admin/map-editor"    element={<MapEditorPage />} />
  <Route path="/admin/semester"      element={<SemesterManagementPage />} />
  <Route path="/admin/schedule"      element={<AdminSchedule />} />
  <Route path="/admin/notifications" element={<AdminNotifications />} />
  <Route path="/admin/announcements" element={<AdminAnnouncements />} />
</Route>

          <Route path="*" element={
            <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', flexDirection:'column', gap:16 }}>
              <h1 style={{ fontSize:64, fontWeight:700, color:'var(--border)' }}>404</h1>
              <a href="/dashboard" className="btn btn--primary">Go home</a>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
