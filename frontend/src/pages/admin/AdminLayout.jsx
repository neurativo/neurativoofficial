import React, { useEffect, useState, useRef } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/react';
import { adminApi, feedbackApi } from '../../lib/adminApi.js';
import './admin.css';

// ── Nav groups ────────────────────────────────────────────────────────────────
const NAV_GROUPS = [
    {
        label: 'Management',
        items: [
            { to: '/admin', label: 'Dashboard', end: true, icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
                    <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
                </svg>
            )},
            { to: '/admin/users', label: 'Users', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                </svg>
            )},
            { to: '/admin/lectures', label: 'Lectures', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
            )},
            { to: '/admin/sessions', label: 'Sessions', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
                </svg>
            )},
            { to: '/admin/teams', label: 'Teams', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
                    <line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>
                </svg>
            )},
        ],
    },
    {
        label: 'Monetization',
        items: [
            { to: '/admin/billing', label: 'Billing', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/>
                    <line x1="1" y1="10" x2="23" y2="10"/>
                </svg>
            )},
            { to: '/admin/financials', label: 'Financials', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="22,7 13.5,15.5 8.5,10.5 2,17"/><polyline points="16,7 22,7 22,13"/>
                </svg>
            )},
            { to: '/admin/costs', label: 'Costs', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                </svg>
            )},
        ],
    },
    {
        label: 'Product',
        items: [
            { to: '/admin/feature-flags', label: 'Feature Flags', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
                    <line x1="4" y1="22" x2="4" y2="15"/>
                </svg>
            )},
            { to: '/admin/releases', label: "What's New", icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12,2 15.09,8.26 22,9.27 17,14.14 18.18,21.02 12,17.77 5.82,21.02 7,14.14 2,9.27 8.91,8.26"/>
                </svg>
            )},
            { to: '/admin/announcements', label: 'Announcements', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/>
                    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
            )},
            { to: '/admin/feedback', label: 'Feedback', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
            ), badge: true },
            { to: '/admin/beta', label: 'Beta', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/>
                </svg>
            )},
        ],
    },
    {
        label: 'Operations',
        items: [
            { to: '/admin/analytics', label: 'Analytics', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
                    <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
            )},
            { to: '/admin/system', label: 'System', icon: (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
                </svg>
            )},
        ],
    },
];

// Flat list → path-to-label map for topbar
const PATH_LABELS = {};
NAV_GROUPS.forEach(g => g.items.forEach(item => {
    PATH_LABELS[item.to] = item.label;
}));

function getPageLabel(pathname) {
    if (pathname === '/admin') return 'Dashboard';
    // Try exact match first, then prefix
    const exact = PATH_LABELS[pathname];
    if (exact) return exact;
    // detail pages
    if (pathname.startsWith('/admin/users/')) return 'User Detail';
    if (pathname.startsWith('/admin/lectures/')) return 'Lecture Detail';
    if (pathname.startsWith('/admin/teams/')) return 'Team Detail';
    return '';
}

// ── Bottom nav items (mobile only) ────────────────────────────────────────────
const BOTTOM_NAV = [
    { to: '/admin', label: 'Dashboard', end: true, icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
    )},
    { to: '/admin/users', label: 'Users', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    )},
    { to: '/admin/sessions', label: 'Sessions', icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12,6 12,12 16,14"/>
        </svg>
    )},
    { to: '/admin/feedback', label: 'Feedback', badge: true, icon: (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
    )},
];

