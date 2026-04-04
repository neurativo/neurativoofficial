/**
 * Admin API — thin wrapper around the /api/v1/admin/* endpoints.
 * All requests attach the Clerk Bearer token via window.Clerk.session.
 */
import axios from 'axios';

const BASE = `${import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app'}/api/v1/admin`;

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

export const adminApi = {
    verify:          ()                        => _get('/verify'),
    getStats:        ()                        => _get('/stats'),
    listUsers:       (p = {})                  => _get('/users', p),
    getUser:         (userId)                  => _get(`/users/${userId}`),
    updateUserPlan:  (userId, plan_tier)       => _patch(`/users/${userId}/plan`, { plan_tier }),
    deleteUser:      (userId)                  => _delete(`/users/${userId}`),
    listSessions:    (p = {})                  => _get('/sessions', p),
    listLectures:    (p = {})                  => _get('/lectures', p),
    getLecture:      (lectureId)               => _get(`/lectures/${lectureId}`),
    deleteLecture:   (lectureId)               => _delete(`/lectures/${lectureId}`),
    triggerCleanup:  (days = 30)               => _post('/system/cleanup', { days }),
    getSystem:       ()                        => _get('/system'),
    getCosts:        (p = {})                  => _get('/costs', p),
    getCostsSummary: (p = {})                  => _get('/costs/summary', p),
};
