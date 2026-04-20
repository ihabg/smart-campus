import React, { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar  from './components/layout/Navbar';
import Sidebar from './components/layout/Sidebar';
import { Spinner } from './components/ui/index';

// Pages
import { LoginPage, RegisterPage }        from './pages/AuthPages';
import DashboardPage                       from './pages/DashboardPage';
import MapPage                             from './pages/MapPage';
import SchedulePage                        from './pages/SchedulePage';
import { SearchPage, NotificationsPage }  from './pages/SearchAndNotifications';
import { ProfilePage, AnnouncementsPage } from './pages/ProfileAndAnnouncements';

// Admin pages
import {
  AdminDashboard, AdminUsers, AdminFloors,
  AdminSchedule, AdminNotifications,
} from './pages/admin/AdminPages';

import Chatbot from './components/ui/Chatbot';
import './styles/variables.css';
import './styles/global.css';

// ─── Protected route wrapper ──────────────────────────────────
function RequireAuth({ children }) {
  const { isAuthenticated, loading, initialized } = useAuth();
  if (!initialized || loading) return <div className="loading-screen"><Spinner size="lg" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return children;
}

// ─── Admin route wrapper ──────────────────────────────────────
function RequireAdmin({ children }) {
  const { isAdmin } = useAuth();
  if (!isAdmin) return <Navigate to="/dashboard" replace />;
  return children;
}

// ─── App shell layout (navbar + sidebar + content) ───────────
function AppShell({ mapLayout = false }) {
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggle = () => {
    if (window.innerWidth <= 768) {
      setSidebarOpen(o => !o);
    } else {
      setSidebarCollapsed(c => !c);
    }
  };

  return (
    <div className="app-layout">
      <Navbar onMenuToggle={handleToggle} />
      <div className="app-body">
        <Sidebar
          open={sidebarOpen}
          collapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
        />
        <main className={mapLayout ? 'main-content--map' : 'main-content'}>
          <Outlet />
        </main>
      </div>
      <Chatbot />
    </div>
  );
}

// ─── Root App ─────────────────────────────────────────────────
export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Toaster
          position="top-right"
          toastOptions={{
            duration: 3500,
            style: { fontSize: 13, fontFamily: 'IBM Plex Sans, sans-serif' },
          }}
        />
        <Routes>
          {/* Public */}
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/"         element={<Navigate to="/dashboard" replace />} />

          {/* Protected — standard layout */}
          <Route element={<RequireAuth><AppShell /></RequireAuth>}>
            <Route path="/dashboard"      element={<DashboardPage />} />
            <Route path="/schedule"       element={<SchedulePage />} />
            <Route path="/search"         element={<SearchPage />} />
            <Route path="/notifications"  element={<NotificationsPage />} />
            <Route path="/announcements"  element={<AnnouncementsPage />} />
            <Route path="/profile"        element={<ProfilePage />} />
          </Route>

          {/* Protected — map layout (full height, no scroll padding) */}
          <Route element={<RequireAuth><AppShell mapLayout /></RequireAuth>}>
            <Route path="/map" element={<MapPage />} />
          </Route>

          {/* Admin */}
          <Route element={<RequireAuth><RequireAdmin><AppShell /></RequireAdmin></RequireAuth>}>
            <Route path="/admin"                  element={<AdminDashboard />} />
            <Route path="/admin/users"            element={<AdminUsers />} />
            <Route path="/admin/floors"           element={<AdminFloors />} />
            <Route path="/admin/schedule"         element={<AdminSchedule />} />
            <Route path="/admin/notifications"    element={<AdminNotifications />} />
            <Route path="/admin/announcements"    element={<AnnouncementsPage />} />
          </Route>

          {/* 404 */}
          <Route path="*" element={
            <div className="loading-screen">
              <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: 48, fontWeight: 700, color: 'var(--border)' }}>404</h1>
                <p style={{ color: 'var(--text-muted)' }}>Page not found</p>
                <a href="/dashboard" className="btn btn--primary" style={{ marginTop: 16, display: 'inline-flex' }}>Go home</a>
              </div>
            </div>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
