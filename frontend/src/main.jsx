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
// Clerk encodes redirectUrlComplete (set during authenticateWithRedirect) into
// the OAuth state. handleRedirectCallback reads it, exchanges the code, calls
// setActive({ session }), then hard-redirects to that URL automatically.
//
// Three safety paths in case the hard redirect is slow or doesn't fire:
//   A) Clerk hard-redirect fires — session is in storage, ProtectedRoute passes.
//   B) isSignedIn flips in React context before the hard redirect fires.
//   C) handleRedirectCallback created the account (new sign-up) but setActive
//      wasn't called — we detect createdSessionId and activate explicitly.
//
// Fallback: redirect home after 10 s if nothing happens.
function SSOCallback() {
    const clerk = useClerk();
    const { isLoaded, isSignedIn } = useUser();
    const { signIn, isLoaded: signInLoaded } = useSignIn();
    const { signUp, isLoaded: signUpLoaded } = useSignUp();
    const navigate = useNavigate();
    const invoked = React.useRef(false);
    const activated = React.useRef(false);

    // Path A: invoke handleRedirectCallback exactly once.
    // redirectUrlComplete is in the OAuth state so no afterSignInUrl/afterSignUpUrl needed.
    React.useEffect(() => {
        if (invoked.current) return;
        invoked.current = true;
        clerk.handleRedirectCallback();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Path B: session appeared in context before hard redirect fired.
    React.useEffect(() => {
        if (isLoaded && isSignedIn) {
            navigate('/app', { replace: true });
        }
    }, [isLoaded, isSignedIn, navigate]);

    // Path C: new sign-up — account created but setActive not called automatically.
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
