/**
 * Fire-and-forget pageview beacon.
 * Sends a POST to /analytics/pageview. Never throws.
 *
 * Usage:
 *   import { trackPageview } from '../lib/trackPageview';
 *   useEffect(() => { trackPageview('landing'); }, []);
 */
import { API_BASE } from './adminApi.js';

let _sessionId = null;
function getSessionId() {
    if (!_sessionId) {
        _sessionId = sessionStorage.getItem('nv_sid');
        if (!_sessionId) {
            _sessionId = crypto.randomUUID();
            sessionStorage.setItem('nv_sid', _sessionId);
        }
    }
    return _sessionId;
}

export async function trackPageview(page) {
    try {
        const token = await window.Clerk?.session?.getToken?.().catch(() => null);
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        await fetch(`${API_BASE}/analytics/pageview`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                page,
                session_id: getSessionId(),
                referrer: document.referrer ? document.referrer.slice(0, 256) : undefined,
            }),
        });
    } catch {
        // silently ignore — analytics must never break the page
    }
}
