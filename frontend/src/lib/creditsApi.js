import axios from 'axios';
import { useAuth } from '@clerk/react';

const BASE = import.meta.env.VITE_API_URL || 'https://api.neurativo.com';

function makeClient(getToken) {
    const client = axios.create({ baseURL: BASE });
    client.interceptors.request.use(async (config) => {
        const token = await getToken();
        if (token) config.headers.Authorization = `Bearer ${token}`;
        return config;
    });
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
