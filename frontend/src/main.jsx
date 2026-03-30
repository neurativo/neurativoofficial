import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { ClerkProvider, useUser, useClerk, useSignIn, useSignUp } from '@clerk/react';
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
//
// Three paths to /app:
//   A) Clerk hard-redirects via window.location — normal flow, session in storage.
//   B) isSignedIn flips true in React context before the hard redirect fires.
//   C) Fallback: handleRedirectCallback creates the account (sign-up) but doesn't
//      call setActive() automatically. We detect createdSessionId on signUp/signIn
//      and call setActive() explicitly, then navigate client-side.
//
// Fallback: if nothing happens in 10 s, redirect to home.
function SSOCallback() {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useUser();
    const { signIn, isLoaded: signInLoaded } = useSignIn();
    const { signUp, isLoaded: signUpLoaded } = useSignUp();
    const navigate = useNavigate();
    const invoked = React.useRef(false);
    const activated = React.useRef(false);

    // Invoke handleRedirectCallback exactly once.
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

    // Path C: handleRedirectCallback created the account but didn't call setActive.
    // Detect createdSessionId on signUp or signIn and activate it manually.
    React.useEffect(() => {
        if (!signUpLoaded || !signInLoaded) return;
        if (isSignedIn || activated.current) return;

        const sessionId = signUp?.createdSessionId || signIn?.createdSessionId;
        if (!sessionId) return;

        activated.current = true;
        clerk.setActive({ session: sessionId })
            .then(() => navigate('/app', { replace: true }))
            .catch(() => navigate('/', { replace: true }));
    }, [signUpLoaded, signInLoaded, signUp?.createdSessionId, signIn?.createdSessionId, isSignedIn]); // eslint-disable-line react-hooks/exhaustive-deps

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
