import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ClerkProvider, useUser } from '@clerk/react';
import { AuthModalProvider } from './components/AuthModal.jsx';
import App from './App.jsx';
import Dashboard from './components/Dashboard.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LectureView from './pages/LectureView.jsx';
import ShareView from './pages/ShareView.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import TermsOfService from './pages/TermsOfService.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/AdminDashboard.jsx';
import AdminUsers from './pages/admin/AdminUsers.jsx';
import AdminUserDetail from './pages/admin/AdminUserDetail.jsx';
import AdminLectures from './pages/admin/AdminLectures.jsx';
import AdminLectureDetail from './pages/admin/AdminLectureDetail.jsx';
import AdminSessions from './pages/admin/AdminSessions.jsx';
import AdminSystem from './pages/admin/AdminSystem.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './index.css';

// Apply saved theme immediately (before first render to avoid flash)
if (localStorage.getItem('neurativo_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

// ─── Route guard ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
    const { isLoaded, isSignedIn } = useUser();
    if (!isLoaded) return null;
    if (!isSignedIn) return <Navigate to="/" replace />;
    return children;
}

// ─── Route tree ─────────────────────────────────────────────────────────────
function Root() {
    const { isLoaded, user: clerkUser } = useUser();

    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    return (
        <Routes>
            <Route path="/"               element={<LandingPage user={user} />} />
            <Route path="/share/:token"   element={<ShareView />} />
            <Route path="/terms"          element={<TermsOfService />} />
            <Route path="/privacy"        element={<PrivacyPolicy />} />

            <Route path="/app"     element={<ProtectedRoute><Dashboard user={user} /></ProtectedRoute>} />
            <Route path="/record"  element={<ProtectedRoute><App user={user} /></ProtectedRoute>} />
            <Route path="/lecture/:id" element={<ProtectedRoute><LectureView user={user} /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage user={user} /></ProtectedRoute>} />

            <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:userId" element={<AdminUserDetail />} />
                <Route path="lectures" element={<AdminLectures />} />
                <Route path="lectures/:lectureId" element={<AdminLectureDetail />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="system" element={<AdminSystem />} />
            </Route>

            <Route path="*" element={isLoaded ? <NotFoundPage /> : null} />
        </Routes>
    );
}

function GradientOrbs() {
    const { pathname } = useLocation();
    const appRoutes = ['/app', '/record', '/lecture', '/profile', '/admin'];
    if (!appRoutes.some(r => pathname.startsWith(r))) return null;
    return (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden' }}>
            <div className="orb orb-1" style={{ top: 0, left: 0 }} />
            <div className="orb orb-2" style={{ bottom: 0, right: 0 }} />
            <div className="orb orb-3" style={{ top: '35%', right: '8%' }} />
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ClerkProvider
                publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}
                afterSignOutUrl="/"
                signInUrl="https://accounts.neurativo.com/sign-in"
                signUpUrl="https://accounts.neurativo.com/sign-up"
                afterSignInUrl="/app"
                afterSignUpUrl="/app"
            >
            <BrowserRouter>
                <AuthModalProvider>
                    <ToastProvider>
                        <GradientOrbs />
                        <Root />
                    </ToastProvider>
                </AuthModalProvider>
            </BrowserRouter>
        </ClerkProvider>
    </React.StrictMode>
);
