import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ClerkProvider, useUser, useSignUp, HandleSSOCallback } from '@clerk/react';
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
    const { isLoaded, isSignedIn } = useUser();
    const { signUp } = useSignUp();
    const [redirecting, setRedirecting] = React.useState(false);

    // Backup: if Clerk session activates but navigateToApp didn't fire
    React.useEffect(() => {
        if (isLoaded && isSignedIn && !redirecting) {
            setRedirecting(true);
            window.location.replace('/app');
        }
    }, [isLoaded, isSignedIn, redirecting]);

    const handleSignUp = () => {
        (async () => {
            try {
                if (signUp?.status === 'complete') {
                    await signUp.finalize();
                }
            } catch (e) {
                console.error('[Neurativo] SSO finalize error:', e);
            }
            // After finalize, session should be active — redirect
            window.location.replace('/app');
        })();
    };

    if (redirecting) {
        return null;
    }

    return (
        <HandleSSOCallback
            navigateToApp={({ decorateUrl }) => {
                // decorateUrl adds __clerk_db_jwt for proper cookie persistence
                setRedirecting(true);
                window.location.href = decorateUrl('/app');
            }}
            navigateToSignIn={() => {
                setRedirecting(true);
                window.location.replace('/');
            }}
            navigateToSignUp={handleSignUp}
        />
    );
}

function ProtectedRoute({ children }) {
    const { isLoaded, isSignedIn } = useUser();
    const [waited, setWaited] = React.useState(false);

    React.useEffect(() => {
        // Give Clerk a moment to restore the session from cookies after page reload
        if (isLoaded && !isSignedIn && !waited) {
            const t = setTimeout(() => setWaited(true), 1500);
            return () => clearTimeout(t);
        }
    }, [isLoaded, isSignedIn, waited]);

    if (!isLoaded) return null;
    if (isSignedIn) return children;
    // Don't redirect until we've waited for Clerk to settle
    if (!waited) return null;
    return <Navigate to="/" replace />;
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
