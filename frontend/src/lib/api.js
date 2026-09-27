/**
 * Axios instance pre-configured with:
 * - Auth interceptor: attaches Bearer token from active Clerk session
 * - 401 handler: retries once with fresh token (skipCache) before redirecting
 */
import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app',
});

// Decode a JWT payload (base64url) without a library. Returns null on failure.
function decodeJwtPayload(token) {
    try {
        const part = token.split('.')[1];
        const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
        const json = decodeURIComponent(
            atob(base64)
                .split('')
                .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                .join('')
        );
        return JSON.parse(json);
    } catch {
        return null;
    }
}

// Returns true if the token is missing, unparseable, or expires within `skewSec`.
function isTokenNearExpiry(token, skewSec = 30) {
    if (!token) return true;
    const payload = decodeJwtPayload(token);
    if (!payload || typeof payload.exp !== 'number') return true;
    const nowSec = Math.floor(Date.now() / 1000);
    return payload.exp - nowSec <= skewSec;
}

// Request: attach a fresh access token from the active Clerk session.
// Clerk session JWTs are short-lived (~60s). getToken() returns the CACHED
// token, which may already be expired/near-expiry → intermittent 401s that the
// response interceptor then has to retry (logging a console 401 each time).
// We proactively force a refresh (skipCache) when the cached token is within
// 30s of expiry, so requests almost never go out with a stale token.
api.interceptors.request.use(async (config) => {
    let token = await window.Clerk?.session?.getToken().catch(() => null);
    if (isTokenNearExpiry(token)) {
        const fresh = await window.Clerk?.session?.getToken({ skipCache: true }).catch(() => null);
        if (fresh) token = fresh;
    }
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
