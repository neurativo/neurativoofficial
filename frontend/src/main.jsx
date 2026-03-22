import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import App from './App.jsx';
import AuthScreen from './components/AuthScreen.jsx';
import Dashboard from './components/Dashboard.jsx';
import LandingPage from './pages/LandingPage.jsx';
import LectureView from './pages/LectureView.jsx';
import ShareView from './pages/ShareView.jsx';
import ProfilePage from './pages/ProfilePage.jsx';
import { ToastProvider } from './components/Toast.jsx';
import { supabase } from './lib/supabase.js';
import './index.css';

// Apply saved theme immediately (before first render to avoid flash)
if (localStorage.getItem('neurativo_theme') === 'dark') {
    document.documentElement.classList.add('dark');
}

function ProtectedRoute({ children, user }) {
    if (user === undefined) return null; // still loading
    if (!user) return <Navigate to="/auth" replace />;
    return children;
}

function Root() {
    const [user, setUser] = useState(undefined); // undefined = loading
    const navigate = useNavigate();

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            const nextUser = session?.user ?? null;
            setUser(nextUser);
            if (!nextUser) {
                const path = window.location.pathname;
                if (path === '/app' || path === '/record' || path.startsWith('/lecture/') || path === '/profile') {
                    navigate('/auth', { replace: true });
                }
            }
        });

        return () => subscription.unsubscribe();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (user === undefined) return null;

    return (
        <Routes>
            {/* Public */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={user ? <Navigate to="/app" replace /> : <AuthScreen />} />
            <Route path="/share/:token" element={<ShareView />} />

            {/* Protected */}
            <Route
                path="/app"
                element={
                    <ProtectedRoute user={user}>
                        <Dashboard user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/record"
                element={
                    <ProtectedRoute user={user}>
                        <App user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/lecture/:id"
                element={
                    <ProtectedRoute user={user}>
                        <LectureView user={user} />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/profile"
                element={
                    <ProtectedRoute user={user}>
                        <ProfilePage user={user} />
                    </ProtectedRoute>
                }
            />

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
        <BrowserRouter>
            <ToastProvider>
                <Root />
            </ToastProvider>
        </BrowserRouter>
    </React.StrictMode>
);
