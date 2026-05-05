import React from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import TeamsHomePage    from './pages/teams/TeamsHomePage.jsx';
import CreateOrgPage    from './pages/teams/CreateOrgPage.jsx';
import OrgPortalPage    from './pages/teams/OrgPortalPage.jsx';
import OrgJoinPage      from './pages/teams/OrgJoinPage.jsx';
import OrgDashboardPage from './pages/teams/OrgDashboardPage.jsx';
import OrgSettingsPage  from './pages/teams/OrgSettingsPage.jsx';

function GradientOrbs() {
    return (
        <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
            <div className="orb orb-1" style={{ top: 0, left: 0 }} />
            <div className="orb orb-2" style={{ bottom: 0, right: 0 }} />
            <div className="orb orb-3" style={{ top: '35%', right: '8%' }} />
        </div>
    );
}

export default function TeamsApp() {
    return (
        <>
            <GradientOrbs />
            <div style={{ position: 'relative', zIndex: 1 }}>
                <Routes>
                    <Route path="/"                element={<TeamsHomePage />} />
                    <Route path="/new"             element={<CreateOrgPage />} />
                    <Route path="/:slug"           element={<OrgPortalPage />} />
                    <Route path="/:slug/join"      element={<OrgJoinPage />} />
                    <Route path="/:slug/dashboard" element={<OrgDashboardPage />} />
                    <Route path="/:slug/settings"  element={<OrgSettingsPage />} />
                    <Route path="*"                element={<TeamsHomePage />} />
                </Routes>
            </div>
        </>
    );
}
