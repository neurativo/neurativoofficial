import React, { useEffect, useState } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useClerk, useUser } from '@clerk/react';
import { adminApi } from '../../lib/adminApi.js';

const CSS = `
.adm-shell {
    display: flex;
    min-height: 100vh;
    background: #0a0a0a;
    color: #e8e8e8;
    font-family: 'Inter', system-ui, sans-serif;
}
.adm-sidebar {
    width: 220px;
    min-width: 220px;
    background: #0f0f0f;
    border-right: 1px solid #1e1e1e;
    display: flex;
    flex-direction: column;
    position: fixed;
    top: 0; left: 0; bottom: 0;
    z-index: 100;
}
.adm-logo {
    padding: 24px 20px 20px;
    border-bottom: 1px solid #1e1e1e;
}
.adm-logo-title {
    font-size: 15px;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.02em;
}
.adm-logo-badge {
    display: inline-block;
    margin-top: 4px;
    padding: 2px 8px;
    background: #7c3aed22;
    border: 1px solid #7c3aed55;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #a78bfa;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}
.adm-nav {
    flex: 1;
    padding: 12px 0;
    overflow-y: auto;
}
.adm-nav-section {
    padding: 8px 20px 4px;
    font-size: 10px;
    font-weight: 600;
    color: #555;
    letter-spacing: 0.1em;
    text-transform: uppercase;
}
.adm-nav a {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 9px 20px;
    font-size: 13.5px;
    color: #888;
    text-decoration: none;
    border-radius: 0;
    transition: color 0.15s, background 0.15s;
}
.adm-nav a:hover {
    color: #e8e8e8;
    background: #ffffff08;
}
.adm-nav a.active {
    color: #fff;
    background: #ffffff0f;
    border-left: 2px solid #7c3aed;
    padding-left: 18px;
}
.adm-nav a svg { opacity: 0.7; flex-shrink: 0; }
.adm-nav a.active svg { opacity: 1; }
.adm-sidebar-footer {
    padding: 16px 20px;
    border-top: 1px solid #1e1e1e;
    font-size: 12px;
    color: #555;
}
.adm-main {
    flex: 1;
    margin-left: 220px;
    display: flex;
    flex-direction: column;
    min-height: 100vh;
}
.adm-topbar {
    height: 56px;
    background: #0f0f0f;
    border-bottom: 1px solid #1e1e1e;
    display: flex;
    align-items: center;
    padding: 0 28px;
    gap: 12px;
    position: sticky; top: 0; z-index: 50;
}
.adm-topbar-title {
    flex: 1;
    font-size: 15px;
    font-weight: 600;
    color: #fff;
}
.adm-topbar-email {
    font-size: 12px;
    color: #555;
}
.adm-signout {
    padding: 6px 14px;
    background: transparent;
    border: 1px solid #2a2a2a;
    border-radius: 6px;
    color: #888;
    font-size: 12px;
    cursor: pointer;
    transition: border-color 0.15s, color 0.15s;
}
.adm-signout:hover { border-color: #555; color: #e8e8e8; }
.adm-content {
    flex: 1;
    padding: 28px;
    max-width: 1200px;
    width: 100%;
}
.adm-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    color: #555;
    font-size: 14px;
}
.adm-denied {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    gap: 12px;
}
.adm-denied h2 { color: #ef4444; font-size: 22px; }
.adm-denied p { color: #888; font-size: 14px; }
`;

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
    const [verified, setVerified] = useState(null); // null=loading, true=ok, false=denied

    useEffect(() => {
        if (!isLoaded) return;
        if (!isSignedIn) { navigate('/'); return; }
        adminApi.verify()
            .then(() => setVerified(true))
            .catch(() => setVerified(false));
    }, [isLoaded, isSignedIn]);

    if (!isLoaded || verified === null) {
        return (
            <div className="adm-loading">
                <style>{CSS}</style>
                Verifying admin access…
            </div>
        );
    }

    if (!verified) {
        return (
            <div className="adm-denied">
                <style>{CSS}</style>
                <h2>Access Denied</h2>
                <p>Your account does not have admin privileges.</p>
                <button className="adm-signout" onClick={() => navigate('/app')}>Back to App</button>
            </div>
        );
    }

    return (
        <div className="adm-shell">
            <style>{CSS}</style>
            <aside className="adm-sidebar">
                <div className="adm-logo">
                    <div className="adm-logo-title">Neurativo</div>
                    <span className="adm-logo-badge">Admin</span>
                </div>
                <nav className="adm-nav">
                    <div className="adm-nav-section">Management</div>
                    {NAV.map(({ to, label, end, icon }) => (
                        <NavLink key={to} to={to} end={end}>
                            {icon}{label}
                        </NavLink>
                    ))}
                </nav>
                <div className="adm-sidebar-footer">
                    {user?.primaryEmailAddress?.emailAddress}
                </div>
            </aside>

            <div className="adm-main">
                <header className="adm-topbar">
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
