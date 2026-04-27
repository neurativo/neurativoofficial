import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/react';
import { adminApi } from '../../lib/adminApi.js';
import './admin.css';

const NAV = [
    { to: '/admin', label: 'Dashboard', end: true, icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
        </svg>
    )},
    { to: '/admin/users', label: 'Users', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        </svg>
    )},
    { to: '/admin/lectures', label: 'Lectures', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
            <polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
        </svg>
    )},
    { to: '/admin/costs', label: 'Costs', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
        </svg>
    )},
    { to: '/admin/sessions', label: 'Sessions', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12,6 12,12 16,14"/>
        </svg>
    )},
    { to: '/admin/analytics', label: 'Analytics', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6" y1="20" x2="6" y2="14"/>
        </svg>
    )},
    { to: '/admin/announcements', label: 'Announcements', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3z"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
    )},
    { to: '/admin/system', label: 'System', icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="3"/>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
    )},
];

export default function AdminLayout() {
    const { isLoaded, isSignedIn, user } = useUser();
    const { signOut } = useClerk();
    const navigate = useNavigate();
    const [verified, setVerified] = useState(null);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) { navigate('/'); return; }
        adminApi.verify()
            .then(() => setVerified(true))
            .catch(() => setVerified(false));
    }, [isLoaded, isSignedIn]);

    // Close sidebar on route change
    const closeSidebar = () => setSidebarOpen(false);

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
        <div className="adm-shell">
            {/* Mobile overlay */}
            <div
                className={`adm-overlay${sidebarOpen ? ' open' : ''}`}
                onClick={closeSidebar}
            />

            <aside className={`adm-sidebar${sidebarOpen ? ' open' : ''}`}>
                <button className="adm-close-sidebar" onClick={closeSidebar} aria-label="Close menu">
                    ×
                </button>
                <div className="adm-logo">
                    <div className="adm-logo-title">Neurativo</div>
                    <span className="adm-logo-badge">Admin</span>
                </div>
                <nav className="adm-nav">
                    <div className="adm-nav-section">Management</div>
                    {NAV.map(({ to, label, end, icon }) => (
                        <NavLink key={to} to={to} end={end} onClick={closeSidebar}>
                            {icon}{label}
                        </NavLink>
                    ))}
                </nav>
                <div className="adm-sidebar-footer">
                    <div style={{ marginBottom: 8, fontSize: 12, color: '#6b6b6b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {user?.primaryEmailAddress?.emailAddress}
                    </div>
                    <div
                        style={{ cursor: 'pointer', color: '#c4c4c4', fontSize: 11, transition: 'color 0.15s' }}
                        onMouseEnter={e => e.currentTarget.style.color = '#6b6b6b'}
                        onMouseLeave={e => e.currentTarget.style.color = '#c4c4c4'}
                        onClick={() => navigate('/app')}
                    >
                        ← Back to App
                    </div>
                </div>
            </aside>

            <div className="adm-main">
                <header className="adm-topbar">
                    <button
                        className="adm-hamburger"
                        onClick={() => setSidebarOpen(o => !o)}
                        aria-label="Open menu"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="3" y1="6" x2="21" y2="6"/>
                            <line x1="3" y1="12" x2="21" y2="12"/>
                            <line x1="3" y1="18" x2="21" y2="18"/>
                        </svg>
                    </button>
                    <div className="adm-topbar-title">Admin Panel</div>
                    <span className="adm-topbar-email">{user?.primaryEmailAddress?.emailAddress}</span>
                    <button className="adm-signout" onClick={() => signOut(() => navigate('/'))}>
                        Sign Out
                    </button>
                </header>
                <div className="adm-content">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}
