import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
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
import { ToastProvider } from './components/Toast.jsx';
import './index.css';

// Apply saved theme immediately (before first render to avoid flash)
if (localStorage.getItem('neurativo_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

function SSOCallback() {
    const navigate = useNavigate();
    const { isLoaded, isSignedIn } = useUser();
    // Set to true when HandleSSOCallback calls navigateToApp/navigateToSignUp,
    // meaning finalize() completed and setActive() was called.
    const [clerkDone, setClerkDone] = React.useState(false);

    // Only navigate once BOTH conditions are met:
    //   1. Clerk's finalize() called navigateToApp (session established in memory)
    //   2. isSignedIn is true in React state (setActive propagated)
    // This prevents navigating before the session is ready AND prevents Clerk
    // from falling back to a hard window.location redirect (no-ops cause that).
    React.useEffect(() => {
        if (clerkDone && isLoaded && isSignedIn) {
            navigate('/app', { replace: true });
        }
    }, [clerkDone, isLoaded, isSignedIn, navigate]);

    return (
        <HandleSSOCallback
            navigateToApp={() => setClerkDone(true)}
            navigateToSignIn={() => navigate('/', { replace: true })}
            navigateToSignUp={() => setClerkDone(true)}
        />
    );
}

function ProtectedRoute({ children }) {
    const { isLoaded, isSignedIn } = useUser();
    if (!isLoaded) return null;
    if (!isSignedIn) return <Navigate to="/" replace />;
    return children;
}

function Root() {
    const { isLoaded, user: clerkUser } = useUser();

    // Normalize Clerk user to the shape the rest of the app expects
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;

    return (
        <Routes>
            {/* Public — render immediately, no Clerk load dependency */}
            <Route path="/" element={<LandingPage user={user} />} />
            <Route path="/share/:token" element={<ShareView />} />
            <Route path="/terms" element={<TermsOfService />} />
            <Route path="/privacy" element={<PrivacyPolicy />} />

            {/* OAuth callback — MUST render before Clerk is loaded (Clerk processes handshake here) */}
            <Route path="/sso-callback" element={<SSOCallback />} />

            {/* Protected — ProtectedRoute waits for isLoaded internally */}
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

            {/* Fallback */}
            <Route path="*" element={isLoaded ? <NotFoundPage /> : null} />
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
