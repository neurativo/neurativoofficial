import axios from 'axios';
import { useAuth } from '@clerk/react';

const BASE = import.meta.env.VITE_API_URL || 'https://neurativoofficial-production.up.railway.app';

async function getTokenWithRetry(getToken) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const token = await getToken().catch(() => null);
        if (token) return token;
        await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
    return await getToken({ skipCache: true }).catch(() => null);
}

function makeClient(getToken) {
    const client = axios.create({ baseURL: BASE });
    client.interceptors.request.use(async (config) => {
        const token = await getTokenWithRetry(getToken);
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    });
    client.interceptors.response.use(
        (response) => response,
        async (error) => {
            const orig = error.config;
            if (error.response?.status === 401 && orig && !orig._retried) {
                orig._retried = true;
                const freshToken = await getTokenWithRetry((opts) => getToken({ skipCache: true, ...opts }));
                if (freshToken) {
                    orig.headers = orig.headers || {};
                    orig.headers.Authorization = `Bearer ${freshToken}`;
                    return client(orig);
                }
            }
            return Promise.reject(error);
        }
    );
    return client;
}

export function useCreditsApi() {
    const { getToken } = useAuth();
    const client = makeClient(getToken);

    return {
        getBalance: ()           => client.get('/api/v1/credits/balance'),
        getHistory: ()           => client.get('/api/v1/credits/history'),
        purchaseIntent: (product) => client.post('/api/v1/credits/purchase-intent', { product }),
        getCatalogue: ()         => axios.get(`${BASE}/api/v1/credits/catalogue`),
    };
}
