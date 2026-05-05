/**
 * Teams API client — same Clerk auth interceptor as api.js
 */
import axios from 'axios';

const teamsApi = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app',
});

teamsApi.interceptors.request.use(async (config) => {
    const token = await window.Clerk?.session?.getToken();
    if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
}, (error) => Promise.reject(error));

teamsApi.interceptors.response.use(
    (r) => r,
    async (error) => {
        if (error.response?.status === 401) {
            await window.Clerk?.signOut();
            window.location.href = '/';
        }
        return Promise.reject(error);
    }
);

// ── org ───────────────────────────────────────────────────────────────────────
export const createOrg    = (data)         => teamsApi.post('/api/v1/teams/', data);
export const getOrgPublic = (slug)         => teamsApi.get(`/api/v1/teams/${slug}/public`);
export const getDashboard = (slug)         => teamsApi.get(`/api/v1/teams/${slug}/dashboard`);
export const updateOrg    = (slug, data)   => teamsApi.patch(`/api/v1/teams/${slug}`, data);
export const getMyOrg     = ()             => teamsApi.get('/api/v1/teams/me/org');

// ── invites ───────────────────────────────────────────────────────────────────
export const createInvite = (slug, data)   => teamsApi.post(`/api/v1/teams/${slug}/invites`, data);
export const listInvites  = (slug)         => teamsApi.get(`/api/v1/teams/${slug}/invites`);
export const revokeInvite = (slug, id)     => teamsApi.delete(`/api/v1/teams/${slug}/invites/${id}`);

// ── join ──────────────────────────────────────────────────────────────────────
export const joinOrg      = (token)        => teamsApi.post('/api/v1/teams/join', { token });

// ── members ───────────────────────────────────────────────────────────────────
export const updateMember = (slug, id, data) => teamsApi.patch(`/api/v1/teams/${slug}/members/${id}`, data);

// ── superadmin ────────────────────────────────────────────────────────────────
export const adminListOrgs   = ()              => teamsApi.get('/api/v1/teams/');
export const adminGetOrg     = (slug)          => teamsApi.get(`/api/v1/teams/${slug}/admin`);
export const adminUpdateOrg  = (slug, params)  => teamsApi.patch(`/api/v1/teams/${slug}/admin`, {}, { params });

export default teamsApi;