// ── Component ─────────────────────────────────────────────────────────────────
export default function AdminLayout() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { signOut } = useClerk();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const [verified, setVerified]             = useState(null);
    const [sidebarOpen, setSidebarOpen]       = useState(false);
    const [feedbackUnread, setFeedbackUnread] = useState(0);
    const touchStartX = useRef(0);
    const touchStartY = useRef(0);

    // Inject admin-scoped PWA manifest while admin panel is mounted
    useEffect(() => {
        const link = document.createElement('link');
        link.rel = 'manifest';
        link.href = '/admin.webmanifest';
        link.id = 'admin-manifest';
        // Remove any existing manifest so admin one takes precedence
        document.querySelectorAll('link[rel="manifest"]').forEach(el => el.remove());
        document.head.appendChild(link);
        return () => {
            link.remove();
            // Restore main app manifest on unmount
            const restore = document.createElement('link');
            restore.rel = 'manifest';
            restore.href = '/site.webmanifest';
            document.head.appendChild(restore);
        };
    }, []);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) { navigate('/'); return; }
        adminApi.verify()
            .then(() => {
                setVerified(true);
                feedbackApi.unreadCount()
                    .then(r => setFeedbackUnread(r.count || 0))
                    .catch(() => {});
            })
            .catch(() => setVerified(false));
    }, [isLoaded, isSignedIn]);

    const closeSidebar = () => setSidebarOpen(false);
    const pageLabel = getPageLabel(pathname);

    // Swipe to open/close sidebar
    const handleTouchStart = (e) => {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
    };
    const handleTouchEnd = (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        const dy = e.changedTouches[0].clientY - touchStartY.current;
        if (Math.abs(dx) < Math.abs(dy) * 1.2) return; // mostly vertical — ignore
        if (!sidebarOpen && touchStartX.current < 32 && dx > 56) setSidebarOpen(true);
        if (sidebarOpen && dx < -56) setSidebarOpen(false);
    };

    if (!isLoaded || verified === null) {
        return <div className="adm-loading">Verifying admin access…</div>;
    }

    if (!verified) {
        return (
            <div className="adm-denied">
                <h2>Access Denied</h2>
                <p>Your account does not have admin privileges.</p>
                <button className="adm-btn-ghost" style={{ marginTop: 8 }} onClick={() => navigate('/app')}>
                    Back to App
                </button>
            </div>
        );
    }

    return (
        <div
            className="adm-shell"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            {/* Mobile overlay */}
            <div className={`adm-overlay${sidebarOpen ? ' open' : ''}`} onClick={closeSidebar} />

            <aside className={`adm-sidebar${sidebarOpen ? ' open' : ''}`}>
                <div className="adm-logo">
                    <div className="adm-logo-title">Neurativo</div>
                    <span className="adm-logo-badge">Admin</span>
                    <button className="adm-close-sidebar" onClick={closeSidebar} aria-label="Close menu">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                    </button>
                </div>

                <nav className="adm-nav">
                    {NAV_GROUPS.map(group => (
                        <React.Fragment key={group.label}>
                            <div className="adm-nav-section">{group.label}</div>
                            {group.items.map(({ to, label, end, icon, badge }) => (
                                <NavLink key={to} to={to} end={end} onClick={closeSidebar}>
                                    {icon}
                                    {label}
                                    {badge && feedbackUnread > 0 && (
                                        <span className="adm-nav-badge">{feedbackUnread}</span>
                                    )}
                                </NavLink>
                            ))}
                        </React.Fragment>
                    ))}
                </nav>

                <div className="adm-sidebar-footer">
                    <div className="adm-sidebar-footer-email">
                        {user?.primaryEmailAddress?.emailAddress}
                    </div>
                    <div className="adm-sidebar-footer-actions">
                        <button className="adm-sidebar-footer-btn" onClick={() => navigate('/app')}>
                            ← Back to App
                        </button>
                        <button className="adm-sidebar-footer-btn adm-sidebar-footer-signout"
                            onClick={() => signOut(() => navigate('/'))}>
                            Sign Out
                        </button>
                    </div>
                </div>
            </aside>

            <div className="adm-main">
                <header className="adm-topbar">
                    <button className="adm-hamburger" onClick={() => setSidebarOpen(o => !o)} aria-label="Open menu">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>

                    <div className="adm-topbar-breadcrumb">
                        <span className="adm-topbar-title">Neurativo</span>
                        {pageLabel && (
                            <>
                                <span className="adm-topbar-sep">/</span>
                                <span className="adm-topbar-page">{pageLabel}</span>
                            </>
                        )}
                    </div>

                    <span className="adm-topbar-email">{user?.primaryEmailAddress?.emailAddress}</span>
                    <button className="adm-signout adm-signout-desktop" onClick={() => signOut(() => navigate('/'))}>
                        Sign Out
                    </button>
                </header>

                <div className="adm-content">
                    <Outlet />
                </div>
            </div>

            {/* Bottom nav — mobile only */}
            <nav className="adm-bottom-nav">
                {BOTTOM_NAV.map(({ to, label, end, icon, badge }) => (
                    <NavLink key={to} to={to} end={end} className="adm-bottom-nav-item">
                        <span className="adm-bottom-nav-icon">
                            {icon}
                            {badge && feedbackUnread > 0 && (
                                <span className="adm-bottom-nav-badge">{feedbackUnread > 9 ? '9+' : feedbackUnread}</span>
                            )}
                        </span>
                        <span className="adm-bottom-nav-label">{label}</span>
                    </NavLink>
                ))}
                <button className="adm-bottom-nav-item" onClick={() => setSidebarOpen(true)}>
                    <span className="adm-bottom-nav-icon">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </span>
                    <span className="adm-bottom-nav-label">More</span>
                </button>
            </nav>
        </div>
    );
}
