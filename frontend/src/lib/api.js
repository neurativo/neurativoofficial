/**
 * Axios instance pre-configured with:
 * - Auth interceptor: attaches Bearer token from active Clerk session
 * - 401 handler: retries once with fresh token (skipCache) before redirecting
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

// Response: on 401, retry once with a fresh token before redirecting.
// After idle time the cached Clerk JWT may have expired; getToken({skipCache:true})
// fetches a new one from Clerk's servers without requiring re-login.
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const orig = error.config;

        if (error.response?.status === 401 && !orig._retried) {
            orig._retried = true;
            try {
                const freshToken = await window.Clerk?.session?.getToken({ skipCache: true });
                if (freshToken) {
                    orig.headers['Authorization'] = `Bearer ${freshToken}`;
                    return api(orig);
                }
            } catch { /* refresh failed — session is truly gone */ }

            // Session expired for real — send home so Clerk can prompt sign-in
            window.location.href = '/';
        }

        return Promise.reject(error);
    }
);

export function updateLectureTopic(lectureId, topic) {
    return api.put(`/api/v1/lectures/${lectureId}/topic`, { topic });
}

export default api;
