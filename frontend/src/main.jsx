import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ClerkProvider, useUser, useClerk } from '@clerk/react';
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

// ─── OAuth callback page ────────────────────────────────────────────────────
// Strategy: call clerk.handleRedirectCallback() directly (no helper components).
// This is Clerk's own implementation — it exchanges the OAuth code, persists the
// session to storage, then navigates to afterSignInUrl / afterSignUpUrl.
//
// Two navigation paths:
//   A) Clerk hard-redirects to /app via window.location (the normal path).
//      Session is in storage by then so ProtectedRoute sees isSignedIn=true.
//   B) isSignedIn becomes true in React context before the hard redirect —
//      we catch this and navigate via React Router (no reload needed).
//
// Fallback: if nothing happens in 10 s, redirect to home.
function SSOCallback() {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useUser();
    const navigate = useNavigate();
    const invoked = React.useRef(false);

    // Invoke handleRedirectCallback exactly once.
    // If Clerk isn't loaded yet, the SDK queues the call internally and fires
    // it as soon as clerk-js finishes loading — no dep on clerk.loaded needed.
    React.useEffect(() => {
        if (invoked.current) return;
        invoked.current = true;
        clerk.handleRedirectCallback({
            afterSignInUrl: '/app',
            afterSignUpUrl: '/app',
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Path B: session appeared in context before hard redirect fired.
    React.useEffect(() => {
        if (isLoaded && isSignedIn) {
            navigate('/app', { replace: true });
        }
    }, [isLoaded, isSignedIn, navigate]);

    // Fallback: something went wrong, send user home after 10 s.
    React.useEffect(() => {
        const t = setTimeout(() => navigate('/', { replace: true }), 10000);
        return () => clearTimeout(t);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            fontFamily: 'Inter, -apple-system, sans-serif',
            color: '#888',
            fontSize: '14px',
        }}>
            Signing you in…
        </div>
    );
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
            <Route path="/sso-callback"   element={<SSOCallback />} />

            <Route path="/app"     element={<ProtectedRoute><Dashboard user={user} /></ProtectedRoute>} />
            <Route path="/record"  element={<ProtectedRoute><App user={user} /></ProtectedRoute>} />
            <Route path="/lecture/:id" element={<ProtectedRoute><LectureView user={user} /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage user={user} /></ProtectedRoute>} />

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
