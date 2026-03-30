import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
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

// ─── Route guard ────────────────────────────────────────────────────────────
function ProtectedRoute({ children }) {
    const { isLoaded, isSignedIn } = useUser();
    const clerk = useClerk();
    if (!isLoaded) return null;
    if (!isSignedIn) {
        clerk.redirectToSignIn({ afterSignInUrl: window.location.pathname });
        return null;
    }
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
