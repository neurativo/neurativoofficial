import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ClerkProvider, useUser, useSession } from '@clerk/react';
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
import AdminCosts from './pages/admin/AdminCosts.jsx';
import AdminAnalytics from './pages/admin/AdminAnalytics.jsx';
import AdminAnnouncements from './pages/admin/AdminAnnouncements.jsx';
import AdminTeams from './pages/admin/AdminTeams.jsx';
import AdminTeamDetail from './pages/admin/AdminTeamDetail.jsx';
import AdminBeta from './pages/admin/AdminBeta.jsx';
import AdminBilling from './pages/admin/AdminBilling.jsx';
import AdminFeedback from './pages/admin/AdminFeedback.jsx';
import AdminFeatureFlags from './pages/admin/AdminFeatureFlags.jsx';
import AdminReleases from './pages/admin/AdminReleases.jsx';
import AdminFinancials from './pages/admin/AdminFinancials.jsx';
import FeedbackWidget from './components/FeedbackWidget.jsx';
import WhatsNewModal from './components/WhatsNewModal.jsx';
import { FeatureFlagsProvider } from './lib/featureFlags.jsx';
import CreditsPage from './pages/CreditsPage.jsx';
import FeaturesPage from './pages/FeaturesPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import FAQPage from './pages/FAQPage.jsx';
import AboutPage from './pages/AboutPage.jsx';
import { ToastProvider } from './components/Toast.jsx';
import TeamsApp from './TeamsApp.jsx';
import './index.css';

const IS_TEAMS_DOMAIN =
    window.location.hostname === 'teams.neurativo.com' ||
    window.location.hostname.startsWith('teams.');

// Apply saved theme immediately (before first render to avoid flash)
if (localStorage.getItem('neurativo_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

// PWA install prompt — capture before it disappears
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window._pwaInstallPrompt = e;
});

// ─── Session heartbeat ───────────────────────────────────────────────────────
// Calls session.touch() every 30 minutes while the tab is open.
// This resets Clerk's inactivity timer so users aren't logged out
// during a normal study session without needing Clerk Pro settings.
function SessionHeartbeat() {
    const { session } = useSession();
    React.useEffect(() => {
        if (!session) return;
        // Touch immediately on mount (handles "came back after a while" case)
        session.touch().catch(() => {});
        const id = setInterval(() => {
            session.touch().catch(() => {});
        }, 30 * 60 * 1000); // every 30 minutes
        return () => clearInterval(id);
    }, [session?.id]);
    return null;
}

// ─── Section pages — /features, /pricing etc → full landing page + scroll ────
// Renders the actual LandingPage so Google indexes real content at each URL.
// Scrolls to the matching section after mount (instant, no flash).
function SectionRedirect({ sectionId }) {
    const { isLoaded, user: clerkUser } = useUser();
    const user = isLoaded && clerkUser
        ? { id: clerkUser.id, email: clerkUser.primaryEmailAddress?.emailAddress }
        : null;
    React.useEffect(() => {
        const tryScroll = () => {
            const el = document.getElementById(sectionId);
            if (el) el.scrollIntoView({ behavior: 'instant' });
        };
        tryScroll();
        const t = setTimeout(tryScroll, 350);
        return () => clearTimeout(t);
    }, [sectionId]);
    return <LandingPage user={user} />;
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
            <Route path="/features"       element={<FeaturesPage />} />
            <Route path="/how-it-works"   element={<SectionRedirect sectionId="how-it-works" />} />
            <Route path="/pricing"        element={<PricingPage />} />
            <Route path="/faq"            element={<FAQPage />} />
            <Route path="/about"          element={<AboutPage />} />
            <Route path="/share/:token"   element={<ShareView />} />
            <Route path="/terms"          element={<TermsOfService />} />
            <Route path="/privacy"        element={<PrivacyPolicy />} />

            <Route path="/app"     element={<ProtectedRoute><FeatureFlagsProvider enabled={!!user}><Dashboard user={user} /><FeedbackWidget /><WhatsNewModal /></FeatureFlagsProvider></ProtectedRoute>} />
            <Route path="/record"  element={<ProtectedRoute><FeatureFlagsProvider enabled={!!user}><App user={user} /><FeedbackWidget /></FeatureFlagsProvider></ProtectedRoute>} />
            <Route path="/lecture/:id" element={<ProtectedRoute><FeatureFlagsProvider enabled={!!user}><LectureView user={user} /><FeedbackWidget /><WhatsNewModal /></FeatureFlagsProvider></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><FeatureFlagsProvider enabled={!!user}><ProfilePage user={user} /><FeedbackWidget /><WhatsNewModal /></FeatureFlagsProvider></ProtectedRoute>} />
            <Route path="/credits" element={<ProtectedRoute><FeatureFlagsProvider enabled={!!user}><CreditsPage /><FeedbackWidget /></FeatureFlagsProvider></ProtectedRoute>} />

            <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<AdminDashboard />} />
                <Route path="users" element={<AdminUsers />} />
                <Route path="users/:userId" element={<AdminUserDetail />} />
                <Route path="lectures" element={<AdminLectures />} />
                <Route path="lectures/:lectureId" element={<AdminLectureDetail />} />
                <Route path="costs" element={<AdminCosts />} />
                <Route path="sessions" element={<AdminSessions />} />
                <Route path="analytics" element={<AdminAnalytics />} />
                <Route path="announcements" element={<AdminAnnouncements />} />
                <Route path="beta" element={<AdminBeta />} />
                <Route path="system" element={<AdminSystem />} />
                <Route path="teams" element={<AdminTeams />} />
                <Route path="teams/:slug" element={<AdminTeamDetail />} />
                <Route path="billing"  element={<AdminBilling />} />
                <Route path="financials" element={<AdminFinancials />} />
                <Route path="feedback" element={<AdminFeedback />} />
                <Route path="feature-flags" element={<AdminFeatureFlags />} />
                <Route path="releases" element={<AdminReleases />} />
            </Route>

            <Route path="*" element={isLoaded ? <NotFoundPage /> : <Navigate to="/" replace />} />
        </Routes>
    );
}

function GradientOrbs() {
    const { pathname } = useLocation();
    const opacity = pathname.startsWith('/record') ? 0.4 : 1;
    return (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 9999, overflow: 'hidden', opacity }}>
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
                {IS_TEAMS_DOMAIN ? (
                    <ToastProvider>
                        <TeamsApp />
                    </ToastProvider>
                ) : (
                    <AuthModalProvider>
                        <ToastProvider>
                            <SessionHeartbeat />
                            <GradientOrbs />
                            <Root />
                        </ToastProvider>
                    </AuthModalProvider>
                )}
            </BrowserRouter>
        </ClerkProvider>
    </React.StrictMode>
);
