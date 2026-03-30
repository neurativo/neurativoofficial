/**
 * Axios instance pre-configured with:
 * - Auth interceptor: attaches Bearer token from active Clerk session
 * - 401 handler: signs out + redirects to /auth on expired/invalid token
 */
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app',
});

// Request: attach access token from active Clerk session
api.interceptors.request.use(async (config) => {
    const token = await window.Clerk?.session?.getToken();
    if (token) {
        config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

// Response: sign out + redirect on 401
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        if (error.response?.status === 401) {
            await window.Clerk?.signOut();
            window.location.href = '/auth';
        }
        return Promise.reject(error);
    }
);

export default api;
