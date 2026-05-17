/**
 * Admin API — thin wrapper around the /api/v1/admin/* endpoints.
 * All requests attach the Clerk Bearer token via window.Clerk.session.
 */
import axios from 'axios';

const BASE = `${import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app'}/api/v1/admin`;
const BETA_BASE = `${import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app'}/api/v1/beta`;
export const API_BASE = `${import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app'}/api/v1`;

async function _token() {
    return (await window.Clerk?.session?.getToken()) || '';
}

function _headers(token) {
    return { Authorization: `Bearer ${token}` };
}

async function _get(path, params = {}) {
    const token = await _token();
    const res = await axios.get(BASE + path, { params, headers: _headers(token) });
    return res.data;
}

async function _patch(path, body = {}) {
    const token = await _token();
    const res = await axios.patch(BASE + path, body, { headers: _headers(token) });
    return res.data;
}

async function _delete(path) {
    const token = await _token();
    const res = await axios.delete(BASE + path, { headers: _headers(token) });
    return res.data;
}

async function _post(path, params = {}) {
    const token = await _token();
    const res = await axios.post(BASE + path, {}, { params, headers: _headers(token) });
    return res.data;
}

async function _betaGet(path, params = {}) {
    const token = await _token();
    const res = await axios.get(BETA_BASE + path, { params, headers: _headers(token) });
    return res.data;
}

async function _betaPost(path, body = {}) {
    const token = await _token();
    const res = await axios.post(BETA_BASE + path, body, { headers: _headers(token) });
    return res.data;
}

export const adminApi = {
    verify:          ()                        => _get('/verify'),
    getStats:        ()                        => _get('/stats'),
    listUsers:       (p = {})                  => _get('/users', p),
    getUser:         (userId)                  => _get(`/users/${userId}`),
    updateUserPlan:  (userId, plan_tier)       => _patch(`/users/${userId}/plan`, { plan_tier }),
    deleteUser:      (userId)                  => _delete(`/users/${userId}`),
    suspendUser:     (userId)                  => _patch(`/users/${userId}/suspend`),
    unsuspendUser:   (userId)                  => _patch(`/users/${userId}/unsuspend`),
    listSessions:    (p = {})                  => _get('/sessions', p),
    listLectures:    (p = {})                  => _get('/lectures', p),
    getLecture:      (lectureId)               => _get(`/lectures/${lectureId}`),
    recomputeLecture: (lectureId)              => _post(`/lectures/${lectureId}/recompute`),
    deleteLecture:   (lectureId)               => _delete(`/lectures/${lectureId}`),
    triggerCleanup:  (days = 30)               => _post('/system/cleanup', { days }),
    getSystem:       ()                        => _get('/system'),
    getAuditLog:     (p = {})                  => _get('/audit-log', p),
    updatePlanLimits: (tier, limits)           => _patch('/system/limits', { tier, limits }),
    getAnalytics:    (p = {})                  => _get('/analytics', p),
    getCosts:        (p = {})                  => _get('/costs', p),
    getCostsSummary: (p = {})                  => _get('/costs/summary', p),
    getVisitAnalytics: (days = 30)             => _get('/analytics/visits', { days }),
    getCostsOverview:  (days = 30)             => _get('/costs/overview', { days }),
    getCostsPerUser:   (days = 30, page = 1, pageSize = 50) => _get('/costs/per-user', { days, page, page_size: pageSize }),
    getCostsBeta:      (days = 30)             => _get('/costs/beta', { days }),
    listAnnouncements:   ()                    => _get('/announcements'),
    createAnnouncement: async (body) => {
        const token = await _token();
        const res = await axios.post(BASE + '/announcements', body, { headers: _headers(token) });
        return res.data;
    },
    deleteAnnouncement:  (id)                  => _delete(`/announcements/${id}`),

    // Credits management
    getUserCredits:  (userId)     => _get(`/users/${userId}/credits`),
    adjustCredits: async (userId, body) => {
        const token = await _token();
        const res = await axios.post(BASE + `/users/${userId}/credits/adjust`, body, { headers: _headers(token) });
        return res.data;
    },
    setCredits: async (userId, body) => {
        const token = await _token();
        const res = await axios.post(BASE + `/users/${userId}/credits/set`, body, { headers: _headers(token) });
        return res.data;
    },
    setCreditsSubscription: async (userId, body) => {
        const token = await _token();
        const res = await axios.post(BASE + `/users/${userId}/credits/subscription`, body, { headers: _headers(token) });
        return res.data;
    },
};

/**
 * Beta program API helpers — use /api/v1/beta/admin/* endpoints.
 */
export const betaApi = {
    getBetaStatus:       ()                  => _betaGet('/admin/status'),
    toggleBeta:          (enabled)           => _betaPost('/admin/toggle', { enabled }),
    listBetaApplications: (status)           => _betaGet('/admin/applications', status ? { status } : {}),
    approveApplication:  (id)                => _betaPost(`/admin/applications/${id}/approve`),
    rejectApplication:   (id)                => _betaPost(`/admin/applications/${id}/reject`),
    listBetaFeedback:    (page = 1, pageSize = 20) => _betaGet('/admin/feedback', { page, page_size: pageSize }),
    getBetaStats:        ()                  => _betaGet('/admin/stats'),
};
