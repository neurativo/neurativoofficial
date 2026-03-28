import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, useUser, HandleSSOCallback } from '@clerk/react';
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
import AuthScreen from './components/AuthScreen.jsx';
import { ToastProvider } from './components/Toast.jsx';
import './index.css';

// Apply saved theme immediately (before first render to avoid flash)
if (localStorage.getItem('neurativo_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

function ProtectedRoute({ children }) {
    const { isLoaded, isSignedIn } = useUser();
    if (!isLoaded) return null;
    if (!isSignedIn) return <Navigate to="/auth" replace />;
    return children;
}

function Root() {
    const { isLoaded, isSignedIn, user: clerkUser } = useUser();

    if (!isLoaded) return null;

    // Normalize Clerk user to the shape the rest of the app expects
    const user = clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    return (
        <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage user={user} />} />
            <Route path="/auth/*" element={isSignedIn ? <Navigate to="/app" replace /> : <AuthScreen />} />
            <Route path="/share/:token" element={<ShareView />} />

            {/* Protected */}
            <Route
                path="/app"
                element={
                    <ProtectedRoute>
                        <Dashboard user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/record"
                element={
                    <ProtectedRoute>
                        <App user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/lecture/:id"
                element={
                    <ProtectedRoute>
                        <LectureView user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/profile"
                element={
                    <ProtectedRoute>
                        <ProfilePage user={user} />
                    </ProtectedRoute>
                }
            />

            {/* OAuth callback — Google redirects here after login */}
            <Route path="/sso-callback" element={<HandleSSOCallback />} />

            {/* Legal */}
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* Fallback */}
            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY} afterSignOutUrl="/">
            <BrowserRouter>
                <AuthModalProvider>
                    <ToastProvider>
                        <Root />
                    </ToastProvider>
                </AuthModalProvider>
            </BrowserRouter>
        </ClerkProvider>
    </React.StrictMode>
);
