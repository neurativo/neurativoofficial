import React from 'react';
import { Routes, Route } from 'react-router-dom';
import TeamsHomePage    from './pages/teams/TeamsHomePage.jsx';
import CreateOrgPage    from './pages/teams/CreateOrgPage.jsx';
import OrgPortalPage    from './pages/teams/OrgPortalPage.jsx';
import OrgJoinPage      from './pages/teams/OrgJoinPage.jsx';
import OrgDashboardPage from './pages/teams/OrgDashboardPage.jsx';
import OrgSettingsPage  from './pages/teams/OrgSettingsPage.jsx';

export default function TeamsApp() {
    return (
        <Routes>
            <Route path="/"              element={<TeamsHomePage />} />
            <Route path="/new"           element={<CreateOrgPage />} />
            <Route path="/:slug"         element={<OrgPortalPage />} />
            <Route path="/:slug/join"    element={<OrgJoinPage />} />
            <Route path="/:slug/dashboard" element={<OrgDashboardPage />} />
            <Route path="/:slug/settings"  element={<OrgSettingsPage />} />
            <Route path="*"              element={<TeamsHomePage />} />
        </Routes>
    );
}
